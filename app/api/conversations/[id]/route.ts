import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

async function verifyOwnership(userId: string, conversationId: string) {
    const { data, error } = await supabaseAdmin
        .from("conversations")
        .select("id, title")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .single();

    if (error || !data) return null;
    return data as { id: string; title: string };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const conversation = await verifyOwnership(auth.user.id, id);
    if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

    const { data: turns, error } = await supabaseAdmin
        .from("conversation_turns")
        .select("id, role, question, answer_passages, created_at")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const messages = (turns ?? []).map((turn: any) => {
        if (turn.role === "user") {
            return { role: "user" as const, text: turn.question as string };
        }
        // assistant turn
        const rawPassages = (turn.answer_passages?.passages ?? []) as any[];
        const passages = rawPassages.map(({ full_text, ...rest }: any) => rest);
        return { role: "assistant" as const, passages };
    });

    return Response.json({ conversation: { id: conversation.id, title: conversation.title }, messages });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { id } = await params;

    const conversation = await verifyOwnership(auth.user.id, id);
    if (!conversation) return Response.json({ error: "Not found" }, { status: 404 });

    const { error: turnsErr } = await supabaseAdmin
        .from("conversation_turns")
        .delete()
        .eq("conversation_id", id);

    if (turnsErr) return Response.json({ error: turnsErr.message }, { status: 500 });

    const { error: convErr } = await supabaseAdmin
        .from("conversations")
        .delete()
        .eq("id", id);

    if (convErr) return Response.json({ error: convErr.message }, { status: 500 });

    return Response.json({});
}
