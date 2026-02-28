"use client";

import { useEffect, useMemo, useState } from "react";
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
    const [userId, setUserId] = useState<string | null>(null);

    // All keys namespaced by userId so accounts never share data
    const LS_KEY = `saintshelp.ask.state.v1.${userId ?? ""}`;
    const LS_INDEX = `saintshelp_threads_v1.${userId ?? ""}`;
    const LS_THREAD_PREFIX = `saintshelp_thread_v1.${userId ?? ""}:`;
    const LS_LAST_THREAD = `saintshelp_last_thread_v1.${userId ?? ""}`;

    const [threads, setThreads] = useState<ThreadIndexItem[]>([]);

    function loadIndex(): ThreadIndexItem[] {
        try {
            const raw = localStorage.getItem(LS_INDEX);
            const arr = raw ? (JSON.parse(raw) as ThreadIndexItem[]) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function saveIndex(items: ThreadIndexItem[]) {
        localStorage.setItem(LS_INDEX, JSON.stringify(items));
    }

    function loadThread(id: string): Msg[] {
        try {
            const raw = localStorage.getItem(LS_THREAD_PREFIX + id);
            const arr = raw ? (JSON.parse(raw) as Msg[]) : [];
            return Array.isArray(arr) ? arr : [];
        } catch {
            return [];
        }
    }

    function saveThread(id: string, chat: Msg[]) {
        localStorage.setItem(LS_THREAD_PREFIX + id, JSON.stringify(chat));
    }

    function makeTitleFromChat(chat: Msg[]): string {
        const firstUser = chat.find((m) => m.role === "user") as any;
        const t = (firstUser?.text ?? "New thread").trim();
        return t.length > 48 ? t.slice(0, 48) + "…" : t;
    }

    function ensureThreadExists(id: string, chatForTitle: Msg[]) {
        const now = Date.now();
        const title = makeTitleFromChat(chatForTitle);

        setThreads((prev) => {
            const next: ThreadIndexItem[] = [{ id, title, updatedAt: now }, ...prev.filter((t) => t.id !== id)];
            saveIndex(next);
            return next;
        });
    }

    function saveState(
        next?: Partial<{
            conversationId: string | null;
            conversationTitle: string | null;
            chat: Msg[];
            selected: Record<string, boolean>;
        }>
    ) {
        const payload = {
            conversationId,
            conversationTitle,
            chat,
            selected,
            ...next,
        };
        localStorage.setItem(LS_KEY, JSON.stringify(payload));
    }

    function loadState() {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    async function getToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
    }

    async function loadBooks() {
        const { data: sessionData } = await supabase.auth.getSession();
        const session = sessionData.session;
        if (!session) {
            router.push("/login");
            return;
        }
        setUserId(session.user.id);
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

        // IMPORTANT: do not clobber selection if we already loaded it from storage
        setSelected((prev) => {
            const hasAny = prev && Object.keys(prev).length > 0;
            if (hasAny) return prev;

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

    function openThread(id: string) {
        const tchat = loadThread(id);
        setConversationId(id);
        setChat(tchat);
        setConversationTitle(makeTitleFromChat(tchat));
        localStorage.setItem(LS_LAST_THREAD, id);
    }

    function newChat() {
        const id = crypto.randomUUID();
        const now = Date.now();

        // create empty thread immediately
        saveThread(id, []);
        localStorage.setItem(LS_LAST_THREAD, id);

        // update index + UI state
        setConversationId(id);
        setConversationTitle("New thread");
        setChat([]);
        setQuestion("");

        setThreads((prev) => {
            const next = [{ id, title: "New thread", updatedAt: now }, ...prev];
            saveIndex(next);
            return next;
        });

        // keep old single-state storage in sync (do NOT remove everything anymore)
        saveState({
            conversationId: id,
            conversationTitle: "New thread",
            chat: [],
        });
    }

    function deleteThread(id: string) {
        // delete thread payload
        localStorage.removeItem(LS_THREAD_PREFIX + id);

        // delete from index
        const nextIndex = loadIndex().filter((t) => t.id !== id);
        saveIndex(nextIndex);
        setThreads(nextIndex);

        // if deleting current: switch to next most recent or create new
        if (conversationId === id) {
            const sorted = [...nextIndex].sort((a, b) => b.updatedAt - a.updatedAt);
            const fallback = sorted[0]?.id ?? null;
            if (fallback) {
                openThread(fallback);
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

        // Ensure we have a conversation id (server can assign one)
        if (json?.conversationId && !conversationId) setConversationId(String(json.conversationId));
        if (json?.conversationTitle) setConversationTitle(String(json.conversationTitle));

        setChat((c) => [...c, { role: "assistant", passages: (json?.passages ?? []) as Passage[] }]);
        setAsking(false);
    }

    // ---------- Mount: load books (also sets userId) ----------
    useEffect(() => {
        loadBooks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---------- Once userId is known: restore last thread from namespaced storage ----------
    useEffect(() => {
        if (!userId) return;

        // 1) Load thread index
        const idx = loadIndex().sort((a, b) => b.updatedAt - a.updatedAt);
        setThreads(idx);

        // 2) Prefer last thread, else first in index, else fall back to LS_KEY state
        const lastId = localStorage.getItem(LS_LAST_THREAD) || "";
        const pickedId = lastId || (idx[0]?.id ?? "");

        if (pickedId) {
            openThread(pickedId);
        } else {
            const s = loadState();
            if (s) {
                if (typeof s.conversationId === "string" || s.conversationId === null) setConversationId(s.conversationId);
                if (typeof s.conversationTitle === "string" || s.conversationTitle === null) setConversationTitle(s.conversationTitle);
                if (Array.isArray(s.chat)) setChat(s.chat);
                if (s.selected && typeof s.selected === "object") setSelected(s.selected);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId]);

    // ---------- Persist: thread + thread index + old LS_KEY ----------
    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!userId) return;

        // keep old state persistence (unchanged)
        saveState();

        // new thread persistence (this is the actual fix)
        if (conversationId) {
            saveThread(conversationId, chat);
            localStorage.setItem(LS_LAST_THREAD, conversationId);
            ensureThreadExists(conversationId, chat);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, conversationTitle, chat, selected]);

    const styles = {
        wrap: { padding: 18 } as const,
        layout: { display: "flex", gap: 16, alignItems: "flex-start" } as const,
        card: { border: "1px solid #efefef", borderRadius: 12, background: "#fff" } as const,
        aside: { width: 340, padding: 12 } as const,
        section: { flex: 1 } as const,
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
        chatBox: { padding: 12, minHeight: 520 } as const,
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
        <div style={styles.wrap}>
            <div style={styles.layout}>
                <aside style={{ ...styles.card, ...styles.aside }}>
                    {/* Threads */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            marginBottom: 10, // fixes button touching list
                        }}
                    >
                        <h2 style={styles.h2}>Threads</h2>
                        <button style={styles.btn} onClick={newChat}>
                            New chat
                        </button>
                    </div>

                    <p style={{ margin: "0 0 10px 0", fontSize: 11, opacity: 0.5, lineHeight: 1.4 }}>
                        Conversations are saved in this browser only.
                    </p>

                    {threads.length === 0 ? (
                        <p style={{ margin: "0 0 12px 0", fontSize: 13, opacity: 0.7 }}>No threads yet.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
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

                <section style={{ ...styles.card, ...styles.section }}>
                    <div style={{ padding: 12, minHeight: 520 }}>
                        {chat.length === 0 ? (
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
                                {chat.map((m, idx) => (
                                    <div key={idx}>
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
                                                                            onClick={async () => {
                                                                                const full = await fetchFullSaying(p.id);
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
                                                                                cursor: "pointer",
                                                                            }}
                                                                        >
                                                                            Show full saying
                                                                        </button>
                                                                    )}

                                                                <button
                                                                    onClick={() => navigator.clipboard.writeText(p.text)}
                                                                    style={{
                                                                        fontSize: 12,
                                                                        padding: "6px 10px",
                                                                        border: "1px solid #ddd",
                                                                        borderRadius: 12,
                                                                        background: "transparent",
                                                                        cursor: "pointer",
                                                                    }}
                                                                >
                                                                    Copy
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: 10, padding: 12, borderTop: "1px solid #efefef" }}>
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