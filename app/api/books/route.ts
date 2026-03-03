import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const url = new URL(req.url);
    const language = url.searchParams.get("language");

    let query = supabaseAdmin
        .from("books")
        .select("id,title,storage_path,created_at,indexing_status,chunk_count,language")
        .order("created_at", { ascending: false });

    if (language) query = query.eq("language", language);

    const { data, error } = await query;

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Fetch book-topic associations
    const { data: bookTopics } = await supabaseAdmin
        .from("book_topics")
        .select("book_id,topic_id");

    const topicMap = new Map<string, string[]>();
    for (const bt of bookTopics ?? []) {
        const arr = topicMap.get(bt.book_id) ?? [];
        arr.push(bt.topic_id);
        topicMap.set(bt.book_id, arr);
    }

    const books = (data ?? []).map((b: any) => ({
        ...b,
        topic_ids: topicMap.get(b.id) ?? [],
    }));

    return Response.json({ books });
}