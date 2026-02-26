import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requireApprovedUser(req: Request) {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return { ok: false as const, status: 401, error: "Missing Bearer token" };
    }

    const token = authHeader.substring("Bearer ".length);

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
        return { ok: false as const, status: 401, error: "Invalid token" };
    }

    const user = data.user;

    const { data: profile, error: pErr } = await supabaseAdmin
        .from("profiles")
        .select("status,is_admin,email")
        .eq("id", user.id)
        .single();

    if (pErr || !profile) {
        return { ok: false as const, status: 403, error: "Profile missing" };
    }

    if (profile.status !== "approved") {
        return { ok: false as const, status: 403, error: "User not approved" };
    }

    return {
        ok: true as const,
        user,
        profile,
    };
}