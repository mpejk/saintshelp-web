import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { embedQuery } from "@/lib/voyage";
import crypto from "crypto";

export const runtime = "nodejs";

function extractLogicalUnit(text: string, terms: string[]) {
    const MAX_PREVIEW = 900;
    const lower = text.toLowerCase();
    let idx = -1;
    for (const t of terms) {
        const i = lower.indexOf(t.toLowerCase());
        if (i !== -1) { idx = i; break; }
    }
    if (idx === -1) idx = 0;

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
        for (const st of starts) { if (st > idx) { e = st; break; } }
        const unit = text.slice(s, e).trim();
        if (unit.length >= 60) return make(unit);
    }

    const paraBreaks: number[] = [];
    const re = /\n\s*\n/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) paraBreaks.push(m.index);
    let pStart = 0;
    for (const b of paraBreaks) if (b < idx) pStart = b;
    let pEnd = text.length;
    for (const b of paraBreaks) { if (b > idx) { pEnd = b; break; } }
    const para = text.slice(pStart, pEnd).trim();
    if (para.length >= 60) return make(para);

    const radius = 350;
    const start = Math.max(0, idx - radius);
    const end = Math.min(text.length, idx + radius);
    let snip = text.slice(start, end).trim();
    if (start > 0) snip = "…" + snip;
    if (end < text.length) snip = snip + "…";
    return make(snip);
}

function looksLikeTOCOrIndex(s: string): boolean {
    const t = (s ?? "").trim();
    if (!t) return true;
    const lower = t.toLowerCase();
    if (/\b(table of contents|contents|index)\b/i.test(lower)) return true;
    const dotLeaderCount = (t.match(/\.{5,}/g) ?? []).length;
    const pageRefCount = (t.match(/\bp\.?\s*\d{1,5}\b/gi) ?? []).length;
    if (dotLeaderCount >= 2) return true;
    if (pageRefCount >= 4) return true;
    if (dotLeaderCount >= 1 && pageRefCount >= 2) return true;
    const lines = t.split("\n").map((x) => x.trim()).filter(Boolean);
    const shortLines = lines.filter((x) => x.length <= 40).length;
    if (lines.length >= 6 && dotLeaderCount >= 1 && shortLines / lines.length > 0.7) return true;
    return false;
}

function stripLikelyHeaderFooterLines(s: string): string {
    const lines = (s ?? "").split("\n");
    const cleaned = lines.filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^\s*\d{1,5}\s*$/.test(t)) return false;
        if (/^\s*p\.?\s*\d{1,5}\s*$/i.test(t)) return false;
        if (/douay[-\s]?rheims/i.test(t) && /\bbible\b/i.test(t)) return false;
        if ((t.match(/\.{5,}/g) ?? []).length >= 1 && t.length < 120) return false;
        return true;
    });
    return cleaned.join("\n").trim();
}

function sanitizeText(s: string) {
    return String(s ?? "")
        .normalize("NFKC")
        .replace(/[\u00A0\u1680\u180E\u2000-\u200A\u202F\u205F\u3000]/g, " ")
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
        .replace(/[\uFEFF\uFFFD\uFFFE\uFFFF]/g, "")
        .replace(/[\u200B\u200C\u200D\u2060]/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function dewrapPdfLines(s: string) {
    if (!s) return "";
    s = s.replace(/\r\n?/g, "\n");
    s = s.replace(/\n(?!\n)/g, " ");
    s = s.replace(/[ \t]+/g, " ");
    s = s.replace(/\n\n+/g, "\n\n");
    return s.trim();
}

function stripHeaderLines(s: string): string {
    return s.split("\n").filter((line) => {
        const t = line.trim();
        if (!t) return true;
        if (/^(CHAPTER|BOOK|PART|SECTION)\s+([IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b/i.test(t)) return false;
        if (/^[Tt]he\s+\w+\s+(Chapter|Book|Part)\b/i.test(t)) return false;
        if (/^[A-Z][A-Z\s]{2,40}$/.test(t) && t.split(/\s+/).length <= 5) return false;
        return true;
    }).join("\n");
}

function stripInlineHeaders(s: string): string {
    let t = s;
    t = t.replace(/\s+(?:CHAPTER|BOOK|PART|SECTION)\s+(?:[IVXLCDM]+|\d+|ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN)\b\.?(?:\s+[A-Z][^.!?]{0,80}[.!?])?/g, " ");
    t = t.replace(/\s+[Tt]he\s+\w+\s+(?:Chapter|Book|Part)\b(?:\s+[A-Z][^.!?]{0,80}[.!?])?/g, " ");
    t = t.replace(/\b((?:\w+\s+){2,8})\1/g, "$1");
    t = t.replace(/\s+[A-Z][a-zA-Z ,.''-]{4,80}[a-z]\d{2,4}(?=\s|$)/g, " ");
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
        const conversationIdIn = (body?.conversationId ?? "").toString().trim();

        if (!question) return Response.json({ error: "Missing question" }, { status: 400 });
        if (!Array.isArray(selectedBookIds) || selectedBookIds.length === 0) {
            return Response.json({ error: "Select at least one book" }, { status: 400 });
        }

        if (!auth.profile.is_admin) {
            const today = new Date().toISOString().slice(0, 10);
            const { data: allowed, error: qErr } = await supabaseAdmin.rpc("increment_usage_daily", {
                p_user_id: auth.user.id, p_date: today, p_limit: 50,
            });
            if (qErr) return Response.json({ error: qErr.message }, { status: 500 });
            if (!allowed) return Response.json({ error: "Daily limit reached" }, { status: 429 });
        }

        // Embed the question via Voyage AI — one API call
        const queryEmbedding = await embedQuery(question);

        const [convResult, booksResult] = await Promise.all([
            (async () => {
                let cid = conversationIdIn || "";
                if (cid) {
                    const { data: convo, error: cErr } = await supabaseAdmin
                        .from("conversations").select("id,user_id").eq("id", cid).single();
                    if (cErr || !convo || convo.user_id !== auth.user.id) cid = "";
                }
                if (!cid) {
                    const { data: newConvo, error: nErr } = await supabaseAdmin
                        .from("conversations").insert({ user_id: auth.user.id, title: question.slice(0, 60) })
                        .select("id").single();
                    if (nErr || !newConvo?.id) throw new Error(nErr?.message ?? "Failed to create conversation");
                    cid = newConvo.id;
                }
                return cid;
            })(),
            supabaseAdmin.from("books").select("id,title,indexing_status").in("id", selectedBookIds),
        ]);

        const conversationId = convResult;
        if (booksResult.error) return Response.json({ error: booksResult.error.message }, { status: 500 });

        const usable = (booksResult.data ?? []).filter((b: any) => b.indexing_status === "ready");
        if (usable.length === 0) {
            return Response.json({ error: "Selected books are not indexed yet." }, { status: 400 });
        }

        {
            const { error: tErr } = await supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId, role: "user", question, selected_book_ids: selectedBookIds,
            });
            if (tErr) return Response.json({ error: tErr.message }, { status: 500 });
        }

        const terms = question.split(/\s+/).filter(Boolean);

        // Search via pgvector — one SQL query regardless of book count
        const usableIds = usable.map((b: any) => b.id);
        const { data: chunkResults, error: searchErr } = await supabaseAdmin.rpc("search_chunks", {
            query_embedding: JSON.stringify(queryEmbedding),
            book_ids: usableIds,
            match_count: 24,
            similarity_threshold: 0.2,
        });

        if (searchErr) return Response.json({ error: searchErr.message }, { status: 500 });

        const bookTitleMap = new Map<string, string>();
        for (const b of usable as any[]) bookTitleMap.set(b.id, b.title);

        const candidates: { book_id: string; book_title: string; score: number | null; text: string; full_text: string }[] = [];

        for (const r of chunkResults ?? []) {
            const rawText = r.chunk_text ?? "";
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

            candidates.push({
                book_id: r.book_id,
                book_title: bookTitleMap.get(r.book_id) ?? "Unknown",
                score: typeof r.similarity === "number" ? r.similarity : null,
                text: previewText,
                full_text: fullText,
            });
        }

        const seen = new Set<string>();
        const deduped = candidates.filter((p) => {
            const key = `${p.book_id}::${p.text}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        const ordered = deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const MIN_SCORE = 0.3;
        const qualified = ordered.filter((p) => (p.score ?? 0) >= MIN_SCORE);

        const perBook = new Map<string, typeof qualified[0]>();
        for (const p of qualified) { if (!perBook.has(p.book_id)) perBook.set(p.book_id, p); }
        const topPerBook = [...perBook.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
        const diverse = topPerBook.slice(0, 3);
        if (diverse.length < 3) {
            const usedTexts = new Set(diverse.map((p) => p.text));
            for (const p of qualified) {
                if (diverse.length >= 3) break;
                if (!usedTexts.has(p.text)) { usedTexts.add(p.text); diverse.push(p); }
            }
        }

        const storedPassages = diverse.slice(0, 3).map((p: any) => ({
            id: crypto.randomUUID(),
            book_id: p.book_id, book_title: p.book_title,
            score: p.score ?? null, text: p.text, full_text: p.full_text,
        }));

        const passages = storedPassages.map(({ full_text, ...rest }) => rest);

        const [, assistantTurnResult] = await Promise.all([
            supabaseAdmin.from("requests").insert({ user_id: auth.user.id, kind: "ask" }),
            supabaseAdmin.from("conversation_turns").insert({
                conversation_id: conversationId, role: "assistant",
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
