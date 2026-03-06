import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireApprovedUser } from "@/lib/authServer";
import { embedQuery } from "@/lib/voyage";
import {
    sanitizeText, dewrapPdfLines, stripPageMarkers, stripAuthorTitleLines,
    stripFootnoteLines, stripHeaderLines, stripInlineHeaders,
    stripLikelyHeaderFooterLines, trimLeadingFragment, trimTrailingFragment,
} from "@/lib/textClean";
import crypto from "crypto";

export const runtime = "nodejs";

/** Snap a preview string to the last sentence boundary within maxLen */
function snapToSentenceEnd(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    const window = text.slice(0, maxLen);
    const sentEndRe = /[.!?;]["'\u2019\u201D)]*(?:\s|$)/g;
    let lastEnd = -1;
    let m: RegExpExecArray | null;
    while ((m = sentEndRe.exec(window)) !== null) {
        lastEnd = m.index + m[0].trimEnd().length;
    }
    const terminalIdx = Math.max(window.lastIndexOf("."), window.lastIndexOf("?"), window.lastIndexOf("!"), window.lastIndexOf(";"));
    if (terminalIdx > lastEnd && terminalIdx === window.length - 1) lastEnd = terminalIdx + 1;
    if (lastEnd > maxLen * 0.4) return text.slice(0, lastEnd);
    return window;
}

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
        if (f.length <= MAX_PREVIEW) return { full: f, preview: f };
        const snapped = snapToSentenceEnd(f, MAX_PREVIEW);
        // Always add "…" when preview is shorter than full so "Show full" button appears
        const preview = snapped.length < f.length ? snapped + "…" : snapped;
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

    // Radius fallback — snap to sentence boundaries
    const radius = 400;
    let start = Math.max(0, idx - radius);
    let end = Math.min(text.length, idx + radius);

    // Snap start forward to next sentence boundary
    if (start > 0) {
        const head = text.slice(start, Math.min(start + 200, end));
        const sentStart = head.search(/[.!?;]\s+[A-Z"'\u2018\u201C]/);
        if (sentStart >= 0) {
            const afterPunct = head.slice(sentStart + 1).search(/[A-Z"'\u2018\u201C]/);
            if (afterPunct >= 0) start = start + sentStart + 1 + afterPunct;
        }
    }

    // Snap end backward to last sentence boundary
    if (end < text.length) {
        const tail = text.slice(Math.max(start, end - 200), end);
        const sentEndRe2 = /[.!?;]["'\u2019\u201D)]*\s/g;
        let lastEnd = -1;
        let m2: RegExpExecArray | null;
        while ((m2 = sentEndRe2.exec(tail)) !== null) lastEnd = m2.index + m2[0].trimEnd().length;
        if (lastEnd >= 0) end = Math.max(start, end - 200) + lastEnd;
    }

    let snip = text.slice(start, end).trim();
    if (start > 0 && !/^[A-Z"'\u2018\u201C(\d]/.test(snip)) snip = "…" + snip;
    if (end < text.length && !/[.!?'"\u2019\u201D)]$/.test(snip)) snip = snip + "…";
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

        // Resolve conversation + fetch prior questions for context (if follow-up)
        let conversationId = "";
        let priorQuestions: string[] = [];
        if (conversationIdIn) {
            const { data: convo, error: cErr } = await supabaseAdmin
                .from("conversations").select("id,user_id").eq("id", conversationIdIn).single();
            if (!cErr && convo && convo.user_id === auth.user.id) {
                conversationId = convo.id;
                // Fetch last 3 user questions for context
                const { data: turns } = await supabaseAdmin
                    .from("conversation_turns")
                    .select("question")
                    .eq("conversation_id", conversationId)
                    .eq("role", "user")
                    .order("created_at", { ascending: false })
                    .limit(3);
                priorQuestions = (turns ?? []).map((t: any) => t.question).filter(Boolean).reverse();
            }
        }
        if (!conversationId) {
            const { data: newConvo, error: nErr } = await supabaseAdmin
                .from("conversations").insert({ user_id: auth.user.id, title: question.slice(0, 60) })
                .select("id").single();
            if (nErr || !newConvo?.id) throw new Error(nErr?.message ?? "Failed to create conversation");
            conversationId = newConvo.id;
        }

        // Build search query: use prior questions only as light context to resolve
        // pronouns (e.g. "it" → "temptation"), but keep the current question dominant.
        // Format: "Context: <prior topics>. Question: <current> <current>"
        // Repeating the current question gives it ~2x weight in the embedding.
        let searchQuery = question;
        if (priorQuestions.length > 0) {
            // Extract key nouns/topics from prior questions (strip stop words)
            const stopWords = new Set(["what","do","the","a","an","is","are","was","were","how","should","i","me","my","we","our","they","them","their","it","its","this","that","these","those","about","from","with","for","in","on","to","of","and","or","but","can","will","would","could","did","does","have","has","had","been","be","so","if","not","no","by","at","as","up","out","all","very","just","than","then","also","into","over","such","too","any","each","some","may","most","other","which","where","when","who","whom","why","shall","much","many"]);
            const contextTerms = priorQuestions
                .join(" ")
                .split(/\s+/)
                .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
                .filter((w) => w.length > 2 && !stopWords.has(w));
            const uniqueTerms = [...new Set(contextTerms)].slice(0, 8);
            if (uniqueTerms.length > 0) {
                searchQuery = `Context: ${uniqueTerms.join(" ")}. ${question} ${question}`;
            }
        }

        // Embed the search query via Voyage AI — one API call
        const [queryEmbedding, booksResult] = await Promise.all([
            embedQuery(searchQuery),
            supabaseAdmin.from("books").select("id,title,indexing_status").in("id", selectedBookIds),
        ]);

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

        const terms = searchQuery.split(/\s+/).filter(Boolean);

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

        const candidates: { chunk_id: string; book_id: string; book_title: string; score: number | null; text: string; full_text: string }[] = [];

        for (const r of chunkResults ?? []) {
            const rawText = r.chunk_text ?? "";
            if (!rawText) continue;

            // Strip PDF artifacts from raw chunk BEFORE extracting logical unit
            let cleanedChunk = sanitizeText(rawText);
            cleanedChunk = stripPageMarkers(cleanedChunk);
            cleanedChunk = stripAuthorTitleLines(cleanedChunk);
            cleanedChunk = stripFootnoteLines(cleanedChunk);
            cleanedChunk = stripHeaderLines(cleanedChunk);
            cleanedChunk = stripLikelyHeaderFooterLines(cleanedChunk);
            cleanedChunk = cleanedChunk.replace(/\n{3,}/g, "\n\n").trim();
            if (!cleanedChunk) continue;

            const unit = extractLogicalUnit(cleanedChunk, terms);
            let fullText = stripLikelyHeaderFooterLines(sanitizeText(unit.full));
            let previewText = stripLikelyHeaderFooterLines(sanitizeText(unit.preview));
            fullText = stripInlineHeaders(dewrapPdfLines(fullText));
            previewText = stripInlineHeaders(dewrapPdfLines(previewText));
            fullText = trimTrailingFragment(trimLeadingFragment(fullText));
            previewText = trimTrailingFragment(trimLeadingFragment(previewText));
            if (looksLikeTOCOrIndex(fullText) || looksLikeTOCOrIndex(previewText)) continue;
            if (fullText.length < 60 || previewText.length < 40) continue;

            candidates.push({
                chunk_id: r.chunk_id ?? "",
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
            chunk_id: p.chunk_id,
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
