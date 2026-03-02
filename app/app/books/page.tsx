"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { useTheme, tc } from "@/lib/theme";

type Book = {
    id: string;
    title: string;
    storage_path: string;
    created_at: string;
    indexing_status: string;
    chunk_count: number | null;
    topic_ids: string[];
};

type Topic = { id: string; name: string; display_order: number };

export default function BooksPage() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();
    const { isDark } = useTheme();
    const t = tc(isDark);

    const [status, setStatus] = useState<string>("Loading...");
    const [books, setBooks] = useState<Book[]>([]);
    const [topics, setTopics] = useState<Topic[]>([]);
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [msg, setMsg] = useState<string>("");

    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    const [search, setSearch] = useState("");
    const [activeTopic, setActiveTopic] = useState<string | null>(null);

    // Book selection for search
    const LS_SELECTED_KEY = `saintshelp.selected.v1.${userId ?? ""}`;
    const [selected, setSelected] = useState<Record<string, boolean>>({});

    // Topic management
    const [newTopicName, setNewTopicName] = useState("");

    async function getAccessToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
    }

    async function loadBooks() {
        setMsg("");
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { router.push("/login"); return; }

        const uid = session.user.id;
        setUserId(uid);
        const token = session.access_token;

        const { data: me, error: meErr } = await supabase
            .from("profiles").select("status,is_admin").eq("id", uid).single();
        if (meErr) { setStatus("Error: " + meErr.message); return; }
        if (me?.status !== "approved") { setStatus("Your account is not approved."); return; }

        setIsAdmin(!!me?.is_admin);

        setStatus("Loading books...");
        const [booksRes, topicsRes] = await Promise.all([
            fetch("/api/books", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/topics", { headers: { Authorization: `Bearer ${token}` } }),
        ]);

        const booksJson = await booksRes.json().catch(() => ({}));
        const topicsJson = await topicsRes.json().catch(() => ({}));

        if (!booksRes.ok) { setStatus("Error: " + (booksJson?.error ?? "Unknown")); return; }

        const list = (booksJson?.books ?? []) as Book[];
        setBooks(list);
        setTopics((topicsJson?.topics ?? []) as Topic[]);

        // Restore saved book selection
        setSelected(() => {
            try {
                const raw = localStorage.getItem(`saintshelp.selected.v1.${uid}`);
                if (raw) {
                    const saved = JSON.parse(raw) as Record<string, boolean>;
                    if (saved && typeof saved === "object") {
                        const merged: Record<string, boolean> = {};
                        for (const b of list) merged[b.id] = b.id in saved ? saved[b.id] : true;
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

    async function upload() {
        setMsg("");
        if (uploading) return;
        if (!title.trim()) return setMsg("Enter a title.");
        if (!file) return setMsg("Choose a PDF file.");

        const token = await getAccessToken();
        if (!token) { router.push("/login"); return; }

        const fd = new FormData();
        fd.append("title", title.trim());
        fd.append("file", file);

        setUploading(true);
        setMsg("Uploading and indexing...");

        const res = await fetch("/api/books/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });

        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
            setMsg("Error: " + (json?.error ?? "Unknown"));
            setUploading(false);
            return;
        }

        setTitle("");
        setFile(null);
        setMsg("Uploaded and indexed successfully.");
        setUploading(false);
        await loadBooks();
    }

    async function deleteBook(id: string) {
        const ok = confirm("Delete this book and all its chunks?");
        if (!ok) return;

        const token = await getAccessToken();
        if (!token) { router.push("/login"); return; }

        setDeletingId(id);
        setMsg("");

        const res = await fetch(`/api/books/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const body = await res.text();
            setMsg("Delete failed: " + body);
            setDeletingId(null);
            return;
        }

        setDeletingId(null);
        await loadBooks();
    }

    async function createTopic() {
        if (!newTopicName.trim()) return;
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch("/api/topics", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ name: newTopicName.trim() }),
        });

        if (res.ok) {
            setNewTopicName("");
            await loadBooks();
        } else {
            const json = await res.json().catch(() => ({}));
            setMsg("Failed to create topic: " + (json?.error ?? "Unknown"));
        }
    }

    async function deleteTopic(id: string) {
        if (!confirm("Delete this topic?")) return;
        const token = await getAccessToken();
        if (!token) return;

        const res = await fetch(`/api/topics/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const json = await res.json().catch(() => ({}));
            setMsg("Failed to delete topic: " + (json?.error ?? "Unknown"));
        }
        await loadBooks();
    }

    async function toggleBookTopic(bookId: string, topicId: string) {
        const book = books.find((b) => b.id === bookId);
        if (!book) return;

        const token = await getAccessToken();
        if (!token) return;

        const currentTopics = book.topic_ids ?? [];
        const newTopics = currentTopics.includes(topicId)
            ? currentTopics.filter((tid) => tid !== topicId)
            : [...currentTopics, topicId];

        const res = await fetch(`/api/books/${bookId}/topics`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ topicIds: newTopics }),
        });

        if (res.ok) {
            setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, topic_ids: newTopics } : b));
        } else {
            setMsg("Failed to update topics");
        }
    }

    function toggleSelect(id: string) {
        setSelected((s) => ({ ...s, [id]: !s[id] }));
    }

    function selectAll(on: boolean) {
        const sel: Record<string, boolean> = {};
        for (const b of filteredBooks) sel[b.id] = on;
        setSelected((s) => ({ ...s, ...sel }));
    }

    useEffect(() => { loadBooks(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Persist selection
    useEffect(() => {
        if (!userId || Object.keys(selected).length === 0) return;
        localStorage.setItem(LS_SELECTED_KEY, JSON.stringify(selected));
    }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

    const filteredBooks = books.filter((b) => {
        if (search && !b.title.toLowerCase().includes(search.toLowerCase())) return false;
        if (activeTopic && !(b.topic_ids ?? []).includes(activeTopic)) return false;
        return true;
    });

    const selectedCount = Object.values(selected).filter(Boolean).length;

    const styles = {
        wrap: { padding: 18 } as const,
        h1: { margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: -0.2 } as const,
        muted: { margin: "6px 0 0 0", fontSize: 13, opacity: 0.75 } as const,
        card: {
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: 14,
            background: t.cardBg,
        } as const,
        cardTitle: { margin: 0, fontSize: 14, fontWeight: 650 } as const,
        cardDesc: { margin: "6px 0 12px 0", fontSize: 13, opacity: 0.8, lineHeight: 1.35 } as const,
        label: { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 } as const,
        input: {
            width: "100%",
            border: `1px solid ${t.borderInput}`,
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            outline: "none",
            background: t.inputBg,
            color: t.fg,
            boxSizing: "border-box" as const,
        } as const,
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
        msg: { marginTop: 10, fontSize: 13, opacity: 0.85 } as const,
        pill: (active: boolean) => ({
            border: `1px solid ${active ? t.btnActiveBorder : t.btnBorder}`,
            background: active ? t.btnActiveBg : t.btnBg,
            color: active ? t.btnActiveFg : t.btnFg,
            borderRadius: 20,
            padding: "5px 12px",
            fontSize: 12,
            cursor: "pointer",
        }) as const,
        item: {
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: 12,
            background: t.cardBg,
        } as const,
        fileRow: { display: "flex", alignItems: "center", gap: 10 } as const,
        fileBtn: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 10px",
            borderRadius: 10,
            border: `1px solid ${t.btnBorder}`,
            background: t.btnBg,
            color: t.btnFg,
            cursor: "pointer",
            fontSize: 13,
            userSelect: "none" as const,
            whiteSpace: "nowrap" as const,
        } as const,
        fileName: { fontSize: 13, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const } as const,
    };

    const statusBadge = (s: string) => {
        const colors: Record<string, { bg: string; fg: string }> = {
            ready: { bg: isDark ? "#1a2e1c" : "#f0fff4", fg: isDark ? "#4caf50" : "#2e7d32" },
            pending: { bg: isDark ? "#2e2a1a" : "#fffef0", fg: isDark ? "#ffb300" : "#f57f17" },
            chunking: { bg: isDark ? "#1a2a2e" : "#f0f8ff", fg: isDark ? "#42a5f5" : "#1565c0" },
            embedding: { bg: isDark ? "#1a2a2e" : "#f0f8ff", fg: isDark ? "#42a5f5" : "#1565c0" },
            failed: { bg: isDark ? "#2e1a1a" : "#fff0f0", fg: isDark ? "#ef5350" : "#c62828" },
        };
        const c = colors[s] ?? colors.pending;
        return {
            display: "inline-block",
            padding: "2px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontWeight: 600,
            background: c.bg,
            color: c.fg,
        };
    };

    return (
        <div style={styles.wrap}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
                <h1 style={styles.h1}>Books</h1>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                    {status !== "Ready" ? status : `Selected: ${selectedCount}/${books.length}`}
                </div>
            </div>

            {/* Search + topic filters */}
            <div style={{ marginTop: 14 }}>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search books..."
                    style={{ ...styles.input, marginBottom: 10 }}
                />

                {topics.length > 0 && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
                        <button style={styles.pill(!activeTopic)} onClick={() => setActiveTopic(null)}>All</button>
                        {topics.map((tp) => (
                            <button key={tp.id} style={styles.pill(activeTopic === tp.id)} onClick={() => setActiveTopic(activeTopic === tp.id ? null : tp.id)}>
                                {tp.name}
                            </button>
                        ))}
                    </div>
                )}

                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <button style={styles.btn} onClick={() => selectAll(true)}>Select all</button>
                    <button style={styles.btn} onClick={() => selectAll(false)}>None</button>
                </div>
            </div>

            {/* Book list */}
            {filteredBooks.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 8 }}>
                    {books.length === 0 ? "No books yet." : "No books match your filters."}
                </div>
            ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filteredBooks.map((b) => (
                        <div key={b.id} style={styles.item}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <input
                                    type="checkbox"
                                    checked={!!selected[b.id]}
                                    onChange={() => toggleSelect(b.id)}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.2 }}>{b.title}</span>
                                        <span style={statusBadge(b.indexing_status ?? "pending")}>{b.indexing_status ?? "pending"}</span>
                                        {b.chunk_count != null && b.indexing_status === "ready" && (
                                            <span style={{ fontSize: 11, opacity: 0.6 }}>{b.chunk_count} chunks</span>
                                        )}
                                    </div>
                                    {isAdmin && topics.length > 0 && (
                                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                                            {topics.map((tp) => (
                                                <button
                                                    key={tp.id}
                                                    onClick={() => toggleBookTopic(b.id, tp.id)}
                                                    style={{
                                                        ...styles.pill((b.topic_ids ?? []).includes(tp.id)),
                                                        padding: "2px 8px",
                                                        fontSize: 11,
                                                    }}
                                                >
                                                    {tp.name}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {isAdmin && (
                                    <button
                                        style={deletingId === b.id ? { ...styles.btn, opacity: 0.6, cursor: "not-allowed" } : styles.btn}
                                        onClick={() => deleteBook(b.id)}
                                        disabled={deletingId === b.id}
                                    >
                                        {deletingId === b.id ? "Deleting…" : "Delete"}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Admin section */}
            {isAdmin && (
                <div className="books-grid" style={{ marginTop: 20 }}>
                    <div style={styles.card}>
                        <p style={styles.cardTitle}>Upload PDF</p>
                        <p style={styles.cardDesc}>Add a book. It will be chunked and indexed for semantic search.</p>

                        <div style={{ marginBottom: 10 }}>
                            <label style={styles.label}>Title</label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                style={styles.input}
                                placeholder='e.g. "Confessions (Augustine)"'
                                disabled={uploading}
                            />
                        </div>

                        <div style={{ marginBottom: 12 }}>
                            <label style={styles.label}>PDF</label>
                            <div style={styles.fileRow}>
                                <label style={uploading ? { ...styles.fileBtn, opacity: 0.6, cursor: "not-allowed" } : styles.fileBtn}>
                                    Choose file
                                    <input
                                        type="file"
                                        accept="application/pdf"
                                        disabled={uploading}
                                        style={{ display: "none" }}
                                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                    />
                                </label>
                                <div style={{ ...styles.fileName, flex: 1 }}>
                                    {file ? file.name : "No file selected"}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <button
                                style={uploading ? { ...styles.btnPrimary, opacity: 0.6, cursor: "not-allowed" } : styles.btnPrimary}
                                onClick={upload}
                                disabled={uploading}
                            >
                                {uploading ? "Uploading…" : "Upload"}
                            </button>
                            {msg && <div style={styles.msg}>{msg}</div>}
                        </div>
                    </div>

                    <div style={styles.card}>
                        <p style={styles.cardTitle}>Topics</p>
                        <p style={styles.cardDesc}>Manage topics to categorize books.</p>

                        {topics.length > 0 && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                                {topics.map((tp) => (
                                    <div key={tp.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: 13 }}>{tp.name}</span>
                                        <button style={{ ...styles.btn, padding: "4px 8px", fontSize: 12 }} onClick={() => deleteTopic(tp.id)}>
                                            Delete
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div style={{ display: "flex", gap: 8 }}>
                            <input
                                value={newTopicName}
                                onChange={(e) => setNewTopicName(e.target.value)}
                                placeholder="New topic name"
                                style={{ ...styles.input, flex: 1 }}
                                onKeyDown={(e) => { if (e.key === "Enter") createTopic(); }}
                            />
                            <button style={styles.btn} onClick={createTopic}>Add</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
