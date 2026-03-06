import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { cleanChunkText } from "@/lib/textClean";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    const chunkId = (body?.chunk_id ?? "").toString().trim();
    const direction = body?.direction as "before" | "after";

    if (!chunkId) return Response.json({ error: "Missing chunk_id" }, { status: 400 });
    if (direction !== "before" && direction !== "after") {
        return Response.json({ error: "direction must be 'before' or 'after'" }, { status: 400 });
    }

    // Look up the source chunk to get book_id and chunk_index
    const { data: sourceChunk, error: srcErr } = await supabaseAdmin
        .from("book_chunks")
        .select("book_id, chunk_index")
        .eq("id", chunkId)
        .single();

    if (srcErr || !sourceChunk) {
        return Response.json({ error: "Chunk not found" }, { status: 404 });
    }

    const targetIndex = direction === "before"
        ? sourceChunk.chunk_index - 1
        : sourceChunk.chunk_index + 1;

    // Fetch the adjacent chunk
    const { data: adjacent, error: adjErr } = await supabaseAdmin
        .from("book_chunks")
        .select("id, chunk_text, chunk_index")
        .eq("book_id", sourceChunk.book_id)
        .eq("chunk_index", targetIndex)
        .single();

    if (adjErr || !adjacent) {
        return Response.json({ text: null, hasMore: false, nextChunkId: null });
    }

    const cleaned = cleanChunkText(adjacent.chunk_text ?? "");

    // Check if there's yet another chunk beyond this one
    const beyondIndex = direction === "before" ? targetIndex - 1 : targetIndex + 1;
    const { count } = await supabaseAdmin
        .from("book_chunks")
        .select("id", { count: "exact", head: true })
        .eq("book_id", sourceChunk.book_id)
        .eq("chunk_index", beyondIndex);

    return Response.json({
        text: cleaned || null,
        hasMore: (count ?? 0) > 0,
        nextChunkId: adjacent.id,
    });
}
