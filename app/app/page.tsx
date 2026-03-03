"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";
import { useTheme, tc } from "@/lib/theme";
import { useLocale } from "@/lib/i18n";

type Profile = {
    status: "pending" | "approved" | "blocked";
    is_admin: boolean;
    email: string | null;
};

export default function AppHome() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();
    const { isDark } = useTheme();
    const t = tc(isDark);
    const { t: tr } = useLocale();

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
            border: `1px solid ${t.border}`,
            background: t.cardBg,
            fontSize: 12,
            marginTop: 12,
        } as const,
        card: {
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            padding: 14,
            background: t.cardBg,
        } as const,
        cardTitle: { margin: 0, fontSize: 14, fontWeight: 650 } as const,
        cardDesc: { margin: "6px 0 10px 0", fontSize: 13, opacity: 0.8, lineHeight: 1.35 } as const,
        btnPrimary: {
            border: `1px solid ${t.btnActiveBorder}`,
            background: t.btnActiveBg,
            color: t.btnActiveFg,
            borderRadius: 10,
            padding: "8px 12px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        note: { marginTop: 14, fontSize: 13, opacity: 0.85 } as const,
    };

    return (
        <div style={styles.wrap}>
            <h1 style={styles.h1}>{tr("homeTitle")}</h1>

            <div style={styles.pill}>
                {tr("homeStatus")} <b style={{ textTransform: "capitalize" }}>{profile.status}</b>
            </div>

            {profile.status === "pending" && (
                <div style={{ ...styles.note, lineHeight: 1.65 }}>
                    <b>{tr("homePendingMsg")}</b>
                    <br />
                    {tr("homePendingDetail")}
                </div>
            )}

            {profile.status === "blocked" && (
                <p style={styles.note}>{tr("homeBlockedMsg")}</p>
            )}

            {approved && (
                <div className="home-grid">
                    {profile.is_admin && (
                        <div style={styles.card}>
                            <p style={styles.cardTitle}>{tr("homeManageBooks")}</p>
                            <p style={styles.cardDesc}>{tr("homeManageBooksDesc")}</p>
                            <button style={styles.btnPrimary} onClick={() => router.push("/app/books")}>
                                {tr("homeOpenBooks")}
                            </button>
                        </div>
                    )}

                    <div style={styles.card}>
                        <p style={styles.cardTitle}>{tr("homeAskTitle")}</p>
                        <p style={styles.cardDesc}>{tr("homeAskDesc")}</p>
                        <button style={styles.btnPrimary} onClick={() => router.push("/app/ask")}>
                            {tr("homeOpenAsk")}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
