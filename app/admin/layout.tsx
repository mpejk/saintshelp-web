"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useTheme, tc } from "@/lib/theme";
import { useLocale } from "@/lib/i18n";

type Profile = {
    status: "pending" | "approved" | "blocked";
    is_admin: boolean;
    email: string | null;
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();
    const pathname = usePathname();

    const [profile, setProfile] = useState<Profile | null>(null);
    const [loading, setLoading] = useState(true);

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

            if (error || !data) {
                router.push("/app");
                return;
            }

            const p = data as Profile;
            if (!p.is_admin) {
                router.push("/app");
                return;
            }

            setProfile(p);
            setLoading(false);
        })();
    }, [router, supabase]);

    async function signOut() {
        await supabase.auth.signOut();
        router.push("/login");
    }

    const { isDark, toggle } = useTheme();
    const t = tc(isDark);
    const { locale, setLocale, t: tr } = useLocale();

    const styles = {
        page: {
            fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
            color: t.fg,
        } as const,
        nav: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" as const } as const,
        btn: {
            border: `1px solid ${t.btnBorder}`,
            background: t.btnBg,
            color: t.btnFg,
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        btnActive: {
            border: `1px solid ${t.btnActiveBorder}`,
            background: t.btnActiveBg,
            color: t.btnActiveFg,
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        content: {
            border: `1px solid ${t.border}`,
            borderRadius: 12,
            background: t.cardBg,
        } as const,
        meta: { fontSize: 12, opacity: 0.75 } as const,
        logoWrap: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" } as const,
        logo: { height: 34, width: "auto", display: "block", filter: isDark ? "invert(1)" : "none" } as const,
    };

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
    const linkStyle = (href: string) => (isActive(href) ? styles.btnActive : styles.btn);

    if (loading) return <main className="app-page" style={styles.page}>{tr("loading")}</main>;

    return (
        <main className="app-page" style={styles.page}>
            <div className="app-topbar">
                <div style={styles.logoWrap} onClick={() => router.push("/app")} role="button">
                    <img src="/logo.svg" alt="SaintsHelp" style={styles.logo} />
                </div>

                <div className="app-nav" style={styles.nav}>
                    <button
                        onClick={() => setLocale(locale === "en" ? "hr" : "en")}
                        title={locale === "en" ? "Hrvatski" : "English"}
                        style={{ ...styles.btn, fontSize: 12, padding: "6px 10px", fontWeight: 600 }}
                    >
                        {locale === "en" ? "HR" : "EN"}
                    </button>
                    <button
                        onClick={toggle}
                        title={isDark ? tr("themeLight") : tr("themeDark")}
                        style={{ ...styles.btn, fontSize: 16, padding: "6px 10px" }}
                    >
                        {isDark ? "☀" : "☾"}
                    </button>
                    <button style={linkStyle("/app")} onClick={() => router.push("/app")}>
                        {tr("navHome")}
                    </button>
                    <button style={linkStyle("/app/books")} onClick={() => router.push("/app/books")}>
                        {tr("navBooks")}
                    </button>
                    <button style={linkStyle("/app/ask")} onClick={() => router.push("/app/ask")}>
                        {tr("navAsk")}
                    </button>
                    <button style={linkStyle("/admin")} onClick={() => router.push("/admin")}>
                        {tr("navAdmin")}
                    </button>

                    <button style={styles.btn} onClick={signOut}>
                        {tr("signOut")}
                    </button>

                    {profile?.email && <div style={styles.meta}>{profile.email}</div>}
                </div>
            </div>

            <div className="app-content" style={styles.content}>{children}</div>
        </main>
    );
}