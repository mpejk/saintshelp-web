import { NextResponse } from "next/server";

export async function GET() {
  const checks: Record<string, "ok" | string> = {};

  // Voyage AI
  try {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "voyage-3", input: ["health check"], input_type: "query" }),
    });
    checks.voyage = res.ok ? "ok" : `${res.status}`;
  } catch (e) {
    checks.voyage = e instanceof Error ? e.message : "unknown error";
  }

  // Supabase
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { error } = await sb.from("books").select("id").limit(1);
    checks.supabase = error ? error.message : "ok";
  } catch (e) {
    checks.supabase = e instanceof Error ? e.message : "unknown error";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");

  return NextResponse.json(checks, { status: allOk ? 200 : 503 });
}
