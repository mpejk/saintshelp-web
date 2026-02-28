"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function Home() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();

    // Redirect already-authenticated users straight to the app
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) router.replace("/app");
        });
    }, [supabase, router]);

    const styles = {
        page: {
            minHeight: "100vh",
            background: "#f7f7f7",
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            color: "#111",
        },
        inner: {
            maxWidth: 540,
            width: "100%",
            textAlign: "center" as const,
        },
        logo: {
            height: 44,
            marginBottom: 28,
        },
        h1: {
            fontSize: 30,
            fontWeight: 700,
            margin: "0 0 14px 0",
            letterSpacing: -0.5,
            lineHeight: 1.2,
        },
        desc: {
            fontSize: 16,
            color: "#555",
            lineHeight: 1.65,
            margin: "0 0 32px 0",
        },
        actions: {
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap" as const,
        },
        primaryBtn: {
            background: "#111",
            color: "#fff",
            border: "1px solid #111",
            borderRadius: 10,
            padding: "11px 22px",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        secondaryBtn: {
            background: "#fff",
            color: "#111",
            border: "1px solid #d9d9d9",
            borderRadius: 10,
            padding: "11px 22px",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        note: {
            marginTop: 22,
            fontSize: 13,
            color: "#999",
            lineHeight: 1.5,
        },
        features: {
            marginTop: 48,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            textAlign: "left" as const,
        },
        featureCard: {
            background: "#fff",
            border: "1px solid #e7e7e7",
            borderRadius: 12,
            padding: "14px 16px",
        },
        featureTitle: {
            margin: "0 0 6px 0",
            fontSize: 13,
            fontWeight: 650,
        },
        featureDesc: {
            margin: 0,
            fontSize: 12,
            color: "#666",
            lineHeight: 1.5,
        },
    };

    return (
        <div style={styles.page}>
            <div style={styles.inner}>
                <img src="/logo.svg" alt="SaintsHelp" style={styles.logo} />

                <h1 style={styles.h1}>Find what the saints actually said.</h1>

                <p style={styles.desc}>
                    SaintsHelp searches theological texts and returns verbatim quotations —
                    no paraphrasing, no AI-generated answers. Only the exact words from
                    primary sources like scripture and the Church Fathers.
                </p>

                <div style={styles.actions}>
                    <button style={styles.primaryBtn} onClick={() => router.push("/login")}>
                        Sign in
                    </button>
                    <button style={styles.secondaryBtn} onClick={() => router.push("/login?mode=signup")}>
                        Create account
                    </button>
                </div>

                <p style={styles.note}>
                    Access is by approval only. After confirming your email, an admin will
                    review and activate your account.
                </p>

                <div style={styles.features}>
                    <div style={styles.featureCard}>
                        <p style={styles.featureTitle}>Verbatim only</p>
                        <p style={styles.featureDesc}>Every result is a direct quote from the source text — nothing invented or summarised.</p>
                    </div>
                    <div style={styles.featureCard}>
                        <p style={styles.featureTitle}>Primary sources</p>
                        <p style={styles.featureDesc}>Search scripture, the Desert Fathers, Church Fathers, and other theological works.</p>
                    </div>
                    <div style={styles.featureCard}>
                        <p style={styles.featureTitle}>Cited results</p>
                        <p style={styles.featureDesc}>Each passage shows the book it came from so you can verify and reference it.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
