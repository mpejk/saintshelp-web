import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
    const { data, error } = await supabaseAdmin.storage
        .from("config")
        .download("questions.json");

    if (error || !data) {
        return Response.json({ error: error?.message ?? "not found" }, { status: 500 });
    }

    const json = JSON.parse(await data.text()) as { questions: string[] };
    const all = json.questions;

    // Pick 3 random questions without replacement
    const picked: string[] = [];
    const indices = new Set<number>();
    while (picked.length < 3 && picked.length < all.length) {
        const i = Math.floor(Math.random() * all.length);
        if (!indices.has(i)) { indices.add(i); picked.push(all[i]); }
    }

    return Response.json({ questions: picked });
}
