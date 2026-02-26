"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useRouter } from "next/navigation";

export default function LoginPage() {
    const supabase = supabaseBrowser();
    const router = useRouter();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [msg, setMsg] = useState<string>("");

    async function signUp() {
        setMsg("");
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) setMsg(error.message);
        else setMsg("Signed up. Now sign in. (You will need approval.)");
    }

    async function signIn() {
        setMsg("");
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setMsg(error.message);
        else router.push("/app");
    }

    return (
        <main style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
            <h1>SaintsHelp</h1>
            <p>Login</p>

            <label>Email</label>
            <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: "100%", marginBottom: 12 }}
            />

            <label>Password</label>
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: "100%", marginBottom: 12 }}
            />

            <div style={{ display: "flex", gap: 8 }}>
                <button onClick={signIn}>Sign in</button>
                <button onClick={signUp}>Sign up</button>
            </div>

            {msg && <p style={{ marginTop: 12 }}>{msg}</p>}
        </main>
    );
}