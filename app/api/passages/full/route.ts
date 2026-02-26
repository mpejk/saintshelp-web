import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function POST(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const body = await req.json().catch(() => null);
    const passageId = (body?.passageId ?? "").toString().trim();
    if (!passageId) return Response.json({ error: "Missing passageId" }, { status: 400 });

    // Find most recent assistant turns and locate the passage by id
    const { data: turns, error: tErr } = await supabaseAdmin
        .from("conversation_turns")
        .select("conversation_id, answer_passages")
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(300);

    if (tErr) return Response.json({ error: tErr.message }, { status: 500 });

    for (const turn of turns ?? []) {
        const ap: any = turn.answer_passages;
        const passages = ap?.passages;
        if (!Array.isArray(passages)) continue;

        const hit = passages.find((p: any) => p?.id === passageId);
        if (!hit) continue;

        // Verify the conversation belongs to this user
        const { data: convo, error: cErr } = await supabaseAdmin
            .from("conversations")
            .select("user_id")
            .eq("id", turn.conversation_id)
            .single();

        if (cErr) return Response.json({ error: cErr.message }, { status: 500 });
        if (!convo || convo.user_id !== auth.user.id) {
            return Response.json({ error: "Not allowed" }, { status: 403 });
        }

        return Response.json({
            passageId,
            book_id: hit.book_id,
            book_title: hit.book_title,
            text: hit.full_text ?? hit.text
        });
    }

    return Response.json({ error: "Passage not found" }, { status: 404 });
}