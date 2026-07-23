"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppLocale = "zh-CN" | "en";

type I18nContextValue = {
  locale: AppLocale;
  isEnglish: boolean;
  setLocale: (locale: AppLocale) => void;
};

const STORAGE_KEY = "market-clarity:locale";
const I18nContext = createContext<I18nContextValue | undefined>(undefined);

function readInitialLocale(): AppLocale {
  if (typeof window === "undefined") return "zh-CN";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "en" || stored === "zh-CN") return stored;
  return window.navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, updateLocale] = useState<AppLocale>("zh-CN");

  useEffect(() => { updateLocale(readInitialLocale()); }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.locale = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    isEnglish: locale === "en",
    setLocale: (next) => {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.cookie = `market_clarity_locale=${next}; path=/; max-age=31536000; samesite=lax`;
      updateLocale(next);
    },
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

export function pick<T>(isEnglish: boolean, zh: T, en: T): T {
  return isEnglish ? en : zh;
}
