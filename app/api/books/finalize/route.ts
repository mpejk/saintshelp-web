import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

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

        // Verify all chunks have embeddings
        const { count: unembedded, error: countErr } = await supabaseAdmin
            .from("book_chunks")
            .select("id", { count: "exact", head: true })
            .eq("book_id", bookId)
            .is("embedding", null);

        if (countErr) return Response.json({ error: countErr.message }, { status: 500 });
        if ((unembedded ?? 0) > 0) {
            return Response.json({ error: `${unembedded} chunks still not embedded` }, { status: 400 });
        }

        // Get total chunk count
        const { count: totalChunks } = await supabaseAdmin
            .from("book_chunks")
            .select("id", { count: "exact", head: true })
            .eq("book_id", bookId);

        await supabaseAdmin.from("books").update({
            indexing_status: "ready",
            chunk_count: totalChunks ?? 0,
        }).eq("id", bookId);

        return Response.json({ bookId, status: "ready", chunkCount: totalChunks ?? 0 });
    } catch (err: any) {
        console.error("Finalize error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}
