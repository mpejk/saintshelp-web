"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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

    const styles = {
        page: {
            maxWidth: 1100,
            margin: "28px auto",
            padding: 16,
            fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
            color: "#111",
        } as const,
        topbar: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 16,
        } as const,
        brand: { fontSize: 18, fontWeight: 650, letterSpacing: -0.2 } as const,
        nav: { display: "flex", gap: 8, alignItems: "center" } as const,
        btn: {
            border: "1px solid #d9d9d9",
            background: "#fff",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        btnActive: {
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
        } as const,
        btnGhost: {
            border: "1px solid transparent",
            background: "transparent",
            borderRadius: 10,
            padding: "8px 10px",
            fontSize: 13,
            cursor: "pointer",
            opacity: 0.85,
        } as const,
        content: {
            border: "1px solid #e7e7e7",
            borderRadius: 12,
            background: "#fff",
        } as const,
        headerRight: { display: "flex", gap: 10, alignItems: "center" } as const,
        meta: { fontSize: 12, opacity: 0.75 } as const,
    };

    const linkStyle = (href: string) => {
        const isActive = pathname === href || (href !== "/app" && pathname.startsWith(href));
        return isActive ? styles.btnActive : styles.btn;
    };

    return (
        <main style={styles.page}>
            <div style={styles.topbar}>
                <div
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => router.push("/app")}
                    role="button"
                >
                    <img src="/saintshelp-logo.svg" alt="SaintsHelp" style={{ width: 22, height: 22 }} />
                    <div style={styles.brand}>SaintsHelp</div>
                </div>

                <div style={styles.nav}>
                    {approved ? (
                        <>
                            <button style={styles.btnGhost} onClick={() => router.back()}>
                                Back
                            </button>

                            <button style={linkStyle("/app")} onClick={() => router.push("/app")}>
                                Home
                            </button>

                            <button style={linkStyle("/app/books")} onClick={() => router.push("/app/books")}>
                                Books
                            </button>

                            <button style={linkStyle("/app/ask")} onClick={() => router.push("/app/ask")}>
                                Ask
                            </button>

                            {isAdmin && (
                                <button style={styles.btn} onClick={() => router.push("/admin")}>
                                    Admin
                                </button>
                            )}

                            <button style={styles.btn} onClick={signOut}>
                                Sign out
                            </button>
                        </>
                    ) : (
                        <>
                            <button style={linkStyle("/app/ask")} onClick={() => router.push("/app/ask")}>
                                Ask
                            </button>

                            <button style={styles.btn} onClick={signOut}>
                                Sign out
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div style={styles.content}>{children}</div>
        </main>
    );
}