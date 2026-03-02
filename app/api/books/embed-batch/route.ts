import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { embedTexts } from "@/lib/voyage";

export const runtime = "nodejs";

const BATCH_SIZE = 50;

export async function POST(req: Request) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
        if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

        const body = await req.json().catch(() => null);
        const bookId = (body?.bookId ?? "").toString().trim();
        if (!bookId) return Response.json({ error: "Missing bookId" }, { status: 400 });

        const { data: book, error: bErr } = await supabaseAdmin
            .from("books").select("id,indexing_status").eq("id", bookId).single();
        if (bErr || !book) return Response.json({ error: "Book not found" }, { status: 404 });
        if (book.indexing_status !== "embedding") {
            return Response.json({ error: `Book is ${book.indexing_status}, not embedding` }, { status: 400 });
        }

        // Get un-embedded chunks (embedding is null)
        const { data: chunks, error: cErr } = await supabaseAdmin
            .from("book_chunks")
            .select("id,chunk_text")
            .eq("book_id", bookId)
            .is("embedding", null)
            .order("chunk_index", { ascending: true })
            .limit(BATCH_SIZE);

        if (cErr) return Response.json({ error: cErr.message }, { status: 500 });
        if (!chunks || chunks.length === 0) {
            return Response.json({ bookId, embedded: 0, remaining: 0 });
        }

        const texts = chunks.map((c: any) => c.chunk_text);
        const embeddings = await embedTexts(texts);

        // Update each chunk with its embedding
        for (let i = 0; i < chunks.length; i++) {
            const { error: uErr } = await supabaseAdmin
                .from("book_chunks")
                .update({ embedding: JSON.stringify(embeddings[i]) })
                .eq("id", chunks[i].id);
            if (uErr) {
                console.error("Embed update error:", uErr);
                return Response.json({ error: uErr.message }, { status: 500 });
            }
        }

        // Check remaining
        const { count, error: countErr } = await supabaseAdmin
            .from("book_chunks")
            .select("id", { count: "exact", head: true })
            .eq("book_id", bookId)
            .is("embedding", null);

        const remaining = countErr ? -1 : (count ?? 0);

        return Response.json({ bookId, embedded: chunks.length, remaining });
    } catch (err: any) {
        console.error("Embed-batch error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}
