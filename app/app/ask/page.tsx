"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Book = { id: string; title: string; created_at: string };
type Passage = { id: string; book_id: string; book_title: string; score: number | null; text: string };

type Msg =
    | { role: "user"; text: string }
    | { role: "assistant"; passages: Passage[]; error?: string };

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

    const LS_KEY = "saintshelp.ask.state.v1";

    function saveState(next?: Partial<{
        conversationId: string | null;
        conversationTitle: string | null;
        chat: Msg[];
        selected: Record<string, boolean>;
    }>) {
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
        const token = await getToken();
        if (!token) {
            router.push("/login");
            return;
        }

        const res = await fetch("/api/books", { headers: { Authorization: `Bearer ${token}` } });
        const text = await res.text();
        const json = text ? JSON.parse(text) : {};
        if (!res.ok) {
            setStatus("Error: " + (json.error ?? "Unknown"));
            return;
        }

        const list = (json.books ?? []) as Book[];
        setBooks(list);

        const sel: Record<string, boolean> = {};
        for (const b of list) sel[b.id] = true;
        setSelected(sel);

        setStatus("Ready");
    }

    useEffect(() => {
        loadBooks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const s = loadState();
        if (s) {
            if (typeof s.conversationId === "string" || s.conversationId === null) setConversationId(s.conversationId);
            if (typeof s.conversationTitle === "string" || s.conversationTitle === null) setConversationTitle(s.conversationTitle);
            if (Array.isArray(s.chat)) setChat(s.chat);
            if (s.selected && typeof s.selected === "object") setSelected(s.selected);
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        saveState();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, conversationTitle, chat, selected]);

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

    function newChat() {
        setChat([]);
        setConversationId(null);
        setConversationTitle(null);
        setQuestion("");
        localStorage.removeItem(LS_KEY);
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

        if (json?.conversationId && !conversationId) setConversationId(String(json.conversationId));
        if (json?.conversationTitle) setConversationTitle(String(json.conversationTitle));

        setChat((c) => [...c, { role: "assistant", passages: (json?.passages ?? []) as Passage[] }]);
        setAsking(false);
    }

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
        passageCard: {
            border: "1px solid #efefef",
            borderRadius: 12,
            padding: 12,
            background: "#fafafa",
        } as const,
        passageMetaRow: {
            fontSize: 12,
            opacity: 0.85,
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 8,
        } as const,
        quote: {
            whiteSpace: "pre-wrap",
            margin: 0,
            lineHeight: 1.55,
            fontSize: 15,
            fontFamily: 'ui-serif, Georgia, Cambria, "Times New Roman", Times, serif',
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
        <div style={styles.wrap}>
            <div style={styles.layout}>
                <aside style={{ ...styles.card, ...styles.aside }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <h2 style={styles.h2}>Books</h2>
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
                                <button style={styles.btn} onClick={newChat}>
                                    New chat
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
                    <div style={styles.chatBox}>
                        {chat.length === 0 ? (
                            <p style={{ margin: 0, fontSize: 14, opacity: 0.8 }}>SaintsHelp responds with verbatim quotes only.</p>
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
                                                    <div key={i} style={styles.passageCard}>
                                                        <div key={i} style={styles.passageCard}>
                                                            {/* Citation at top (no buttons here) */}
                                                            <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 8 }}>
                                                                <span style={{ fontWeight: 600 }}>{p.book_title}</span>
                                                            </div>

                                                            {/* Quote */}
                                                            <div style={styles.quote}>{p.text}</div>

                                                            {/* Actions at bottom */}
                                                            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                                                                {p.text.endsWith("…") && (
                                                                    <button
                                                                        onClick={async () => {
                                                                            const full = await fetchFullSaying(p.id);
                                                                            if (!full) return;

                                                                            setChat((prev) =>
                                                                                prev.map((msg) => {
                                                                                    if (msg.role !== "assistant") return msg;
                                                                                    return {
                                                                                        ...msg,
                                                                                        passages: msg.passages.map((pp) => (pp.id === p.id ? { ...pp, text: full } : pp)),
                                                                                    };
                                                                                })
                                                                            );
                                                                        }}
                                                                        style={{
                                                                            fontSize: 12,
                                                                            padding: "6px 10px",
                                                                            border: "1px solid #d9d9d9",
                                                                            borderRadius: 10,
                                                                            background: "#fff",
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
                                                                        border: "1px solid #d9d9d9",
                                                                        borderRadius: 10,
                                                                        background: "#fff",
                                                                        cursor: "pointer",
                                                                    }}
                                                                >
                                                                    Copy
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div style={styles.quote}>{p.text}</div>
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