"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
        content: {
            border: "1px solid #e7e7e7",
            borderRadius: 12,
            background: "#fff",
        } as const,
        meta: { fontSize: 12, opacity: 0.75 } as const,
        logoWrap: { display: "flex", alignItems: "center", gap: 10, cursor: "pointer" } as const,
        logo: { height: 34, width: "auto", display: "block" } as const,
    };

    const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");
    const linkStyle = (href: string) => (isActive(href) ? styles.btnActive : styles.btn);

    if (loading) return <main style={styles.page}>Loading…</main>;

    return (
        <main style={styles.page}>
            <div style={styles.topbar}>
                <div style={styles.logoWrap} onClick={() => router.push("/app")} role="button">
                    <img src="/logo.svg" alt="SaintsHelp" style={styles.logo} />
                </div>

                <div style={styles.nav}>
                    <button style={linkStyle("/app")} onClick={() => router.push("/app")}>
                        Home
                    </button>
                    <button style={linkStyle("/app/books")} onClick={() => router.push("/app/books")}>
                        Books
                    </button>
                    <button style={linkStyle("/app/ask")} onClick={() => router.push("/app/ask")}>
                        Ask
                    </button>
                    <button style={linkStyle("/admin")} onClick={() => router.push("/admin")}>
                        Admin
                    </button>

                    <button style={styles.btn} onClick={signOut}>
                        Sign out
                    </button>

                    {profile?.email && <div style={styles.meta}>{profile.email}</div>}
                </div>
            </div>

            <div style={styles.content}>{children}</div>
        </main>
    );
}