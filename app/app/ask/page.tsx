"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { useTheme, tc } from "@/lib/theme";
import { useLocale } from "@/lib/i18n";

type Book = { id: string; title: string; created_at: string; topic_ids?: string[] };
type Topic = { id: string; name: string; display_order: number };
type Passage = { id: string; chunk_id?: string; book_id: string; book_title: string; score: number | null; text: string };

type Msg =
    | { role: "user"; text: string }
    | { role: "assistant"; passages: Passage[]; error?: string };

type ThreadIndexItem = { id: string; title: string; updatedAt: number };

export default function AskPage() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();

    const [books, setBooks] = useState<Book[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [question, setQuestion] = useState("");
    const [chat, setChat] = useState<Msg[]>([]);
    const { locale, t: tr } = useLocale();
    const [status, setStatus] = useState("Loading...");

    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversationTitle, setConversationTitle] = useState<string | null>(null);

    const [asking, setAsking] = useState(false);
    const [loadingThread, setLoadingThread] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [loadingFullId, setLoadingFullId] = useState<string | null>(null);
    const [expandState, setExpandState] = useState<Record<string, {
        before: string[]; after: string[];
        beforeChunkId: string | null; afterChunkId: string | null;
        hasMoreBefore: boolean; hasMoreAfter: boolean;
        loadingDir: "before" | "after" | null;
    }>>({});
    const [feedbackState, setFeedbackState] = useState<Record<string, "positive" | "negative" | null>>({});

    const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>([
        "What did the desert fathers say about humility?",
        "What does scripture say about prayer?",
        "What did the saints say about suffering and patience?",
    ]);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatBoxRef = useRef<HTMLDivElement>(null);
    const lastUserMsgRef = useRef<HTMLDivElement>(null);
    const scrollToUserMsg = useRef(false);

    // Book selection preference stored per-user per-language (UI preference, not conversation data)
    const LS_SELECTED_KEY = `saintshelp.selected.v1.${userId ?? ""}.${locale}`;

    const [threads, setThreads] = useState<ThreadIndexItem[]>([]);

    async function fetchSuggestedQuestions() {
        try {
            const res = await fetch("/api/questions/random");
            if (!res.ok) return;
            const json = await res.json().catch(() => null);
            if (Array.isArray(json?.questions) && json.questions.length > 0) {
                setSuggestedQuestions(json.questions);
            }
        } catch {
            // keep fallback on network error
        }
    }

    async function getToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
    }

    async function fetchThreads(): Promise<ThreadIndexItem[]> {
        const token = await getToken();
        if (!token) return [];
        const res = await fetch("/api/conversations", {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return [];
        const json = await res.json().catch(() => ({}));
        return (json.conversations ?? []).map((c: any) => ({
            id: c.id,
            title: c.title ?? "Untitled",
            updatedAt: Date.parse(c.created_at),
        }));
    }

    async function fetchMessages(id: string): Promise<{ title: string; messages: Msg[] } | null> {
        const token = await getToken();
        if (!token) return null;
        const res = await fetch(`/api/conversations/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return null;
        const json = await res.json().catch(() => null);
        if (!json) return null;
        return {
            title: json.conversation?.title ?? "Untitled",
            messages: (json.messages ?? []) as Msg[],
        };
    }

    async function deleteConversationApi(id: string): Promise<void> {
        const token = await getToken();
        if (!token) return;
        await fetch(`/api/conversations/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
    }

    async function clearAllChats(): Promise<void> {
        if (!confirm(tr("askClearAllConfirm"))) return;
        const token = await getToken();
        if (!token) return;
        await fetch("/api/conversations", {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        setThreads([]);
        setConversationId(null);
        setConversationTitle(null);
        setChat([]);
    }

    async function loadBooks() {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            router.push("/login");
            return;
        }
        const uid = session.user.id;
        setUserId(uid);
        const token = session.access_token;

        const [booksRes, topicsRes] = await Promise.all([
            fetch(`/api/books?language=${locale}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/topics", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const booksText = await booksRes.text();
        const json = booksText ? JSON.parse(booksText) : {};
        if (!booksRes.ok) {
            setStatus("Error: " + (json.error ?? "Unknown"));
            return;
        }

        const topicsJson = await topicsRes.json().catch(() => ({}));
        setTopics((topicsJson?.topics ?? []) as Topic[]);

        const list = (json.books ?? []) as Book[];
        setBooks(list);

        // Restore saved book selection (per-language key), defaulting any new books to selected
        setSelected(() => {
            const newKey = `saintshelp.selected.v1.${uid}.${locale}`;
            try {
                let raw = localStorage.getItem(newKey);
                // Migrate: if new key doesn't exist, copy from old key for English
                if (!raw && locale === "en") {
                    const oldKey = `saintshelp.selected.v1.${uid}`;
                    raw = localStorage.getItem(oldKey);
                }
                if (raw) {
                    const saved = JSON.parse(raw) as Record<string, boolean>;
                    if (saved && typeof saved === "object") {
                        const merged: Record<string, boolean> = {};
                        for (const b of list) {
                            merged[b.id] = b.id in saved ? saved[b.id] : true;
                        }
                        return merged;
                    }
                }
            } catch {}
            const sel: Record<string, boolean> = {};
            for (const b of list) sel[b.id] = true;
            return sel;
        });

        setStatus("Ready");
    }

    function selectedIds() {
        return Object.entries(selected)
            .filter(([_, v]) => v)
            .map(([k]) => k);
    }

    async function openThread(id: string) {
        setLoadingThread(true);
        setConversationId(id);
        setChat([]);
        setExpandState({});
        setFeedbackState({});
        const result = await fetchMessages(id);
        if (result) {
            setChat(result.messages);
            setConversationTitle(result.title);
        }
        setLoadingThread(false);
    }

    function newChat() {
        setConversationId(null);
        setConversationTitle(null);
        setChat([]);
        setExpandState({});
        setFeedbackState({});
        setQuestion("");
        fetchSuggestedQuestions();
    }

    async function deleteThread(id: string) {
        if (!confirm(tr("askDeleteConfirm"))) return;
        await deleteConversationApi(id);
        const refreshed = await fetchThreads();
        setThreads(refreshed);

        if (conversationId === id) {
            if (refreshed.length > 0) {
                await openThread(refreshed[0].id);
            } else {
                newChat();
            }
        }
    }

    async function fetchFullSaying(passageId: string): Promise<string | null> {
        const token = await getToken();
        if (!token) {
            router.push("/login");
            return null;
        }

        const res = await fetch("/api/passages/full", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ passageId }),
        });

        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        if (!res.ok) return null;
        return (json?.text ?? null) as string | null;
    }

    async function expandPassage(passageId: string, chunkId: string, direction: "before" | "after") {
        const token = await getToken();
        if (!token) return;

        const state = expandState[passageId] ?? {
            before: [], after: [],
            beforeChunkId: chunkId, afterChunkId: chunkId,
            hasMoreBefore: true, hasMoreAfter: true, loadingDir: null,
        };

        const sourceChunkId = direction === "before" ? (state.beforeChunkId ?? chunkId) : (state.afterChunkId ?? chunkId);

        setExpandState((prev) => ({ ...prev, [passageId]: { ...state, loadingDir: direction } }));

        try {
            const res = await fetch("/api/passages/expand", {
                method: "POST",
                headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ chunk_id: sourceChunkId, direction }),
            });
            const json = await res.json().catch(() => null);
            if (!json?.text) {
                setExpandState((prev) => ({
                    ...prev,
                    [passageId]: {
                        ...state, loadingDir: null,
                        ...(direction === "before" ? { hasMoreBefore: false } : { hasMoreAfter: false }),
                    },
                }));
                return;
            }
            setExpandState((prev) => ({
                ...prev,
                [passageId]: {
                    ...state,
                    loadingDir: null,
                    ...(direction === "before"
                        ? { before: [json.text, ...state.before], beforeChunkId: json.nextChunkId, hasMoreBefore: json.hasMore }
                        : { after: [...state.after, json.text], afterChunkId: json.nextChunkId, hasMoreAfter: json.hasMore }),
                },
            }));
        } catch {
            setExpandState((prev) => ({ ...prev, [passageId]: { ...state, loadingDir: null } }));
        }
    }

    async function ask() {
        const q = question.trim();
        if (!q || asking) return;

        const ids = selectedIds();
        if (ids.length === 0) {
            setChat((c) => [...c, { role: "assistant", passages: [], error: tr("askSelectBook") }]);
            return;
        }

        setAsking(true);
        scrollToUserMsg.current = true;
        setChat((c) => [...c, { role: "user", text: q }]);
        setQuestion("");

        setChat((c) => [...c, { role: "assistant", passages: [], error: tr("askSearching") }]);

        const token = await getToken();
        if (!token) {
            router.push("/login");
            setAsking(false);
            return;
        }

        const res = await fetch("/api/ask", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                question: q,
                selectedBookIds: ids,
                conversationId: conversationId ?? undefined,
            }),
        });

        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        // remove "Searching…"
        setChat((prev) => {
            const copy = [...prev];
            for (let i = copy.length - 1; i >= 0; i--) {
                const m = copy[i];
                if (m.role === "assistant" && (m.error === "Searching…" || m.error === tr("askSearching"))) {
                    copy.splice(i, 1);
                    break;
                }
            }
            return copy;
        });

        if (!res.ok) {
            setChat((c) => [...c, { role: "assistant", passages: [], error: json?.error ?? text ?? "Unknown error" }]);
            setAsking(false);
            return;
        }

        // Ensure we have a conversation id (server assigns one)
        if (json?.conversationId && !conversationId) setConversationId(String(json.conversationId));
        if (json?.conversationTitle) setConversationTitle(String(json.conversationTitle));

        // Scroll so the user's question appears at the top, now that passages are loaded below it
        scrollToUserMsg.current = true;
        setChat((c) => [...c, { role: "assistant", passages: (json?.passages ?? []) as Passage[] }]);
        setAsking(false);

        // Refresh thread list so new/updated conversation appears
        const refreshed = await fetchThreads();
        setThreads(refreshed);
    }

    // ---------- Mount + locale change: load books (also sets userId) ----------
    useEffect(() => {
        loadBooks();
        fetchSuggestedQuestions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locale]);

    // ---------- Once userId is known: load threads from DB ----------
    useEffect(() => {
        if (!userId) return;

        (async () => {
            const idx = await fetchThreads();
            setThreads(idx);

            if (idx.length > 0) {
                await openThread(idx[0].id);
            } else {
                setChat([]);
                setConversationId(null);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // ---------- Persist book selection preference ----------
    useEffect(() => {
        if (!userId) return;
        if (Object.keys(selected).length === 0) return;
        localStorage.setItem(LS_SELECTED_KEY, JSON.stringify(selected));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected]);

    // ---------- Scroll: show user's question at top when submitted ----------
    useEffect(() => {
        if (!scrollToUserMsg.current) return;
        scrollToUserMsg.current = false;

        // Defer until after React has painted the new message into the DOM
        requestAnimationFrame(() => {
            const box = chatBoxRef.current;
            const msg = lastUserMsgRef.current;
            if (!box || !msg) return;

            // Use computed overflow-y to distinguish desktop (auto) from mobile (visible)
            const overflowY = window.getComputedStyle(box).overflowY;
            const isBoxScrollable = overflowY === "auto" || overflowY === "scroll";

            if (isBoxScrollable) {
                // Desktop: chat box is the scroll container
                const boxRect = box.getBoundingClientRect();
                const msgRect = msg.getBoundingClientRect();
                const target = box.scrollTop + (msgRect.top - boxRect.top);
                box.scrollTo({ top: target, behavior: "smooth" });
            } else {
                // Mobile: page itself scrolls; account for sticky topbar height
                const topbar = document.querySelector(".app-topbar") as HTMLElement | null;
                const topbarH = topbar?.offsetHeight ?? 0;
                const msgRect = msg.getBoundingClientRect();
                window.scrollTo({
                    top: window.scrollY + msgRect.top - topbarH - 8,
                    behavior: "smooth",
                });
            }
        });
    }, [chat]);

    const { isDark } = useTheme();
    const t = tc(isDark);

    const styles = {
        wrap: {} as const,
        layout: {} as const,
        card: { border: `1px solid ${t.border}`, borderRadius: 12, background: t.cardBg } as const,
        aside: { padding: 12 } as const,
        section: {} as const,
        h2: { margin: "0 0 8px 0", fontSize: 14, fontWeight: 650 } as const,
        subhead: { margin: 0, fontSize: 12, opacity: 0.7 } as const,
        btn: {
            border: `1px solid ${t.btnBorder}`,
            background: t.btnBg,
            color: t.btnFg,
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        btnPrimary: {
            border: `1px solid ${t.btnActiveBorder}`,
            background: t.btnActiveBg,
            color: t.btnActiveFg,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        input: {
            flex: 1,
            border: `1px solid ${t.borderInput}`,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            outline: "none",
            background: t.inputBg,
            color: t.fg,
        } as const,
        bubbleUser: {
            display: "inline-block",
            padding: "10px 12px",
            borderRadius: 12,
            background: t.btnActiveBg,
            color: t.btnActiveFg,
            maxWidth: "85%",
            lineHeight: 1.35,
            whiteSpace: "pre-wrap",
        } as const,
    };

    return (
        <div className="ask-wrap">
            <div className="ask-layout">
                <aside className="ask-aside" style={{ ...styles.card, ...styles.aside }}>
                    {/* Threads */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 10,
                        }}
                    >
                        <h2 style={styles.h2}>{tr("askThreads")}</h2>
                        <div style={{ display: "flex", gap: 6 }}>
                            <button style={styles.btn} onClick={newChat}>
                                {tr("askNewChat")}
                            </button>
                            {threads.length > 0 && (
                                <button
                                    style={{ ...styles.btn, opacity: 0.6 }}
                                    onClick={clearAllChats}
                                    title={tr("askClearAll")}
                                >
                                    {tr("askClearAll")}
                                </button>
                            )}
                        </div>
                    </div>

                    {threads.length === 0 ? (
                        <p style={{ margin: "0 0 12px 0", fontSize: 13, opacity: 0.7 }}>{tr("askNoThreads")}</p>
                    ) : (
                        <div className="ask-threads-list" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                            {threads.map((t) => (
                                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                    <button
                                        style={{
                                            ...styles.btn,
                                            textAlign: "left",
                                            flex: 1,
                                            opacity: t.id === conversationId ? 1 : 0.85,
                                            border: t.id === conversationId ? `1px solid ${tc(isDark).btnActiveBorder}` : `1px solid ${tc(isDark).btnBorder}`,
                                        }}
                                        onClick={() => openThread(t.id)}
                                    >
                                        {t.title || "New thread"}
                                    </button>

                                    <button
                                        aria-label="Delete thread"
                                        title="Delete"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            deleteThread(t.id);
                                        }}
                                        style={{
                                            width: 34,
                                            height: 34,
                                            borderRadius: 10,
                                            border: `1px solid ${tc(isDark).btnBorder}`,
                                            background: tc(isDark).btnBg,
                                            color: tc(isDark).btnFg,
                                            cursor: "pointer",
                                            fontSize: 18,
                                            lineHeight: "30px",
                                        }}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Books */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <h2 style={styles.h2}>{tr("askSearchIn")}</h2>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
                    </div>

                    {books.length > 0 && (
                        <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                            {tr("booksSelected", { count: String(selectedIds().length), total: String(books.length) })}
                        </div>
                    )}

                    {topics.length > 0 && (
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                            <button
                                style={{
                                    border: `1px solid ${tc(isDark).btnBorder}`,
                                    background: tc(isDark).btnBg,
                                    color: tc(isDark).btnFg,
                                    borderRadius: 14,
                                    padding: "3px 8px",
                                    fontSize: 11,
                                    cursor: "pointer",
                                }}
                                onClick={() => {
                                    const sel: Record<string, boolean> = {};
                                    for (const b of books) sel[b.id] = true;
                                    setSelected(sel);
                                }}
                            >
                                {tr("booksAll")}
                            </button>
                            {topics.map((tp) => (
                                <button
                                    key={tp.id}
                                    style={{
                                        border: `1px solid ${tc(isDark).btnBorder}`,
                                        background: tc(isDark).btnBg,
                                        color: tc(isDark).btnFg,
                                        borderRadius: 14,
                                        padding: "3px 8px",
                                        fontSize: 11,
                                        cursor: "pointer",
                                    }}
                                    onClick={() => {
                                        const topicBookIds = new Set(
                                            books.filter((b) => (b.topic_ids ?? []).includes(tp.id)).map((b) => b.id)
                                        );
                                        const sel: Record<string, boolean> = {};
                                        for (const b of books) sel[b.id] = topicBookIds.has(b.id);
                                        setSelected(sel);
                                    }}
                                >
                                    {tp.name}
                                </button>
                            ))}
                        </div>
                    )}

                    <button
                        style={styles.btn}
                        onClick={() => router.push("/app/books")}
                    >
                        {tr("askManageBooks")}
                    </button>

                    {conversationTitle && (
                        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.border}` }}>
                            <div style={styles.subhead}>{tr("askConversation")}</div>
                            <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.3 }}>{conversationTitle}</div>
                        </div>
                    )}
                </aside>

                <section className="ask-main" style={styles.card}>
                    <div className="ask-chat-box" style={{ padding: 12 }} ref={chatBoxRef}>
                        {loadingThread ? (
                            <div style={{ fontSize: 13, opacity: 0.6, padding: 12 }}>{tr("loading")}</div>
                        ) : chat.length === 0 ? (
                            <div>
                                <p style={{ margin: "0 0 6px 0", fontSize: 14, fontWeight: 600 }}>
                                    {tr("askHowItWorks")}
                                </p>
                                <p style={{ margin: "0 0 20px 0", fontSize: 13, opacity: 0.75, lineHeight: 1.6 }}>
                                    {tr("askHowItWorksDesc")}
                                </p>
                                <p style={{ margin: "0 0 10px 0", fontSize: 12, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                    {tr("askTryAsking")}
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {suggestedQuestions.map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => setQuestion(q)}
                                            style={{
                                                textAlign: "left",
                                                fontSize: 13,
                                                background: t.suggestionBg,
                                                border: `1px solid ${t.suggestionBorder}`,
                                                borderRadius: 10,
                                                padding: "9px 12px",
                                                cursor: "pointer",
                                                lineHeight: 1.4,
                                                color: t.fg,
                                            }}
                                        >
                                            {q}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                                {chat.map((m, idx) => {
                                    const isLastUserMsg = m.role === "user" &&
                                        !chat.slice(idx + 1).some((mm) => mm.role === "user");
                                    return (
                                    <div key={idx} ref={isLastUserMsg ? lastUserMsgRef : null}>
                                        {m.role === "user" ? (
                                            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                                                <div style={styles.bubbleUser}>{m.text}</div>
                                            </div>
                                        ) : m.error ? (
                                            <div style={{ fontSize: 13, opacity: 0.85 }}>{m.error}</div>
                                        ) : m.passages.length === 0 ? (
                                            <div style={{ fontSize: 13, opacity: 0.75 }}>{tr("askNoPassages")}</div>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                {m.passages.map((p, i) => {
                                                    const es = expandState[p.id];
                                                    const canExpandBefore = p.chunk_id && (!es || (es.before.length < 3 && es.hasMoreBefore !== false));
                                                    const canExpandAfter = p.chunk_id && (!es || (es.after.length < 3 && es.hasMoreAfter !== false));
                                                    const isLoadingBefore = es?.loadingDir === "before";
                                                    const isLoadingAfter = es?.loadingDir === "after";
                                                    const fb = feedbackState[p.id] ?? null;
                                                    const isCopied = copiedId === p.id;

                                                    const iconBtn = (disabled?: boolean): React.CSSProperties => ({
                                                        background: "none", border: "none", padding: 8, cursor: disabled ? "default" : "pointer",
                                                        color: tc(isDark).fgMuted, opacity: disabled ? 0.4 : 1, display: "inline-flex", alignItems: "center",
                                                        borderRadius: 6, transition: "opacity 0.15s",
                                                    });

                                                    return (
                                                    <div key={p.id} style={{ marginTop: 16 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                                                            {i + 1}. {p.book_title}
                                                        </div>

                                                        <div style={{ border: `1px solid ${t.border}`, borderRadius: 16, padding: "12px 16px" }}>
                                                            {/* Expand before button */}
                                                            {canExpandBefore && (
                                                                <div style={{ marginBottom: 6 }}>
                                                                    <button
                                                                        className="icon-btn"
                                                                        style={iconBtn(isLoadingBefore)}
                                                                        disabled={isLoadingBefore}
                                                                        onClick={() => expandPassage(p.id, p.chunk_id!, "before")}
                                                                        aria-label="Expand before"
                                                                    >
                                                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                                            <line x1="9" y1="4" x2="9" y2="14" /><line x1="4" y1="9" x2="14" y2="9" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            )}

                                                            {/* Expanded before text */}
                                                            {es?.before.map((txt, bi) => (
                                                                <div key={`eb-${bi}`} style={{
                                                                    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
                                                                    fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap",
                                                                    color: tc(isDark).fgMuted, marginBottom: 8,
                                                                    borderBottom: `1px dashed ${t.border}`, paddingBottom: 8,
                                                                }}>{txt}</div>
                                                            ))}

                                                            {/* Main passage text */}
                                                            <div style={{
                                                                fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
                                                                fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap", color: t.fg,
                                                            }}>
                                                                {p.text}
                                                            </div>

                                                            {/* Expanded after text */}
                                                            {es?.after.map((txt, ai) => (
                                                                <div key={`ea-${ai}`} style={{
                                                                    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
                                                                    fontSize: 16, lineHeight: 1.6, whiteSpace: "pre-wrap",
                                                                    color: tc(isDark).fgMuted, marginTop: 8,
                                                                    borderTop: `1px dashed ${t.border}`, paddingTop: 8,
                                                                }}>{txt}</div>
                                                            ))}

                                                            {/* Bottom action row: expand after, feedback, copy */}
                                                            <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
                                                                {/* Expand after */}
                                                                {canExpandAfter && (
                                                                    <button
                                                                        className="icon-btn"
                                                                        style={iconBtn(isLoadingAfter)}
                                                                        disabled={isLoadingAfter}
                                                                        onClick={() => expandPassage(p.id, p.chunk_id!, "after")}
                                                                        aria-label="Expand after"
                                                                    >
                                                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                                                            <line x1="9" y1="4" x2="9" y2="14" /><line x1="4" y1="9" x2="14" y2="9" />
                                                                        </svg>
                                                                    </button>
                                                                )}

                                                                {/* Spacer */}
                                                                <div style={{ flex: 1 }} />

                                                                {/* Feedback: smiley */}
                                                                <button
                                                                    className="icon-btn"
                                                                    style={{ ...iconBtn(), color: fb === "positive" ? tc(isDark).copyActiveFg : tc(isDark).fgMuted }}
                                                                    onClick={() => setFeedbackState((prev) => ({ ...prev, [p.id]: fb === "positive" ? null : "positive" }))}
                                                                    aria-label="Good answer"
                                                                >
                                                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                                                        <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
                                                                        <circle cx="7.5" cy="8" r="1" fill="currentColor" />
                                                                        <circle cx="12.5" cy="8" r="1" fill="currentColor" />
                                                                        <path d="M6.5 12.5 Q10 15.5 13.5 12.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                                                    </svg>
                                                                </button>

                                                                {/* Feedback: confused */}
                                                                <button
                                                                    className="icon-btn"
                                                                    style={{ ...iconBtn(), color: fb === "negative" ? "#e67e22" : tc(isDark).fgMuted }}
                                                                    onClick={() => setFeedbackState((prev) => ({ ...prev, [p.id]: fb === "negative" ? null : "negative" }))}
                                                                    aria-label="Confusing answer"
                                                                >
                                                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                                                        <circle cx="10" cy="10" r="8.5" stroke="currentColor" strokeWidth="1.5" />
                                                                        <circle cx="7.5" cy="8" r="1" fill="currentColor" />
                                                                        <circle cx="12.5" cy="8" r="1" fill="currentColor" />
                                                                        <path d="M6.5 14 Q10 11 13.5 14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                                                                    </svg>
                                                                </button>

                                                                {/* Copy */}
                                                                <button
                                                                    className="icon-btn"
                                                                    style={{ ...iconBtn(), color: isCopied ? tc(isDark).copyActiveFg : tc(isDark).fgMuted }}
                                                                    onClick={() => {
                                                                        const allText = [
                                                                            ...(es?.before ?? []),
                                                                            p.text,
                                                                            ...(es?.after ?? []),
                                                                        ].join("\n\n");
                                                                        navigator.clipboard.writeText(allText);
                                                                        setCopiedId(p.id);
                                                                        setTimeout(() => setCopiedId(null), 2000);
                                                                    }}
                                                                    aria-label="Copy"
                                                                >
                                                                    {isCopied ? (
                                                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                                                            <rect x="3" y="5" width="10" height="11" rx="1.5" fill="currentColor" stroke="currentColor" strokeWidth="1.2" />
                                                                            <polyline points="5.5 10.5 7.5 12.5 10.5 8.5" fill="none" stroke={t.cardBg} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                                            <rect x="5.5" y="2.5" width="9" height="11" rx="1.5" />
                                                                            <rect x="3.5" y="4.5" width="9" height="11" rx="1.5" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="ask-input-row" style={{ display: "flex", gap: 10, padding: 12, borderTop: `1px solid ${t.border}` }}>
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder={tr("askPlaceholder")}
                            style={styles.input}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") ask();
                            }}
                            disabled={asking}
                        />
                        <button
                            style={asking ? { ...styles.btnPrimary, opacity: 0.6, cursor: "not-allowed" } : styles.btnPrimary}
                            onClick={ask}
                            disabled={asking}
                        >
                            {asking ? tr("askAsking") : tr("askBtn")}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
