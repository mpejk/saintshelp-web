"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Suspense } from "react";

function LoginForm() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();
    const searchParams = useSearchParams();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [mode, setMode] = useState<"signin" | "signup">("signin");

    // Open directly in signup mode if ?mode=signup is in the URL
    useEffect(() => {
        if (searchParams.get("mode") === "signup") setMode("signup");
    }, [searchParams]);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState("");
    const [msgIsError, setMsgIsError] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [resetSent, setResetSent] = useState(false);

    async function submit() {
        setMsg("");
        setMsgIsError(false);
        if (!email.trim()) { setMsg("Enter email."); setMsgIsError(true); return; }
        if (!password) { setMsg("Enter password."); setMsgIsError(true); return; }

        setLoading(true);

        if (mode === "signin") {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });
            if (error) {
                setMsg(error.message);
                setMsgIsError(true);
                setLoading(false);
                return;
            }
            router.push("/app");
        } else {
            const { error } = await supabase.auth.signUp({
                email: email.trim(),
                password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                },
            });
            if (error) {
                setMsg(error.message);
                setMsgIsError(true);
            } else {
                setConfirming(true);
            }
            setLoading(false);
        }
    }

    async function sendReset() {
        setMsg("");
        setMsgIsError(false);
        if (!email.trim()) { setMsg("Enter your email address first."); setMsgIsError(true); return; }
        setLoading(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/auth/callback`,
        });
        setLoading(false);
        if (error) {
            setMsg(error.message);
            setMsgIsError(true);
        } else {
            setResetSent(true);
        }
    }

    const pageStyle: React.CSSProperties = {
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f7f7",
        color: "#111",
        opacity: 1,
        filter: "none",
    };

    const cardStyle: React.CSSProperties = {
        width: "100%",
        maxWidth: 420,
        background: "#ffffff",
        border: "1px solid #e7e7e7",
        borderRadius: 14,
        padding: 20,
        color: "#111",
        opacity: 1,
        filter: "none",
        boxShadow: "0 4px 20px rgba(0,0,0,0.05)",
    };

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "10px 12px",
        marginTop: 6,
        borderRadius: 10,
        border: "1px solid #d9d9d9",
        fontSize: 14,
        background: "#fff",
        color: "#111",
        outline: "none",
    };

    const primaryBtn: React.CSSProperties = {
        background: "#111",
        color: "#fff",
        border: "1px solid #111",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        cursor: "pointer",
    };

    const secondaryBtn: React.CSSProperties = {
        background: "#fff",
        color: "#111",
        border: "1px solid #d9d9d9",
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        cursor: "pointer",
    };

    if (resetSent) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Check your email</h2>
                    <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
                        We sent a password reset link to <b>{email}</b>. Click it to set a new password.
                    </p>
                    <div style={{ marginTop: 18 }}>
                        <button
                            style={secondaryBtn}
                            onClick={() => {
                                setResetting(false);
                                setResetSent(false);
                                setMsg("");
                            }}
                        >
                            Back to sign in
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (resetting) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Reset password</h2>
                    <div style={{ marginTop: 16 }}>
                        <label style={{ fontSize: 12 }}>Email</label>
                        <input
                            style={inputStyle}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                        <button style={primaryBtn} onClick={sendReset} disabled={loading}>
                            {loading ? "Sending…" : "Send reset link"}
                        </button>
                        <button
                            style={secondaryBtn}
                            onClick={() => { setResetting(false); setMsg(""); }}
                        >
                            Cancel
                        </button>
                    </div>
                    {msg && (
                        <div style={{ marginTop: 14, fontSize: 13, color: msgIsError ? "#c0392b" : "#111" }}>
                            {msg}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    if (confirming) {
        return (
            <div style={pageStyle}>
                <div style={cardStyle}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>Check your email</h2>
                    <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
                        We sent a confirmation link to <b>{email}</b>. Click it to verify your address.
                    </p>
                    <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: "#666" }}>
                        After confirming, your account will be reviewed by an admin before you can sign in.
                        This typically takes a day or two.
                    </p>
                    <div style={{ marginTop: 18 }}>
                        <button
                            style={secondaryBtn}
                            onClick={() => {
                                setConfirming(false);
                                setMode("signin");
                                setMsg("");
                            }}
                        >
                            Back to sign in
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={pageStyle}>
            <div style={{ width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <img src="/logo.svg" alt="SaintsHelp" style={{ height: 40, width: "auto" }} />
            </div>
            <div style={cardStyle}>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                    {mode === "signin" ? "Sign in" : "Sign up"}
                </h2>

                <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12 }}>Email</label>
                    <input
                        style={inputStyle}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                    />
                </div>

                <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 12 }}>Password</label>
                    <input
                        style={inputStyle}
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoComplete={
                            mode === "signin"
                                ? "current-password"
                                : "new-password"
                        }
                        onKeyDown={(e) => {
                            if (e.key === "Enter") submit();
                        }}
                    />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button
                        style={primaryBtn}
                        onClick={submit}
                        disabled={loading}
                    >
                        {loading
                            ? "Working…"
                            : mode === "signin"
                                ? "Sign in"
                                : "Sign up"}
                    </button>

                    <button
                        style={secondaryBtn}
                        onClick={() =>
                            setMode((m) =>
                                m === "signin" ? "signup" : "signin"
                            )
                        }
                    >
                        {mode === "signin"
                            ? "Create account"
                            : "Back to sign in"}
                    </button>
                </div>

                {msg && (
                    <div style={{ marginTop: 14, fontSize: 13, color: msgIsError ? "#c0392b" : "#111" }}>
                        {msg}
                    </div>
                )}

                {mode === "signin" && (
                    <div style={{ marginTop: 14 }}>
                        <button
                            style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: "#555", cursor: "pointer", textDecoration: "underline" }}
                            onClick={() => { setResetting(true); setMsg(""); }}
                        >
                            Forgot password?
                        </button>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense>
            <LoginForm />
        </Suspense>
    );
}