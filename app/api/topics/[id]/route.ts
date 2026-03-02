import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function DELETE(
    req: Request,
    ctx: { params: Promise<{ id: string }> }
) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

    const { id } = await ctx.params;

    // Delete associated book_topics first
    await supabaseAdmin.from("book_topics").delete().eq("topic_id", id);

    const { error } = await supabaseAdmin.from("topics").delete().eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ success: true });
}
