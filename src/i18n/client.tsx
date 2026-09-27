"use client"

import { createContext, Fragment, useContext, useMemo } from "react"

import { defaultLocale, type Locale } from "@/i18n/config"
import { createT, translate, type TFunction } from "@/i18n/translate"

const LocaleContext = createContext<Locale>(defaultLocale)

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/** Translator for Client Components. */
export function useT(): TFunction {
  const locale = useLocale()
  return useMemo(() => createT(locale), [locale])
}

/**
 * Translated text for places that cannot call `useT`/`getT` (components shared
 * by server and client code). `{name}` placeholders take React nodes.
 */
export function Trans({ children, values }: { children: string; values?: Record<string, React.ReactNode> }) {
  const locale = useLocale()
  const text = translate(locale, children)
  if (!values) return text
  return text.split(/(\{\w+\})/).map((part, index) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1]
    return <Fragment key={index}>{key !== undefined && key in values ? values[key] : part}</Fragment>
  })
}
