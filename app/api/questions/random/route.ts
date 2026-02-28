import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function GET() {
    const { data, error } = await supabaseAdmin.rpc("get_random_questions");

    if (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }

    const questions = ((data ?? []) as { question_text: string }[]).map(
        (row) => row.question_text
    );
    return Response.json({ questions });
}
