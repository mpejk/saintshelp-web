"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Profile = {
    status: "pending" | "approved" | "blocked";
    is_admin: boolean;
    email: string | null;
};

export default function AppHome() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [err, setErr] = useState<string>("");

    useEffect(() => {
        (async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const session = sessionData.session;
            if (!session) {
                router.push("/login");
                return;
            }

            const { data, error } = await supabase
                .from("profiles")
                .select("status,is_admin,email")
                .eq("id", session.user.id)
                .single();

            if (error) setErr(error.message);
            else setProfile(data as Profile);
        })();
    }, [router, supabase]);

    if (err) return <div style={{ padding: 18 }}>Error: {err}</div>;
    if (!profile) return <div style={{ padding: 18 }}>Loading...</div>;

    const approved = profile.status === "approved";

    const styles = {
        wrap: { padding: 18 } as const,
        h1: { margin: 0, fontSize: 20, letterSpacing: -0.2 } as const,
        muted: { margin: "8px 0 0 0", fontSize: 13, opacity: 0.75 } as const,
        pill: {
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #efefef",
            background: "#fafafa",
            fontSize: 12,
            marginTop: 12,
        } as const,
        grid: {
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 16,
        } as const,
        card: {
            border: "1px solid #efefef",
            borderRadius: 12,
            padding: 14,
            background: "#fafafa",
        } as const,
        cardTitle: { margin: 0, fontSize: 14, fontWeight: 650 } as const,
        cardDesc: { margin: "6px 0 10px 0", fontSize: 13, opacity: 0.8, lineHeight: 1.35 } as const,
        btnPrimary: {
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        note: { marginTop: 14, fontSize: 13, opacity: 0.85 } as const,
    };

    return (
        <div style={styles.wrap}>
            <h1 style={styles.h1}>Home</h1>

            <div style={styles.pill}>
                Status: <b style={{ textTransform: "capitalize" }}>{profile.status}</b>
            </div>

            {profile.status === "pending" && (
                <div style={{ ...styles.note, lineHeight: 1.65 }}>
                    <b>Your account is pending admin approval.</b>
                    <br />
                    This is a manual review — you will be able to use SaintsHelp once an admin
                    activates your account. This typically takes a day or two. You can check
                    back here at any time to see your status.
                </div>
            )}

            {profile.status === "blocked" && (
                <p style={styles.note}>Your account is blocked. Contact an admin if this is a mistake.</p>
            )}

            {approved && (
                <div className="home-grid">
                    {profile.is_admin && (
                        <div style={styles.card}>
                            <p style={styles.cardTitle}>Manage books</p>
                            <p style={styles.cardDesc}>Upload PDFs, delete books, and manage your library.</p>
                            <button style={styles.btnPrimary} onClick={() => router.push("/app/books")}>
                                Open Books
                            </button>
                        </div>
                    )}

                    <div style={styles.card}>
                        <p style={styles.cardTitle}>Ask SaintsHelp</p>
                        <p style={styles.cardDesc}>Ask questions and receive verbatim quotations only.</p>
                        <button style={styles.btnPrimary} onClick={() => router.push("/app/ask")}>
                            Open Ask
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}