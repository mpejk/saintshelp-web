"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useTheme, tc } from "@/lib/theme";

type Profile = {
    status: "pending" | "approved" | "blocked";
    is_admin: boolean;
    email: string | null;
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

            // If profile fetch fails, still allow rendering but without admin link
            if (!error && data) setProfile(data as Profile);

            setLoading(false);
        })();
    }, [router, supabase]);

    async function signOut() {
        await supabase.auth.signOut();
        router.push("/login");
    }

    const approved = profile?.status === "approved";
    const isAdmin = !!profile?.is_admin;

    const { isDark, toggle } = useTheme();
    const t = tc(isDark);

    const styles = {
        page: {
            fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
            color: t.fg,
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
        logoWrap: {
            display: "flex",
            alignItems: "center",
            gap: 10,
            cursor: "pointer",
            userSelect: "none",
        } as const,
        logoImg: {
            height: 34,
            width: "auto",
            display: "block",
            filter: isDark ? "invert(1)" : "none",
        } as const,
    };

    const linkStyle = (href: string) => {
        const isActive = pathname === href || (href !== "/app" && pathname.startsWith(href));
        return isActive ? styles.btnActive : styles.btn;
    };

    if (loading) {
        return <main className="app-page" style={styles.page}>Loading…</main>;
    }

    return (
        <main className="app-page" style={styles.page}>
            <div className="app-topbar">
                <div style={styles.logoWrap} onClick={() => router.push("/app")} role="button">
                    <img src="/logo.svg" alt="SaintsHelp" style={styles.logoImg} />
                </div>

                <div className="app-nav">
                    <button
                        onClick={toggle}
                        title={isDark ? "Switch to light mode" : "Switch to dark mode"}
                        style={{ ...styles.btn, fontSize: 16, padding: "6px 10px" }}
                    >
                        {isDark ? "☀" : "☾"}
                    </button>
                    {approved ? (
                        <>
                            <button style={linkStyle("/app")} onClick={() => router.push("/app")}>
                                Home
                            </button>

                            {isAdmin && (
                                <button style={linkStyle("/app/books")} onClick={() => router.push("/app/books")}>
                                    Books
                                </button>
                            )}

                            <button style={linkStyle("/app/ask")} onClick={() => router.push("/app/ask")}>
                                Ask
                            </button>

                            {isAdmin && (
                                <button style={linkStyle("/admin")} onClick={() => router.push("/admin")}>
                                    Admin
                                </button>
                            )}

                            <button style={styles.btn} onClick={signOut}>
                                Sign out
                            </button>

                            {profile?.email && <div style={styles.meta}>{profile.email}</div>}
                        </>
                    ) : (
                        <>
                            <button style={linkStyle("/app/ask")} onClick={() => router.push("/app/ask")}>
                                Ask
                            </button>

                            <button style={styles.btn} onClick={signOut}>
                                Sign out
                            </button>

                            {profile?.email && <div style={styles.meta}>{profile.email}</div>}
                        </>
                    )}
                </div>
            </div>

            <div className="app-content" style={styles.content}>{children}</div>
        </main>
    );
}