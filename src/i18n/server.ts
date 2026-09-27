import "server-only"

import { cookies } from "next/headers"
import { cache } from "react"

import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "@/i18n/config"
import { createT, type TFunction } from "@/i18n/translate"

/** The visitor's interface language (cookie set from Settings), once per request. */
export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value
  return isLocale(value) ? value : defaultLocale
})

/** Translator for Server Components, Server Actions and route handlers. */
export async function getT(): Promise<TFunction> {
  return createT(await getLocale())
}
