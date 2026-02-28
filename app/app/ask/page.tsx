"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Book = { id: string; title: string; created_at: string };
type Passage = { id: string; book_id: string; book_title: string; score: number | null; text: string };

type Msg =
    | { role: "user"; text: string }
    | { role: "assistant"; passages: Passage[]; error?: string };

type ThreadIndexItem = { id: string; title: string; updatedAt: number };

export default function AskPage() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();

    const [books, setBooks] = useState<Book[]>([]);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [question, setQuestion] = useState("");
    const [chat, setChat] = useState<Msg[]>([]);
    const [status, setStatus] = useState("Loading...");

    const [conversationId, setConversationId] = useState<string | null>(null);
    const [conversationTitle, setConversationTitle] = useState<string | null>(null);

    const [asking, setAsking] = useState(false);
    const [loadingThread, setLoadingThread] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [loadingFullId, setLoadingFullId] = useState<string | null>(null);

    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatBoxRef = useRef<HTMLDivElement>(null);
    const lastUserMsgRef = useRef<HTMLDivElement>(null);
    const scrollToUserMsg = useRef(false);

    // Book selection preference stored per-user (UI preference, not conversation data)
    const LS_SELECTED_KEY = `saintshelp.selected.v1.${userId ?? ""}`;

    const [threads, setThreads] = useState<ThreadIndexItem[]>([]);

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
        if (!confirm("Delete all conversations? This cannot be undone.")) return;
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

        const res = await fetch("/api/books", { headers: { Authorization: `Bearer ${token}` } });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
            setStatus("Error: " + (json.error ?? "Unknown"));
            return;
        }

        const list = (json.books ?? []) as Book[];
        setBooks(list);

        // Restore saved book selection, defaulting any new books to selected
        setSelected(() => {
            try {
                const raw = localStorage.getItem(`saintshelp.selected.v1.${uid}`);
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

    function selectAll(on: boolean) {
        const sel: Record<string, boolean> = {};
        for (const b of books) sel[b.id] = on;
        setSelected(sel);
    }

    async function openThread(id: string) {
        setLoadingThread(true);
        setConversationId(id);
        setChat([]);
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
        setQuestion("");
    }

    async function deleteThread(id: string) {
        if (!confirm("Delete this conversation?")) return;
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

    async function ask() {
        const q = question.trim();
        if (!q || asking) return;

        const ids = selectedIds();
        if (ids.length === 0) {
            setChat((c) => [...c, { role: "assistant", passages: [], error: "Select at least one book." }]);
            return;
        }

        setAsking(true);
        scrollToUserMsg.current = true;
        setChat((c) => [...c, { role: "user", text: q }]);
        setQuestion("");

        setChat((c) => [...c, { role: "assistant", passages: [], error: "Searching…" }]);

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
                if (m.role === "assistant" && m.error === "Searching…") {
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

    // ---------- Mount: load books (also sets userId) ----------
    useEffect(() => {
        loadBooks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    const styles = {
        wrap: {} as const,
        layout: {} as const,
        card: { border: "1px solid #efefef", borderRadius: 12, background: "#fff" } as const,
        aside: { padding: 12 } as const,
        section: {} as const,
        h2: { margin: "0 0 8px 0", fontSize: 14, fontWeight: 650 } as const,
        subhead: { margin: 0, fontSize: 12, opacity: 0.7 } as const,
        btn: {
            border: "1px solid #d9d9d9",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        btnPrimary: {
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        input: {
            flex: 1,
            border: "1px solid #d9d9d9",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            outline: "none",
        } as const,
        bubbleUser: {
            display: "inline-block",
            padding: "10px 12px",
            borderRadius: 12,
            background: "#111",
            color: "#fff",
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
                        <h2 style={styles.h2}>Threads</h2>
                        <div style={{ display: "flex", gap: 6 }}>
                            <button style={styles.btn} onClick={newChat}>
                                New chat
                            </button>
                            {threads.length > 0 && (
                                <button
                                    style={{ ...styles.btn, opacity: 0.6 }}
                                    onClick={clearAllChats}
                                    title="Delete all conversations"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>
                    </div>

                    {threads.length === 0 ? (
                        <p style={{ margin: "0 0 12px 0", fontSize: 13, opacity: 0.7 }}>No threads yet.</p>
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
                                            border: t.id === conversationId ? "1px solid #111" : "1px solid #d9d9d9",
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
                                            border: "1px solid #d9d9d9",
                                            background: "#fff",
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
                        <h2 style={styles.h2}>Search in</h2>
                        <div style={{ fontSize: 12, opacity: 0.7 }}>{status}</div>
                    </div>

                    {books.length === 0 ? (
                        <p style={{ margin: 0, fontSize: 13, opacity: 0.8 }}>No books. Upload one first.</p>
                    ) : (
                        <>
                            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                                <button style={styles.btn} onClick={() => selectAll(true)}>
                                    Select all
                                </button>
                                <button style={styles.btn} onClick={() => selectAll(false)}>
                                    None
                                </button>
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {books.map((b) => (
                                    <label key={b.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13 }}>
                                        <input
                                            type="checkbox"
                                            checked={!!selected[b.id]}
                                            onChange={(e) => setSelected((s) => ({ ...s, [b.id]: e.target.checked }))}
                                        />
                                        <span style={{ lineHeight: 1.25 }}>{b.title}</span>
                                    </label>
                                ))}
                            </div>

                            <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
                                Selected: {selectedIds().length}/{books.length}
                            </div>

                            {conversationTitle && (
                                <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #efefef" }}>
                                    <div style={styles.subhead}>Conversation</div>
                                    <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.3 }}>{conversationTitle}</div>
                                </div>
                            )}
                        </>
                    )}
                </aside>

                <section className="ask-main" style={styles.card}>
                    <div className="ask-chat-box" style={{ padding: 12 }} ref={chatBoxRef}>
                        {loadingThread ? (
                            <div style={{ fontSize: 13, opacity: 0.6, padding: 12 }}>Loading...</div>
                        ) : chat.length === 0 ? (
                            <div>
                                <p style={{ margin: "0 0 6px 0", fontSize: 14, fontWeight: 600 }}>
                                    How it works
                                </p>
                                <p style={{ margin: "0 0 20px 0", fontSize: 13, opacity: 0.75, lineHeight: 1.6 }}>
                                    Type a question and SaintsHelp will search the selected books for relevant passages,
                                    returning the exact words from the source — no paraphrasing, no AI-generated answers.
                                </p>
                                <p style={{ margin: "0 0 10px 0", fontSize: 12, opacity: 0.5, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                    Try asking
                                </p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {[
                                        "What did the desert fathers say about humility?",
                                        "What does scripture say about prayer?",
                                        "What did the saints say about suffering and patience?",
                                    ].map((q) => (
                                        <button
                                            key={q}
                                            onClick={() => setQuestion(q)}
                                            style={{
                                                textAlign: "left",
                                                fontSize: 13,
                                                background: "#fafafa",
                                                border: "1px solid #efefef",
                                                borderRadius: 10,
                                                padding: "9px 12px",
                                                cursor: "pointer",
                                                lineHeight: 1.4,
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
                                            <div style={{ fontSize: 13, opacity: 0.75 }}>No passages found.</div>
                                        ) : (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                                {m.passages.map((p, i) => (
                                                    <div key={p.id} style={{ marginTop: 16 }}>
                                                        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                                                            {i + 1}. {p.book_title}
                                                        </div>

                                                        <div style={{ border: "1px solid #eee", borderRadius: 16, padding: 16 }}>
                                                            <div
                                                                style={{
                                                                    fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
                                                                    fontSize: 16,
                                                                    lineHeight: 1.6,
                                                                    whiteSpace: "pre-wrap",
                                                                }}
                                                            >
                                                                {p.text}
                                                            </div>

                                                            <div style={{ marginTop: 12, display: "flex", gap: 10 }}>
                                                                {(() => {
                                                                    const t = (p.text ?? "").trimEnd();
                                                                    return t.endsWith("…") || t.endsWith("...");
                                                                })() && (
                                                                        <button
                                                                            disabled={loadingFullId === p.id}
                                                                            onClick={async () => {
                                                                                setLoadingFullId(p.id);
                                                                                const full = await fetchFullSaying(p.id);
                                                                                setLoadingFullId(null);
                                                                                if (!full) return;
                                                                                setChat((prev) =>
                                                                                    prev.map((msg) => {
                                                                                        if (msg.role !== "assistant") return msg;
                                                                                        return {
                                                                                            ...msg,
                                                                                            passages: msg.passages.map((pp) =>
                                                                                                pp.id === p.id ? { ...pp, text: full } : pp
                                                                                            ),
                                                                                        };
                                                                                    })
                                                                                );
                                                                            }}
                                                                            style={{
                                                                                fontSize: 12,
                                                                                padding: "6px 10px",
                                                                                border: "1px solid #ddd",
                                                                                borderRadius: 12,
                                                                                background: "transparent",
                                                                                cursor: loadingFullId === p.id ? "default" : "pointer",
                                                                                opacity: loadingFullId === p.id ? 0.6 : 1,
                                                                            }}
                                                                        >
                                                                            {loadingFullId === p.id ? "Loading…" : "Show full saying"}
                                                                        </button>
                                                                    )}

                                                                <button
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(p.text);
                                                                        setCopiedId(p.id);
                                                                        setTimeout(() => setCopiedId(null), 2000);
                                                                    }}
                                                                    style={{
                                                                        fontSize: 12,
                                                                        padding: "6px 10px",
                                                                        border: "1px solid #ddd",
                                                                        borderRadius: 12,
                                                                        background: copiedId === p.id ? "#f0fff4" : "transparent",
                                                                        cursor: "pointer",
                                                                        color: copiedId === p.id ? "#2e7d32" : "inherit",
                                                                    }}
                                                                >
                                                                    {copiedId === p.id ? "Copied!" : "Copy"}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    );
                                })}
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="ask-input-row" style={{ display: "flex", gap: 10, padding: 12, borderTop: "1px solid #efefef" }}>
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask something…"
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
                            {asking ? "Asking…" : "Ask"}
                        </button>
                    </div>
                </section>
            </div>
        </div>
    );
}
