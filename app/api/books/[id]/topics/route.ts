import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function POST(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

    const { id: bookId } = await ctx.params;
    const body = await req.json().catch(() => null);
    const topicIds = (body?.topicIds ?? []) as string[];

    if (!Array.isArray(topicIds)) return Response.json({ error: "topicIds must be an array" }, { status: 400 });

    // Replace all topic associations for this book
    await supabaseAdmin.from("book_topics").delete().eq("book_id", bookId);

    if (topicIds.length > 0) {
        const rows = topicIds.map((tid) => ({ book_id: bookId, topic_id: tid }));
        const { error } = await supabaseAdmin.from("book_topics").insert(rows);
        if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ success: true, bookId, topicIds });
}
