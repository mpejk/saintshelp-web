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

    // 3) Fallback: window around idx
    const radius = 350;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + radius);

    let snip = text.slice(start, end).trim();
    if (start > 0) snip = "…" + snip;
    if (end < text.length) snip = snip + "…";

    return make(snip);
}

/**
 * Conservative TOC/index detector.
 * IMPORTANT: do NOT kill Bible passages / cross-references.
 * Only kill strong TOC/index layouts (dot leaders + page refs, explicit "Contents/Index").
 */
function looksLikeTOCOrIndex(s: string): boolean {
    const t = (s ?? "").trim();
    if (!t) return true;

    const lower = t.toLowerCase();

    // explicit markers
    if (/\b(table of contents|contents|index)\b/i.test(lower)) return true;

    // dotted leaders like "........"
    const dotLeaderCount = (t.match(/\.{5,}/g) ?? []).length;

    // page references like "p. 1708"
    const pageRefCount = (t.match(/\bp\.?\s*\d{1,5}\b/gi) ?? []).length;

    // TOC signal: dotted leaders are the strongest
    if (dotLeaderCount >= 2) return true;

    // index-like: lots of explicit page refs
    if (pageRefCount >= 4) return true;

    // combination: some dotted leaders + multiple page refs
    if (dotLeaderCount >= 1 && pageRefCount >= 2) return true;

    // many short lines + dotted leaders -> TOC layout
    const lines = t.split("\n").map((x) => x.trim()).filter(Boolean);
    const shortLines = lines.filter((x) => x.length <= 40).length;
    if (lines.length >= 6 && dotLeaderCount >= 1 && shortLines / lines.length > 0.7) return true;

    return false;
}

/**
 * Remove obvious header/footer noise without destroying prose.
 * Keep empty lines (paragraph structure) intact.
 */
function stripLikelyHeaderFooterLines(s: string): string {
    const lines = (s ?? "").split("\n");

    const cleaned = lines.filter((line) => {
        const t = line.trim();

        // Keep paragraph breaks
        if (!t) return true;

        // page number only
        if (/^\s*\d{1,5}\s*$/.test(t)) return false;
        if (/^\s*p\.?\s*\d{1,5}\s*$/i.test(t)) return false;

        // running header (example)
        if (/douay[-\s]?rheims/i.test(t) && /\bbible\b/i.test(t)) return false;

        // lines that are basically dotted leaders
        if ((t.match(/\.{5,}/g) ?? []).length >= 1 && t.length < 120) return false;

        return true;
    });

    return cleaned.join("\n").trim();
}

/**
 * Normalizes weird unicode + keeps whitespace safe.
 * (Avoids "glued words" from NBSP/thin spaces.)
 */
function sanitizeText(s: string) {
    return String(s ?? "")
        .normalize("NFKC")

        // Convert special space characters to normal space
        .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ")

        // Remove only unsafe control chars (but KEEP \n and \t)
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")

        // Remove BOM / invalid unicode
        .replace(/[\uFEFF\uFFFD\uFFFE\uFFFF]/g, "")

        // Remove zero-width chars
        .replace(/[\u200B\u200C\u200D\u2060]/g, "")

        // Clean trailing spaces before newline
        .replace(/[ \t]+\n/g, "\n")

        // Collapse excessive blank lines
        .replace(/\n{3,}/g, "\n\n")

        .trim();
}

/**
 * Fixes PDF hard line wraps that cause ugly random new lines.
 * Keeps paragraph breaks intact.
 */
function dewrapPdfLines(s: string) {
    if (!s) return "";

    // Normalize line endings
    s = s.replace(/\r\n?/g, "\n");

    // Convert single newlines to spaces, keep paragraph breaks (\n\n)
    s = s.replace(/\n(?!\n)/g, " ");

    // Collapse extra spaces
    s = s.replace(/[ \t]+/g, " ");

    // Normalize excessive blank lines
    s = s.replace(/\n\n+/g, "\n\n");

    return s.trim();
}

/**
 * Pre-dewrap: remove lines that are clearly chapter/section/book headings.
 * Without this they get merged into prose by dewrapPdfLines.
 */
function stripHeaderLines(s: string): string {
    return s
        .split("\n")
        .filter((line) => {
            const t = line.trim();
            if (!t) return true; // keep paragraph breaks

            // "CHAPTER IX." / "CHAPTER 7" / "BOOK III" / "PART ONE" / "SECTION 2"
            if (/^(CHAPTER|BOOK|PART|SECTION)\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b/i.test(t)) return false;

            // "The Seventh Chapter ..." / "The Third Book ..."
            if (/^[Tt]he\s+\w+\s+(Chapter|Book|Part)\b/i.test(t)) return false;

            // Very short ALL-CAPS lines (≤ 5 words) that look like heading labels
            if (/^[A-Z][A-Z\s]{2,40}$/.test(t) && t.split(/\s+/).length <= 5) return false;

            return true;
        })
        .join("\n");
}

/**
 * Post-dewrap: strip chapter/section markers and duplicate phrases that
 * got embedded in prose after line-collapsing.
 */
function stripInlineHeaders(s: string): string {
    let t = s;

    // "CHAPTER IX." / "CHAPTER IX. On Gentleness towards Ourselves." embedded mid-prose
    t = t.replace(
        /\s+(?:CHAPTER|BOOK|PART|SECTION)\s+(?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b\.?(?:\s+[A-Z][^.!?]{0,80}[.!?])?/g,
        " "
    );

    // "The Seventh Chapter [Title text]" mid-prose
    t = t.replace(/\s+[Tt]he\s+\w+\s+(?:Chapter|Book|Part)\b(?:\s+[A-Z][^.!?]{0,80}[.!?])?/g, " ");

    // Consecutive duplicate phrase: "Unbridled Affections Unbridled Affections"
    // Match 2–8 consecutive words repeated immediately after
    t = t.replace(/\b((?:\w+\s+){2,8})\1/g, "$1");

    // PDF running page headers: Title Case phrase ending with a word+pagenumber
    // concatenation (no space between last word and page number).
    // e.g., "Introduction to the Devout Life St. Francis of Sales167"
    // The telltale sign is a lowercase letter immediately followed by 2–4 digits.
    t = t.replace(/\s+[A-Z][a-zA-Z ,.''-]{4,80}[a-z]\d{2,4}(?=\s|$)/g, " ");

    // Collapse stray double-spaces introduced by removals
    t = t.replace(/\s{2,}/g, " ").trim();

    return t;
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

        if (!question) return Response.json({ error: "Missing question" }, { status: 400 });
        if (!Array.isArray(selectedBookIds) || selectedBookIds.length === 0) {
            return Response.json({ error: "Select at least one book" }, { status: 400 });
        }

        // Daily quota guard (before any OpenAI calls)
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        const { data: allowed, error: qErr } = await supabaseAdmin.rpc("increment_usage_daily", {
            p_user_id: auth.user.id,
            p_date: today,
            p_limit: 50,
        });

        if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
        if (!allowed) return Response.json({ error: "Daily limit reached" }, { status: 429 });

        // Resolve/create conversation AND fetch books in parallel
        const [convResult, booksResult] = await Promise.all([
            // Resolve or create conversation
            (async () => {
                let cid = conversationIdIn || "";
                if (cid) {
                    const { data: convo, error: cErr } = await supabaseAdmin
                        .from("conversations")
                        .select("id,user_id")
                        .eq("id", cid)
                        .single();
                    if (cErr || !convo || convo.user_id !== auth.user.id) cid = "";
                }
                if (!cid) {
                    const { data: newConvo, error: nErr } = await supabaseAdmin
                        .from("conversations")
                        .insert({ user_id: auth.user.id, title: question.slice(0, 60) })
                        .select("id")
                        .single();
                    if (nErr || !newConvo?.id) throw new Error(nErr?.message ?? "Failed to create conversation");
                    cid = newConvo.id;
                }
                return cid;
            })(),
            // Fetch books
            supabaseAdmin
                .from("books")
                .select("id,title,openai_vector_store_id")
                .in("id", selectedBookIds),
        ]);

        const conversationId = convResult;
        if (booksResult.error) return Response.json({ error: booksResult.error.message }, { status: 500 });

        const usable = (booksResult.data ?? []).filter((b: any) => b.openai_vector_store_id);
        if (usable.length === 0) {
            return Response.json({ error: "Selected books are not indexed yet." }, { status: 400 });
        }

        // Log user turn
        {
            const { error: tErr } = await supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId,
                role: "user",
                question,
                selected_book_ids: selectedBookIds,
            });
            if (tErr) return Response.json({ error: tErr.message }, { status: 500 });
        }

        // Search all books in parallel
        const CANDIDATES_PER_BOOK = 8;
        const terms = question.split(/\s+/).filter(Boolean);

        const perBookResults = await Promise.all(
            (usable as any[]).map(async (b) => {
                const results = await openai.vectorStores.search(String(b.openai_vector_store_id), {
                    query: question,
                    max_num_results: CANDIDATES_PER_BOOK,
                } as any);

                const out: {
                    book_id: string;
                    book_title: string;
                    score: number | null;
                    text: string;
                    full_text: string;
                }[] = [];

                for (const r of (results as any)?.data ?? []) {
                    const rawText =
                        (Array.isArray(r?.content)
                            ? r.content.map((c: any) => c?.text).filter(Boolean).join("\n")
                            : r?.text) ?? "";

                    if (!rawText) continue;

                    const cleanedChunk = stripHeaderLines(sanitizeText(rawText));
                    if (!cleanedChunk) continue;

                    const unit = extractLogicalUnit(cleanedChunk, terms);

                    let fullText = stripLikelyHeaderFooterLines(sanitizeText(unit.full));
                    let previewText = stripLikelyHeaderFooterLines(sanitizeText(unit.preview));

                    fullText = stripInlineHeaders(dewrapPdfLines(fullText));
                    previewText = stripInlineHeaders(dewrapPdfLines(previewText));

                    if (looksLikeTOCOrIndex(fullText) || looksLikeTOCOrIndex(previewText)) continue;
                    if (fullText.length < 60 || previewText.length < 40) continue;

                    out.push({
                        book_id: b.id,
                        book_title: b.title,
                        score: typeof r?.score === "number" ? r.score : null,
                        text: previewText,
                        full_text: fullText,
                    });
                }
                return out;
            })
        );

        const candidates = perBookResults.flat();

        // De-dupe identical passages
        const seen = new Set<string>();
        const deduped = candidates.filter((p) => {
            const key = `${p.book_id}::${p.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Sort by relevance score (highest first) — no LLM reranking needed
        const ordered = deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

        const storedPassages = ordered.slice(0, 3).map((p: any) => ({
            id: crypto.randomUUID(),
            book_id: p.book_id,
            book_title: p.book_title,
            score: p.score ?? null,
            text: p.text,
            full_text: p.full_text,
        }));

        // return to client (no full_text)
        const passages = storedPassages.map(({ full_text, ...rest }) => rest);

        // Write requests log + assistant turn in parallel
        const [, assistantTurnResult] = await Promise.all([
            supabaseAdmin.from("requests").insert({ user_id: auth.user.id, kind: "ask" }),
            supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId,
                role: "assistant",
                answer_passages: { passages: storedPassages },
            }),
        ]);

        if (assistantTurnResult.error) {
            return Response.json({ error: assistantTurnResult.error.message }, { status: 500 });
        }

        return Response.json({
            conversationId,
            conversationTitle: ordered.length > 0 ? question.slice(0, 60) : null,
            passages,
        });
    } catch (err: any) {
        console.error("Ask error:", err);
        return Response.json({ error: err?.message ?? "Unexpected server error" }, { status: 500 });
    }
}