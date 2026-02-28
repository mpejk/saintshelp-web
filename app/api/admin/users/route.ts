import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    // Provjeri admin pravo
    const { data: me, error: meErr } = await supabaseAdmin
        .from("profiles")
        .select("is_admin")
        .eq("id", auth.user.id)
        .single();

    if (meErr) return Response.json({ error: meErr.message }, { status: 500 });
    if (!me?.is_admin) return Response.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id,email,status,is_admin,created_at")
        .order("created_at", { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Only show users who have confirmed their email
    const { data: authData } = await supabaseAdmin.auth.admin.listUsers({ perPage: 1000 });
    const confirmedIds = new Set(
        (authData?.users ?? [])
            .filter(u => u.email_confirmed_at)
            .map(u => u.id)
    );

    const users = (data ?? []).filter(u => confirmedIds.has(u.id));

    return Response.json({ users });
}