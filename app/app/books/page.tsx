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

        // optional: check approval status quickly
        const { data: me, error: meErr } = await supabase
            .from("profiles")
            .select("status")
            .single();

        if (meErr) {
            setStatus("Error: " + meErr.message);
            return;
        }
        if (me?.status !== "approved") {
            setStatus("Your account is not approved.");
            return;
        }

        setStatus("Loading books...");
        const res = await fetch("/api/books", {
            headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) {
            setStatus("Error: " + (json.error ?? "Unknown"));
            return;
        }
        setBooks(json.books ?? []);
        setStatus("Ready");
    }

    async function upload() {
        setMsg("");
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

        setMsg("Uploading...");
        const res = await fetch("/api/books/upload", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: fd,
        });

        const json = await res.json();
        if (!res.ok) {
            setMsg("Error: " + (json.error ?? "Unknown"));
            return;
        }

        setTitle("");
        setFile(null);
        setMsg("Uploaded.");
        await loadBooks();
    }

    useEffect(() => {
        loadBooks();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
            <h1>SaintsHelp — Books</h1>

            <div style={{ marginTop: 12, padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
                <h2 style={{ marginTop: 0 }}>Upload PDF</h2>

                <label>Title</label>
                <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    style={{ width: "100%", marginBottom: 12 }}
                    placeholder="e.g. Confessions (Augustine)"
                />

                <label>PDF</label>
                <input
                    type="file"
                    accept="application/pdf"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    style={{ width: "100%", marginBottom: 12 }}
                />

                <button onClick={upload}>Upload</button>
                {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
            </div>

            <div style={{ marginTop: 24 }}>
                <h2>Your books</h2>
                <p>{status}</p>

                {books.length === 0 ? (
                    <p>No books yet.</p>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr>
                                <th align="left">Title</th>
                                <th align="left">Uploaded</th>
                            </tr>
                        </thead>
                        <tbody>
                            {books.map((b) => (
                                <tr key={b.id} style={{ borderTop: "1px solid #eee" }}>
                                    <td style={{ padding: "8px 0" }}>{b.title}</td>
                                    <td style={{ padding: "8px 0" }}>
                                        {new Date(b.created_at).toLocaleString()}
                                    </td>
                                    <td>
                                        <button
                                            onClick={async () => {
                                                const token = await getAccessToken();
                                                if (!token) return;

                                                await fetch(`/api/books/${b.id}`, {
                                                    method: "DELETE",
                                                    headers: {
                                                        Authorization: `Bearer ${token}`,
                                                    },
                                                });

                                                await loadBooks();
                                            }}
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </main>
    );
}