import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { id } = await ctx.params;

    const { data: me, error: meErr } = await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", auth.user.id)
        .single();

    if (meErr) return Response.json({ error: meErr.message }, { status: 500 });
    if (!me?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const status = String(body?.status ?? "").trim();

    if (!["approved", "blocked", "pending"].includes(status)) {
        return Response.json({ error: "Invalid status" }, { status: 400 });
    }

    const { error } = await supabaseAdmin
        .from("profiles")
        .update({ status })
        .eq("id", id);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true });
}