import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { openai } from "@/lib/openaiServer";
import crypto from "crypto";

export const runtime = "nodejs";

/**
 * Extract a coherent "logical unit" from a retrieved chunk.
 * Priority:
 * 1) Numbered "sayings" like "110." (Desert Fathers style)
 * 2) Paragraph (blank-line delimited)
 * 3) Fallback: short window around first match term
 */

function extractLogicalUnit(text: string, terms: string[]) {
    const MAX_PREVIEW = 900;
    const lower = text.toLowerCase();

    let idx = -1;
    for (const t of terms) {
        const i = lower.indexOf(t.toLowerCase());
        if (i !== -1) {
            idx = i;
            break;
        }
    }
    if (idx === -1) idx = 0;

    // 1) "Saying" boundaries: lines that start with "123."
    const lines = text.split("\n");
    let charPos = 0;
    const starts: number[] = [];

    for (const line of lines) {
        if (/^\s*\d+\.\s+/.test(line)) starts.push(charPos);
        charPos += line.length + 1;
    }

    const make = (full: string) => {
        const f = full.trim();
        const preview = f.length > MAX_PREVIEW ? f.slice(0, MAX_PREVIEW) + "…" : f;
        return { full: f, preview };
    };

    if (starts.length >= 2) {
        let s = 0;
        for (const st of starts) if (st <= idx) s = st;

        let e = text.length;
        for (const st of starts) {
            if (st > idx) {
                e = st;
                break;
            }
        }

        const unit = text.slice(s, e).trim();
        if (unit.length >= 60) return make(unit);
    }

    // 2) Paragraph boundaries: blank lines
    const paraBreaks: number[] = [];
    const re = /\n\s*\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) paraBreaks.push(m.index);

    let pStart = 0;
    for (const b of paraBreaks) if (b < idx) pStart = b;

    let pEnd = text.length;
    for (const b of paraBreaks) {
        if (b > idx) {
            pEnd = b;
            break;
        }
    }

    const para = text.slice(pStart, pEnd).trim();
    if (para.length >= 60) return make(para);

    // 3) Fallback: window around idx (still full=window; preview may truncate)
    const radius = 350;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + radius);

    let snip = text.slice(start, end).trim();
    if (start > 0) snip = "…" + snip;
    if (end < text.length) snip = snip + "…";

    return make(snip);
}

function parseRankedIndices(raw: string | null | undefined): number[] {
    if (!raw) return [];
    try {
        const obj = JSON.parse(raw);
        const arr = obj?.ranked_indices;
        if (!Array.isArray(arr)) return [];
        return arr.filter((x: any) => Number.isInteger(x)).map((x: any) => Number(x));
    } catch {
        return [];
    }
}

export async function POST(req: Request) {
    try {
        const auth = await requireApprovedUser(req);
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status });

        const body = await req.json().catch(() => null);
        const question = (body?.question ?? "").toString().trim();
        const selectedBookIds = (body?.selectedBookIds ?? []) as string[];

        // Optional threading
        const conversationIdIn = (body?.conversationId ?? "").toString().trim();

        // Validate BEFORE quota
        if (!question) return Response.json({ error: "Missing question" }, { status: 400 });
        if (!Array.isArray(selectedBookIds) || selectedBookIds.length === 0) {
            return Response.json({ error: "Select at least one book" }, { status: 400 });
        }

        // Daily quota guard (before any OpenAI calls)
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const { data: allowed, error: qErr } = await supabaseAdmin.rpc("increment_usage_daily", {
            p_user_id: auth.user.id,
            p_date: today, // Postgres will cast to date
            p_limit: 50,
        });

        if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
        if (!allowed) return Response.json({ error: "Daily limit reached" }, { status: 429 });

        // Resolve or create conversation (must belong to current user)
        let conversationId = conversationIdIn || "";

        if (conversationId) {
            const { data: convo, error: cErr } = await supabaseAdmin
                .from("conversations")
                .select("id,user_id")
                .eq("id", conversationId)
                .single();

            if (cErr || !convo || convo.user_id !== auth.user.id) {
                conversationId = "";
            }
        }

        if (!conversationId) {
            const { data: newConvo, error: nErr } = await supabaseAdmin
                .from("conversations")
                .insert({
                    user_id: auth.user.id,
                    title: question.slice(0, 60)
                })
                .select("id")
                .single();

            if (nErr || !newConvo?.id) {
                return Response.json({ error: nErr?.message ?? "Failed to create conversation" }, { status: 500 });
            }
            conversationId = newConvo.id;
        }

        // Log user turn (before OpenAI calls)
        {
            const { error: tErr } = await supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId,
                role: "user",
                question,
                selected_book_ids: selectedBookIds,
            });

            if (tErr) return Response.json({ error: tErr.message }, { status: 500 });
        }

        // Fetch selected books with vector store IDs
        const { data: books, error: bErr } = await supabaseAdmin
            .from("books")
            .select("id,title,openai_vector_store_id")
            .eq("owner_user_id", auth.user.id)
            .in("id", selectedBookIds);

        if (bErr) return Response.json({ error: bErr.message }, { status: 500 });

        const usable = (books ?? []).filter((b: any) => b.openai_vector_store_id);
        if (usable.length === 0) {
            return Response.json({ error: "Selected books are not indexed yet." }, { status: 400 });
        }

        // Retrieval (recall): pull more candidates than we return
        const CANDIDATES_PER_BOOK = 10;
        const candidates: {
            book_id: string;
            book_title: string;
            score: number | null;
            text: string;       // preview
            full_text: string;  // full unit
        }[] = [];

        for (const b of usable as any[]) {
            const results = await openai.vectorStores.search(String(b.openai_vector_store_id), {
                query: question,
                max_num_results: CANDIDATES_PER_BOOK,
            } as any);

            for (const r of (results as any)?.data ?? []) {
                const text =
                    (Array.isArray(r?.content)
                        ? r.content.map((c: any) => c?.text).filter(Boolean).join("\n")
                        : r?.text) ?? "";

                const cleaned = String(text).trim();
                if (!cleaned) continue;

                // Extract coherent unit (saying/paragraph) based on the question terms
                const terms = question.split(/\s+/).filter(Boolean);
                const unit = extractLogicalUnit(cleaned, terms);

                let fullText = unit.full;
                let previewText = unit.preview;

                // sanitize BOTH the same way
                const sanitize = (s: string) =>
                    s
                        .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
                        .replace(/[\uFEFF\uFFFD\uFFFE\uFFFF]/g, "")
                        .replace(/[\uFFFC\u200B\u200C\u200D\u2060]/g, "")
                        .replace(/[ \t]+\n/g, "\n")
                        .replace(/\n{3,}/g, "\n\n")
                        .trim();

                fullText = sanitize(fullText);
                previewText = sanitize(previewText);

                candidates.push({
                    book_id: b.id,
                    book_title: b.title,
                    score: typeof r?.score === "number" ? r.score : null,
                    text: previewText,
                    full_text: fullText
                });
            }
        }

        // De-dupe identical passages (common when multiple hits point to same chunk)
        const seen = new Set<string>();
        const deduped = candidates.filter((p) => {
            const key = `${p.book_id}::${p.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        if (deduped.length === 0) {
            const passages: any[] = [];

            // request log
            await supabaseAdmin.from("requests").insert({ user_id: auth.user.id, kind: "ask" });

            // assistant turn log
            await supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId,
                role: "assistant",
                answer_passages: { passages },
            });

            return Response.json({ conversationId, passages });
        }

        // Rerank (precision): LLM chooses best passages, but we still return quotes only.
        const RERANK_MODEL = process.env.OPENAI_RERANK_MODEL || "gpt-4o-mini";
        const MAX_CANDIDATES_TO_RERANK = 18;
        const toRerank = deduped.slice(0, MAX_CANDIDATES_TO_RERANK);

        const rerankInput = toRerank
            .map((p, i) => `#${i} (Book: ${p.book_title})\n${p.text}`)
            .join("\n\n");

        const rr = await openai.responses.create({
            model: RERANK_MODEL,
            input: [
                {
                    role: "system",
                    content:
                        "You rank quoted passages for relevance to a user question. " +
                        "Do not rewrite, summarize, or interpret the passages. " +
                        "Return JSON only, with ranked_indices (array of integers), most relevant first.",
                },
                {
                    role: "user",
                    content: `Question:\n${question}\n\nPassages:\n${rerankInput}\n\nReturn JSON: {"ranked_indices":[...]} only.`,
                },
            ],
            text: {
                format: {
                    type: "json_schema",
                    name: "ranking",
                    schema: {
                        type: "object",
                        properties: {
                            ranked_indices: {
                                type: "array",
                                items: { type: "integer" },
                            },
                        },
                        required: ["ranked_indices"],
                        additionalProperties: false,
                    },
                    strict: true,
                },
            },
        });

        const rawJson = (rr as any)?.output_text ?? (rr as any)?.output?.[0]?.content?.[0]?.text ?? null;
        const ranked = parseRankedIndices(rawJson);

        // If reranker fails, fall back to score sort (best-effort)
        let ordered: typeof toRerank = [];
        if (ranked.length > 0) {
            const used = new Set<number>();
            for (const i of ranked) {
                if (i >= 0 && i < toRerank.length && !used.has(i)) {
                    ordered.push(toRerank[i]);
                    used.add(i);
                }
            }
            for (let i = 0; i < toRerank.length; i++) {
                if (!used.has(i)) ordered.push(toRerank[i]);
            }
        } else {
            ordered = [...toRerank].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        }

        const storedPassages = ordered.slice(0, 3).map((p: any) => ({
            id: crypto.randomUUID(),
            book_id: p.book_id,
            book_title: p.book_title,
            score: p.score ?? null,
            text: p.text,           // preview
            full_text: p.full_text  // full saying/paragraph
        }));

        // What you return to the client (no full_text)
        const passages = storedPassages.map(({ full_text, ...rest }) => rest);

        // Request log
        await supabaseAdmin.from("requests").insert({ user_id: auth.user.id, kind: "ask" });

        // Log assistant turn (store verbatim payload)
        {
            const { error: aErr } = await supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId,
                role: "assistant",
                answer_passages: { passages: storedPassages }
            });

            if (aErr) return Response.json({ error: aErr.message }, { status: 500 });
        }

        // Strict: quotes only + citations (book title/id)
        return Response.json({
            conversationId,
            conversationTitle: ordered.length > 0 ? question.slice(0, 60) : null,
            passages
        });
    } catch (err: any) {
        console.error("Ask error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}