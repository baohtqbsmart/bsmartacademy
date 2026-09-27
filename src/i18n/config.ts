/**
 * Interface languages. Vietnamese is the default; English is the second
 * language, chosen per browser in Settings (stored in the `locale` cookie).
 */
export const locales = ["vi", "en"] as const
export type Locale = (typeof locales)[number]

export const defaultLocale: Locale = "vi"
export const LOCALE_COOKIE = "locale"

export const localeNames: Record<Locale, string> = {
  vi: "Tiếng Việt",
  en: "English",
}

/** BCP 47 tags for Intl formatting (dates, numbers). */
export const intlLocale: Record<Locale, string> = {
  vi: "vi-VN",
  en: "en-GB",
}

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value)
}
