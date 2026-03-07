import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { sanitizeText, dewrapPdfLines, stripPageMarkers, stripAuthorTitleLines, stripFootnoteLines, stripHeaderLines, stripLikelyHeaderFooterLines } from "@/lib/textClean";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    // Verify book exists and is ready
    const { data: book, error: bErr } = await supabaseAdmin
        .from("books")
        .select("id, title, indexing_status")
        .eq("id", id)
        .single();

    if (bErr || !book) return Response.json({ error: "Book not found" }, { status: 404 });
    if (book.indexing_status !== "ready") return Response.json({ error: "Book not indexed" }, { status: 400 });

    // Fetch all chunks ordered by chunk_index
    const { data: chunks, error: cErr } = await supabaseAdmin
        .from("book_chunks")
        .select("id, chunk_index, chunk_text")
        .eq("book_id", id)
        .order("chunk_index", { ascending: true });

    if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

    // Clean each chunk and build the full text with chunk markers
    const sections: { chunkId: string; chunkIndex: number; text: string }[] = [];
    for (const c of chunks ?? []) {
        let text = sanitizeText(c.chunk_text ?? "");
        text = stripPageMarkers(text);
        text = stripAuthorTitleLines(text);
        text = stripFootnoteLines(text);
        text = stripHeaderLines(text);
        text = stripLikelyHeaderFooterLines(text);
        text = text.replace(/\n{3,}/g, "\n\n").trim();
        text = dewrapPdfLines(text);
        // Clean common PDF artifacts
        text = text.replace(/(\w)- (\w)/g, "$1$2");
        text = text.replace(/\[\s*\d+(?:\s+\d+)*\s*\]?/g, "");
        text = text.replace(/\s{2,}/g, " ").trim();
        if (!text) continue;
        sections.push({ chunkId: c.id, chunkIndex: c.chunk_index, text });
    }

    return Response.json({ title: book.title, sections });
}
