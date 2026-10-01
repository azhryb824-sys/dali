"use client";
import { createContext, useContext } from "react";
import type { AppLocale } from "@/lib/i18n";
const PublicLocaleContext = createContext<AppLocale | null>(null);
export function PublicLocaleProvider({ locale, children }: { locale: AppLocale | null; children: React.ReactNode }) { return <PublicLocaleContext.Provider value={locale}>{children}</PublicLocaleContext.Provider>; }
export function usePublicLocale() { return useContext(PublicLocaleContext); }
