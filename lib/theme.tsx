"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeCtx = { isDark: boolean; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ isDark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        // Sync with the data-theme already applied by the inline script in <head>
        setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
    }, []);

    function toggle() {
        setIsDark((prev) => {
            const next = !prev;
            try { localStorage.setItem("saintshelp.theme", next ? "dark" : "light"); } catch {}
            document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
            return next;
        });
    }

    return (
        <ThemeContext.Provider value={{ isDark, toggle }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}

/** Returns a palette of computed color values for the current theme. */
export function tc(isDark: boolean) {
    return {
        pageBg:          isDark ? "#111111" : "#f7f7f7",
        cardBg:          isDark ? "#1c1c1c" : "#ffffff",
        fg:              isDark ? "#e8e8e8" : "#111111",
        fgMuted:         isDark ? "#999999" : "#555555",
        fgSubtle:        isDark ? "#666666" : "#999999",
        border:          isDark ? "#2a2a2a" : "#e7e7e7",
        borderInput:     isDark ? "#333333" : "#d9d9d9",
        inputBg:         isDark ? "#222222" : "#ffffff",
        btnBg:           isDark ? "#1c1c1c" : "#ffffff",
        btnFg:           isDark ? "#e8e8e8" : "#111111",
        btnBorder:       isDark ? "#333333" : "#d9d9d9",
        btnActiveBg:     isDark ? "#e8e8e8" : "#111111",
        btnActiveFg:     isDark ? "#111111" : "#ffffff",
        btnActiveBorder: isDark ? "#e8e8e8" : "#111111",
        suggestionBg:    isDark ? "#1a1a1a" : "#fafafa",
        suggestionBorder:isDark ? "#2a2a2a" : "#efefef",
        copyActiveBg:    isDark ? "#1a2e1c" : "#f0fff4",
        copyActiveFg:    isDark ? "#4caf50" : "#2e7d32",
    };
}
