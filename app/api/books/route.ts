import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await supabaseAdmin
        .from("books")
        .select("id,title,storage_path,created_at,indexing_status,chunk_count")
        .order("created_at", { ascending: false });

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