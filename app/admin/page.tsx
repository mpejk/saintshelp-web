"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useTheme, tc } from "@/lib/theme";

type UserRow = {
    id: string;
    email: string | null;
    status: "pending" | "approved" | "blocked";
    is_admin: boolean;
    created_at?: string;
};

export default function AdminPage() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const { isDark } = useTheme();
    const t = tc(isDark);

    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    async function getAccessToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token ?? null;
    }

    async function load() {
        setLoading(true);
        setErr(null);

        const token = await getAccessToken();
        if (!token) {
            setErr("Not logged in");
            setUsers([]);
            setLoading(false);
            return;
        }

        const r = await fetch("/api/admin/users", {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        const j = await r.json().catch(() => ({}));

        if (!r.ok) {
            setErr(j?.error ?? "Failed to load users");
            setUsers([]);
            setLoading(false);
            return;
        }

        setUsers(Array.isArray(j?.users) ? j.users : []);
        setLoading(false);
    }

    async function setStatus(userId: string, status: UserRow["status"]) {
        setErr(null);

        const token = await getAccessToken();
        if (!token) {
            setErr("Not logged in");
            return;
        }

        const r = await fetch(`/api/admin/users/${userId}`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status }),
        });

        const j = await r.json().catch(() => ({}));
        if (!r.ok) {
            setErr(j?.error ?? "Failed to update");
            return;
        }

        await load();
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const badgeBg = (s: string) => {
        if (s === "approved") return isDark ? "#1a2e1c" : "#f0fff4";
        if (s === "blocked") return isDark ? "#2e1a1a" : "#fff5f5";
        return t.cardBg;
    };

    const styles = {
        wrap: { padding: 18 } as const,
        h1: { margin: 0, fontSize: 18, fontWeight: 650, letterSpacing: -0.2 } as const,
        muted: { margin: "8px 0 0 0", fontSize: 13, opacity: 0.75 } as const,
        error: { marginTop: 10, color: isDark ? "#ff6b6b" : "#b00020", fontSize: 13 } as const,
        table: { width: "100%", borderCollapse: "collapse" as const, marginTop: 14 } as const,
        th: {
            textAlign: "left" as const,
            fontSize: 12,
            opacity: 0.7,
            padding: "10px 8px",
            borderBottom: `1px solid ${t.border}`,
        } as const,
        td: {
            padding: "10px 8px",
            borderBottom: `1px solid ${t.border}`,
            fontSize: 13,
            verticalAlign: "middle" as const,
        } as const,
        btn: {
            border: `1px solid ${t.btnBorder}`,
            background: t.btnBg,
            color: t.btnFg,
            borderRadius: 10,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
        } as const,
        btnPrimary: {
            border: `1px solid ${t.btnActiveBorder}`,
            background: t.btnActiveBg,
            color: t.btnActiveFg,
            borderRadius: 10,
            padding: "6px 10px",
            fontSize: 12,
            cursor: "pointer",
        } as const,
        rowActions: { display: "flex", gap: 8, alignItems: "center" } as const,
    };

    return (
        <div style={styles.wrap}>
            <h1 style={styles.h1}>Admin</h1>
            <p style={styles.muted}>Approve or block newly registered users.</p>

            {err && <div style={styles.error}>{err}</div>}

            {loading ? (
                <div style={{ marginTop: 14, fontSize: 13 }}>Loading…</div>
            ) : (
                <div style={{ overflowX: "auto", marginTop: 14 }}>
                <table style={{ ...styles.table, marginTop: 0 }}>
                    <thead>
                        <tr>
                            <th style={styles.th}>Email</th>
                            <th style={styles.th}>Status</th>
                            <th style={styles.th}>Admin</th>
                            <th style={styles.th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map((u) => (
                            <tr key={u.id}>
                                <td style={styles.td}>{u.email ?? "(no email)"}</td>
                                <td style={styles.td}>
                                    <span style={{
                                        display: "inline-block",
                                        padding: "3px 8px",
                                        borderRadius: 999,
                                        fontSize: 12,
                                        border: `1px solid ${t.border}`,
                                        background: badgeBg(u.status),
                                    }}>{u.status}</span>
                                </td>
                                <td style={styles.td}>{u.is_admin ? "yes" : "no"}</td>
                                <td style={styles.td}>
                                    <div style={styles.rowActions}>
                                        <button style={styles.btnPrimary} onClick={() => setStatus(u.id, "approved")}>
                                            Approve
                                        </button>
                                        <button style={styles.btn} onClick={() => setStatus(u.id, "blocked")}>
                                            Block
                                        </button>
                                        <button style={styles.btn} onClick={() => setStatus(u.id, "pending")}>
                                            Pending
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}

                        {users.length === 0 && (
                            <tr>
                                <td style={styles.td} colSpan={4}>
                                    No users found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>
            )}
        </div>
    );
}
