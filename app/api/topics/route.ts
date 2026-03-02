import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await supabaseAdmin
        .from("topics")
        .select("id,name,display_order")
        .order("display_order", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ topics: data ?? [] });
}

export async function POST(req: Request) {
    const auth = await requireApprovedUser(req);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });
    if (!auth.profile.is_admin) return Response.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json().catch(() => null);
    const name = (body?.name ?? "").toString().trim();
    if (!name) return Response.json({ error: "Missing name" }, { status: 400 });

    const { data, error } = await supabaseAdmin
        .from("topics")
        .insert({ name })
        .select("id,name,display_order")
        .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ topic: data });
}
