"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useTheme, tc } from "@/lib/theme";

export default function Home() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();
    const { isDark, toggle } = useTheme();
    const t = tc(isDark);

    // Redirect already-authenticated users straight to the app
    useEffect(() => {
        supabase.auth.getSession().then(({ data }) => {
            if (data.session) router.replace("/app");
        });
    }, [supabase, router]);

    const styles = {
        page: {
            minHeight: "100vh",
            background: t.pageBg,
            display: "flex",
            flexDirection: "column" as const,
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            color: t.fg,
        },
        inner: {
            maxWidth: 540,
            width: "100%",
            textAlign: "center" as const,
        },
        logo: {
            height: 44,
            marginBottom: 28,
            filter: isDark ? "invert(1)" : "none",
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
            color: t.fgMuted,
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
            background: t.btnActiveBg,
            color: t.btnActiveFg,
            border: `1px solid ${t.btnActiveBorder}`,
            borderRadius: 10,
            padding: "11px 22px",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        secondaryBtn: {
            background: t.btnBg,
            color: t.btnFg,
            border: `1px solid ${t.btnBorder}`,
            borderRadius: 10,
            padding: "11px 22px",
            fontSize: 14,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        note: {
            marginTop: 22,
            fontSize: 13,
            color: t.fgSubtle,
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
            background: t.cardBg,
            border: `1px solid ${t.border}`,
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
            color: t.fgMuted,
            lineHeight: 1.5,
        },
        toggleBtn: {
            position: "fixed" as const,
            top: 16,
            right: 16,
            border: `1px solid ${t.btnBorder}`,
            background: t.btnBg,
            color: t.btnFg,
            borderRadius: 10,
            padding: "6px 10px",
            fontSize: 16,
            cursor: "pointer",
        },
    };

    return (
        <div style={styles.page}>
            <button onClick={toggle} title={isDark ? "Switch to light mode" : "Switch to dark mode"} style={styles.toggleBtn}>
                {isDark ? "☀" : "☾"}
            </button>
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

                <div className="landing-features">
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
