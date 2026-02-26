"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

type Profile = {
    status: "pending" | "approved" | "blocked";
    is_admin: boolean;
    email: string | null;
};

export default function AppHome() {
    const supabase = supabaseBrowser();
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

    async function signOut() {
        await supabase.auth.signOut();
        router.push("/login");
    }

    if (err) return <main style={{ padding: 16 }}>Error: {err}</main>;
    if (!profile) return <main style={{ padding: 16 }}>Loading...</main>;

    return (
        <main style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
            <h1>SaintsHelp</h1>
            <p>Signed in as: {profile.email}</p>
            <p>
                Status: <b>{profile.status}</b>
            </p>

            {profile.status === "pending" && <p>Your account is pending approval.</p>}
            {profile.status === "blocked" && <p>Your account is blocked.</p>}

            {profile.status === "approved" && (
                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                    <button onClick={() => router.push("/app/books")}>
                        Manage Books
                    </button>

                    <button onClick={() => router.push("/app/ask")}>
                        Ask SaintsHelp
                    </button>
                </div>
            )}

            {profile.is_admin && (
                <div style={{ marginTop: 16 }}>
                    <button onClick={() => router.push("/admin")}>Admin</button>
                </div>
            )}

            <div style={{ marginTop: 24 }}>
                <button onClick={signOut}>Sign out</button>
            </div>
        </main>
    );
}