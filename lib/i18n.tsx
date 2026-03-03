"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { en, type TranslationKey } from "./i18n/en";
import { hr } from "./i18n/hr";

export type Locale = "en" | "hr";

const translations: Record<Locale, Record<TranslationKey, string>> = { en, hr };

type I18nCtx = {
    locale: Locale;
    setLocale: (l: Locale) => void;
    t: (key: TranslationKey, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nCtx>({
    locale: "en",
    setLocale: () => {},
    t: (key) => en[key],
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
    const [locale, setLocaleState] = useState<Locale>("en");

    useEffect(() => {
        try {
            const saved = localStorage.getItem("saintshelp.lang") as Locale | null;
            if (saved && (saved === "en" || saved === "hr")) {
                setLocaleState(saved);
                document.documentElement.lang = saved;
            }
        } catch {}
    }, []);

    function setLocale(l: Locale) {
        setLocaleState(l);
        try {
            localStorage.setItem("saintshelp.lang", l);
        } catch {}
        document.documentElement.lang = l;
    }

    function t(key: TranslationKey, params?: Record<string, string | number>): string {
        let str = translations[locale]?.[key] ?? en[key] ?? key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                str = str.replace(`{${k}}`, String(v));
            }
        }
        return str;
    }

    return (
        <I18nContext.Provider value={{ locale, setLocale, t }}>
            {children}
        </I18nContext.Provider>
    );
}

export function useLocale() {
    return useContext(I18nContext);
}

export type { TranslationKey };
