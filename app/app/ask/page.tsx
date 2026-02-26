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

    // NEW: conversation threading
    const [conversationId, setConversationId] = useState<string | null>(null);

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

        // auto-select all by default
        const sel: Record<string, boolean> = {};
        for (const b of list) sel[b.id] = true;
        setSelected(sel);

        setStatus("Ready");
    }

    useEffect(() => {
        loadBooks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function selectedIds() {
        return Object.entries(selected)
            .filter(([_, v]) => v)
            .map(([k]) => k);
    }

    function newChat() {
        setChat([]);
        setConversationId(null);
        setQuestion("");
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
        if (!q) return;

        const ids = selectedIds();
        if (ids.length === 0) {
            setChat((c) => [...c, { role: "assistant", passages: [], error: "Select at least one book." }]);
            return;
        }

        setChat((c) => [...c, { role: "user", text: q }]);
        setQuestion("");

        const token = await getToken();
        if (!token) {
            router.push("/login");
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

        if (!res.ok) {
            setChat((c) => [...c, { role: "assistant", passages: [], error: json?.error ?? text ?? "Unknown error" }]);
            return;
        }

        // NEW: persist conversationId from server
        if (json?.conversationId && !conversationId) {
            setConversationId(String(json.conversationId));
        }

        setChat((c) => [...c, { role: "assistant", passages: (json?.passages ?? []) as Passage[] }]);
    }

    return (
        <main style={{ maxWidth: 1100, margin: "30px auto", padding: 16 }}>
            <h1>SaintsHelp — Ask</h1>

            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <aside style={{ width: 340, border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
                    <h2 style={{ marginTop: 0 }}>Books</h2>
                    <p style={{ marginTop: 0 }}>{status}</p>

                    {books.length === 0 ? (
                        <p>No books. Upload one first.</p>
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                            {books.map((b) => (
                                <label key={b.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                    <input
                                        type="checkbox"
                                        checked={!!selected[b.id]}
                                        onChange={(e) => setSelected((s) => ({ ...s, [b.id]: e.target.checked }))}
                                    />
                                    <span>{b.title}</span>
                                </label>
                            ))}
                        </div>
                    )}

                    <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                        <button onClick={() => router.push("/app/books")}>Upload / Manage books</button>
                        <button onClick={newChat} title="Start a new conversation thread">
                            New chat
                        </button>
                    </div>

                    <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                        {conversationId ? (
                            <div>
                                Thread: <code>{conversationId}</code>
                            </div>
                        ) : (
                            <div>Thread: (new)</div>
                        )}
                    </div>
                </aside>

                <section style={{ flex: 1 }}>
                    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12, minHeight: 420 }}>
                        {chat.length === 0 ? (
                            <p>Ask a question. SaintsHelp will respond with verbatim quotes and citations.</p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                                {chat.map((m, idx) => (
                                    <div key={idx}>
                                        {m.role === "user" ? (
                                            <div>
                                                <b>You:</b> {m.text}
                                            </div>
                                        ) : (
                                            <div>
                                                <b>SaintsHelp:</b>
                                                {m.error ? (
                                                    <div style={{ marginTop: 6 }}>Error: {m.error}</div>
                                                ) : m.passages.length === 0 ? (
                                                    <div style={{ marginTop: 6 }}>No passages found.</div>
                                                ) : (
                                                    <ol style={{ marginTop: 6 }}>
                                                        {m.passages.map((p, i) => (
                                                            <li key={i} style={{ marginBottom: 12 }}>
                                                                <div style={{ fontSize: 12, opacity: 0.8, display: "flex", alignItems: "center", gap: 10 }}>
                                                                    <span>
                                                                        {p.book_title}
                                                                        {p.score != null ? ` · score ${p.score.toFixed(3)}` : ""}
                                                                    </span>

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
                                                                                padding: "2px 6px",
                                                                                border: "1px solid #ddd",
                                                                                borderRadius: 6,
                                                                                background: "transparent",
                                                                                cursor: "pointer",
                                                                                opacity: 0.9,
                                                                            }}
                                                                        >
                                                                            Show full saying
                                                                        </button>
                                                                    )}
                                                                </div>
                                                                {p.text.endsWith("…") && (
                                                                    <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
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
                                                                        >
                                                                            Show full saying
                                                                        </button>
                                                                    </div>
                                                                )}

                                                                <pre
                                                                    style={{
                                                                        whiteSpace: "pre-wrap",
                                                                        margin: 0,
                                                                        padding: 10,
                                                                        border: "1px solid #eee",
                                                                        borderRadius: 6,
                                                                    }}
                                                                >
                                                                    {p.text}
                                                                </pre>
                                                            </li>
                                                        ))}
                                                    </ol>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        <input
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            placeholder="Ask something…"
                            style={{ flex: 1 }}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") ask();
                            }}
                        />
                        <button onClick={ask}>Ask</button>
                    </div>
                </section>
            </div>
        </main>
    );
}