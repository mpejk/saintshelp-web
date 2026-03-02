import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { extractTextFromPdf, chunkText } from "@/lib/chunker";
import { embedTexts } from "@/lib/voyage";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
        if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

        const body = await req.json().catch(() => null);
        const bookId = (body?.bookId ?? "").toString().trim();
        if (!bookId) return Response.json({ error: "Missing bookId" }, { status: 400 });

        const { data: book, error: bErr } = await supabaseAdmin
            .from("books").select("id,title,storage_path,indexing_status").eq("id", bookId).single();
        if (bErr || !book) return Response.json({ error: "Book not found" }, { status: 404 });

        // Delete any existing chunks for this book
        await supabaseAdmin.from("book_chunks").delete().eq("book_id", bookId);
        await supabaseAdmin.from("books").update({ indexing_status: "chunking", indexing_error: null }).eq("id", bookId);

        // Download PDF from storage
        const { data: fileData, error: dlErr } = await supabaseAdmin.storage
            .from("books").download(book.storage_path);
        if (dlErr || !fileData) {
            await supabaseAdmin.from("books").update({ indexing_status: "failed", indexing_error: "Failed to download PDF" }).eq("id", bookId);
            return Response.json({ error: "Failed to download PDF" }, { status: 500 });
        }

        const buffer = Buffer.from(await fileData.arrayBuffer());
        const text = await extractTextFromPdf(buffer);
        const chunks = chunkText(text);

        await supabaseAdmin.from("books").update({ indexing_status: "embedding", chunk_count: chunks.length }).eq("id", bookId);

        // Embed all chunks
        const embeddings = await embedTexts(chunks);

        // Insert chunks with embeddings
        const rows = chunks.map((chunk, i) => ({
            book_id: bookId,
            chunk_index: i,
            chunk_text: chunk,
            embedding: JSON.stringify(embeddings[i]),
        }));

        for (let i = 0; i < rows.length; i += 100) {
            const batch = rows.slice(i, i + 100);
            const { error: chunkErr } = await supabaseAdmin.from("book_chunks").insert(batch);
            if (chunkErr) {
                await supabaseAdmin.from("books").update({ indexing_status: "failed", indexing_error: chunkErr.message }).eq("id", bookId);
                return Response.json({ error: chunkErr.message }, { status: 500 });
            }
        }

        await supabaseAdmin.from("books").update({ indexing_status: "ready", chunk_count: chunks.length }).eq("id", bookId);

        return Response.json({ bookId, title: book.title, chunkCount: chunks.length, status: "ready" });
    } catch (err: any) {
        console.error("Reindex error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}
