import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id, title, created_at")
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ conversations: data ?? [] });
}

export async function DELETE(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    // Fetch all conversation IDs for this user
    const { data: convos, error: fetchErr } = await supabaseAdmin
        .from("conversations")
        .select("id")
        .eq("user_id", auth.user.id);

    if (fetchErr) return Response.json({ error: fetchErr.message }, { status: 500 });

    const ids = (convos ?? []).map((c: any) => c.id);
    if (ids.length === 0) return Response.json({});

    // Delete turns then conversations
    const { error: turnsErr } = await supabaseAdmin
        .from("conversation_turns")
        .delete()
        .in("conversation_id", ids);

    if (turnsErr) return Response.json({ error: turnsErr.message }, { status: 500 });

    const { error: convErr } = await supabaseAdmin
        .from("conversations")
        .delete()
        .eq("user_id", auth.user.id);

    if (convErr) return Response.json({ error: convErr.message }, { status: 500 });

    return Response.json({});
}
