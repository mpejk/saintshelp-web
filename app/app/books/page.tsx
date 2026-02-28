"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Book = {
    id: string;
    title: string;
    storage_path: string;
    created_at: string;
};

export default function BooksPage() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();

    const [status, setStatus] = useState<string>("Loading...");
    const [books, setBooks] = useState<Book[]>([]);
    const [title, setTitle] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [msg, setMsg] = useState<string>("");

    const [uploading, setUploading] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);

    async function getAccessToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
    }

    async function loadBooks() {
        setMsg("");
        const token = await getAccessToken();
        if (!token) {
            router.push("/login");
            return;
        }

        // quick approval + admin check
        const { data: { session } } = await supabase.auth.getSession();
        const { data: me, error: meErr } = await supabase
            .from("profiles")
            .select("status,is_admin")
            .eq("id", session!.user.id)
            .single();
        if (meErr) {
            setStatus("Error: " + meErr.message);
            return;
        }
        if (me?.status !== "approved") {
            setStatus("Your account is not approved.");
            return;
        }
        setIsAdmin(!!me?.is_admin);

        setStatus("Loading books...");
        const res = await fetch("/api/books", { headers: { Authorization: `Bearer ${token}` } });
        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        if (!res.ok) {
            setStatus("Error: " + (json?.error ?? text ?? "Unknown"));
            return;
        }

        setBooks((json?.books ?? []) as Book[]);
        setStatus("Ready");
    }

    async function upload() {
        setMsg("");
        if (uploading) return;

        if (!title.trim()) return setMsg("Enter a title.");
        if (!file) return setMsg("Choose a PDF file.");

        const token = await getAccessToken();
        if (!token) {
            router.push("/login");
            return;
        }

        const fd = new FormData();
        fd.append("title", title.trim());
        fd.append("file", file);

        setUploading(true);
        // NOTE: do NOT set msg to "Uploading..." (it was shown twice: msg + button)
        setMsg("");

        const res = await fetch("/api/books/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });

        const text = await res.text();
        let json: any = null;
        try {
            json = text ? JSON.parse(text) : null;
        } catch {
            json = null;
        }

        if (!res.ok) {
            setMsg("Error: " + (json?.error ?? text ?? "Unknown"));
            setUploading(false);
            return;
        }

        setTitle("");
        setFile(null);
        setMsg("Uploaded.");
        setUploading(false);
        await loadBooks();
    }

    async function deleteBook(id: string) {
        const ok = confirm("Delete this book? This also deletes its OpenAI file and vector store.");
        if (!ok) return;

        const token = await getAccessToken();
        if (!token) {
            router.push("/login");
            return;
        }

        setDeletingId(id);
        setMsg("");

        const res = await fetch(`/api/books/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
            const t = await res.text();
            setMsg("Delete failed: " + t);
            setDeletingId(null);
            return;
        }

        setDeletingId(null);
        await loadBooks();
    }

    useEffect(() => {
        loadBooks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const styles = {
        wrap: { padding: 18 } as const,
        h1: { margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: -0.2 } as const,
        muted: { margin: "6px 0 0 0", fontSize: 13, opacity: 0.75 } as const,
        grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 } as const,
        card: { border: "1px solid #efefef", borderRadius: 12, padding: 14, background: "#fafafa" } as const,
        cardTitle: { margin: 0, fontSize: 14, fontWeight: 650 } as const,
        cardDesc: { margin: "6px 0 12px 0", fontSize: 13, opacity: 0.8, lineHeight: 1.35 } as const,
        label: { display: "block", fontSize: 12, opacity: 0.75, marginBottom: 6 } as const,
        input: {
            width: "100%",
            border: "1px solid #d9d9d9",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
            outline: "none",
            background: "#fff",
        } as const,
        row: { display: "flex", gap: 10, alignItems: "center" } as const,
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
        msg: { marginTop: 10, fontSize: 13, opacity: 0.85 } as const,
        list: { marginTop: 12, display: "flex", flexDirection: "column", gap: 8 } as const,
        item: {
            border: "1px solid #efefef",
            borderRadius: 12,
            padding: 12,
            background: "#fff",
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
        } as const,
        itemTitle: { margin: 0, fontSize: 14, fontWeight: 600, lineHeight: 1.2 } as const,
        itemMeta: { margin: "4px 0 0 0", fontSize: 12, opacity: 0.7 } as const,

        // NEW styles for a nice file picker
        fileRow: { display: "flex", alignItems: "center", gap: 10 } as const,
        fileBtn: {
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #d9d9d9",
            background: "#fff",
            cursor: "pointer",
            fontSize: 13,
            userSelect: "none",
            whiteSpace: "nowrap",
        } as const,
        fileName: { fontSize: 13, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } as const,
    };

    return (
        <div style={styles.wrap}>
            <h1 style={styles.h1}>Books</h1>
            <p style={styles.muted}>{status}</p>

            <div style={styles.grid}>
                {/* Upload — admin only */}
                {isAdmin && <div style={styles.card}>
                    <p style={styles.cardTitle}>Upload PDF</p>
                    <p style={styles.cardDesc}>Add a book to your library. It will be indexed for semantic search.</p>

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
                            <label
                                style={
                                    uploading
                                        ? { ...styles.fileBtn, opacity: 0.6, cursor: "not-allowed" }
                                        : styles.fileBtn
                                }
                            >
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

                    <div style={styles.row}>
                        <button
                            style={uploading ? { ...styles.btnPrimary, opacity: 0.6, cursor: "not-allowed" } : styles.btnPrimary}
                            onClick={upload}
                            disabled={uploading}
                        >
                            {uploading ? "Uploading…" : "Upload"}
                        </button>

                        {msg && <div style={styles.msg}>{msg}</div>}
                    </div>
                </div>}

                {/* Library */}
                <div style={styles.card}>
                    <p style={styles.cardTitle}>Library</p>
                    <p style={styles.cardDesc}>Manage uploaded books. Deleting removes all associated data.</p>

                    {books.length === 0 ? (
                        <div style={{ fontSize: 13, opacity: 0.8 }}>No books yet.</div>
                    ) : (
                        <div style={styles.list}>
                            {books.map((b) => (
                                <div key={b.id} style={styles.item}>
                                    <div style={{ minWidth: 0 }}>
                                        <p style={styles.itemTitle}>{b.title}</p>
                                        <p style={styles.itemMeta}>{new Date(b.created_at).toLocaleString()}</p>
                                    </div>

                                    {isAdmin && (
                                        <button
                                            style={
                                                deletingId === b.id ? { ...styles.btn, opacity: 0.6, cursor: "not-allowed" } : styles.btn
                                            }
                                            onClick={() => deleteBook(b.id)}
                                            disabled={deletingId === b.id}
                                            title="Delete book"
                                        >
                                            {deletingId === b.id ? "Deleting…" : "Delete"}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}