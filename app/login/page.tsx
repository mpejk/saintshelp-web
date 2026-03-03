"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { Suspense } from "react";
import { useTheme, tc } from "@/lib/theme";
import { useLocale } from "@/lib/i18n";

function LoginForm() {
    const supabase = useMemo(() => supabaseBrowser(), []);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { isDark, toggle } = useTheme();
    const t = tc(isDark);
    const { locale, setLocale, t: tr } = useLocale();

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
        if (!email.trim()) { setMsg(tr("loginEnterEmail")); setMsgIsError(true); return; }
        if (!password) { setMsg(tr("loginEnterPassword")); setMsgIsError(true); return; }

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
        if (!email.trim()) { setMsg(tr("loginEnterEmail")); setMsgIsError(true); return; }
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
        background: t.pageBg,
        color: t.fg,
    };

    const cardStyle: React.CSSProperties = {
        width: "100%",
        maxWidth: 420,
        background: t.cardBg,
        border: `1px solid ${t.border}`,
        borderRadius: 14,
        padding: 20,
        color: t.fg,
        boxShadow: isDark ? "none" : "0 4px 20px rgba(0,0,0,0.05)",
    };

    const inputStyle: React.CSSProperties = {
        width: "100%",
        padding: "10px 12px",
        marginTop: 6,
        borderRadius: 10,
        border: `1px solid ${t.borderInput}`,
        fontSize: 14,
        background: t.inputBg,
        color: t.fg,
        outline: "none",
    };

    const primaryBtn: React.CSSProperties = {
        background: t.btnActiveBg,
        color: t.btnActiveFg,
        border: `1px solid ${t.btnActiveBorder}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        cursor: "pointer",
    };

    const secondaryBtn: React.CSSProperties = {
        background: t.btnBg,
        color: t.btnFg,
        border: `1px solid ${t.btnBorder}`,
        borderRadius: 10,
        padding: "10px 14px",
        fontSize: 14,
        cursor: "pointer",
    };

    const toggleBtnStyle: React.CSSProperties = {
        position: "fixed",
        top: 16,
        right: 16,
        border: `1px solid ${t.btnBorder}`,
        background: t.btnBg,
        color: t.btnFg,
        borderRadius: 10,
        padding: "6px 10px",
        fontSize: 16,
        cursor: "pointer",
    };

    const langToggle = (
        <div style={{ position: "fixed", top: 16, right: 16, display: "flex", gap: 8 }}>
            <button
                onClick={() => setLocale(locale === "en" ? "hr" : "en")}
                title={locale === "en" ? "Hrvatski" : "English"}
                style={{ ...toggleBtnStyle, position: "static", fontSize: 12, fontWeight: 600 }}
            >
                {locale === "en" ? "HR" : "EN"}
            </button>
            <button onClick={toggle} title={isDark ? tr("themeLight") : tr("themeDark")} style={{ ...toggleBtnStyle, position: "static" }}>
                {isDark ? "☀" : "☾"}
            </button>
        </div>
    );

    if (resetSent) {
        return (
            <div style={pageStyle}>
                {langToggle}
                <div style={cardStyle}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{tr("loginCheckEmail")}</h2>
                    <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
                        {tr("loginResetSent", { email })}
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
                            {tr("loginBackToSignIn")}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (resetting) {
        return (
            <div style={pageStyle}>
                {langToggle}
                <div style={cardStyle}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{tr("loginResetPassword")}</h2>
                    <div style={{ marginTop: 16 }}>
                        <label style={{ fontSize: 12 }}>{tr("loginEmail")}</label>
                        <input
                            style={inputStyle}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>
                    <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                        <button style={primaryBtn} onClick={sendReset} disabled={loading}>
                            {loading ? tr("loginSending") : tr("loginSendResetLink")}
                        </button>
                        <button
                            style={secondaryBtn}
                            onClick={() => { setResetting(false); setMsg(""); }}
                        >
                            {tr("cancel")}
                        </button>
                    </div>
                    {msg && (
                        <div style={{ marginTop: 14, fontSize: 13, color: msgIsError ? (isDark ? "#ff6b6b" : "#c0392b") : t.fg }}>
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
                {langToggle}
                <div style={cardStyle}>
                    <h2 style={{ margin: 0, fontSize: 18 }}>{tr("loginCheckEmail")}</h2>
                    <p style={{ marginTop: 12, fontSize: 14, lineHeight: 1.6 }}>
                        {tr("loginConfirmSent", { email })}
                    </p>
                    <p style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6, color: t.fgMuted }}>
                        {tr("loginPendingReview")}
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
                            {tr("loginBackToSignIn")}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={pageStyle}>
            {langToggle}
            <div style={{ width: "100%", maxWidth: 420 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                <img src="/logo.svg" alt="SaintsHelp" style={{ height: 40, width: "auto", filter: isDark ? "invert(1)" : "none" }} />
            </div>
            <div style={cardStyle}>
                <h2 style={{ margin: 0, fontSize: 18 }}>
                    {mode === "signin" ? tr("signIn") : tr("signUp")}
                </h2>

                <div style={{ marginTop: 16 }}>
                    <label style={{ fontSize: 12 }}>{tr("loginEmail")}</label>
                    <input
                        style={inputStyle}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                    />
                </div>

                <div style={{ marginTop: 14 }}>
                    <label style={{ fontSize: 12 }}>{tr("loginPassword")}</label>
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
                            ? tr("working")
                            : mode === "signin"
                                ? tr("signIn")
                                : tr("signUp")}
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
                            ? tr("landingCreateAccount")
                            : tr("loginBackToSignIn")}
                    </button>
                </div>

                {msg && (
                    <div style={{ marginTop: 14, fontSize: 13, color: msgIsError ? (isDark ? "#ff6b6b" : "#c0392b") : t.fg }}>
                        {msg}
                    </div>
                )}

                {mode === "signin" && (
                    <div style={{ marginTop: 14 }}>
                        <button
                            style={{ background: "none", border: "none", padding: 0, fontSize: 13, color: t.fgMuted, cursor: "pointer", textDecoration: "underline" }}
                            onClick={() => { setResetting(true); setMsg(""); }}
                        >
                            {tr("loginForgotPassword")}
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