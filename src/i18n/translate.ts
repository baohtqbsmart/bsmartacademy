import type { Locale } from "@/i18n/config"
import { vi } from "@/i18n/messages/vi"

export type TranslationValues = Record<string, string | number>

/**
 * Translates an English UI string. The English text is the key, so English
 * needs no dictionary and a missing Vietnamese entry falls back to English.
 * `{name}` placeholders are filled from `values` after translation.
 */
export type TFunction = (text: string, values?: TranslationValues) => string

const dictionaries: Record<Locale, Readonly<Record<string, string>> | null> = {
  vi,
  en: null,
}

export function translate(locale: Locale, text: string, values?: TranslationValues): string {
  const translated = lookup(dictionaries[locale], text) ?? text
  return values ? interpolate(translated, values) : translated
}

/**
 * Exact entry; else the entry for the trimmed text (surrounding spaces kept);
 * else a pattern entry, for messages built with numbers or quoted names:
 * `"a.pdf" is larger than 20 MB.` matches the key `"{q0}" is larger than {#0} MB.`
 */
export function lookup(dictionary: Readonly<Record<string, string>> | null, text: string): string | undefined {
  if (!dictionary) return undefined
  const exact = dictionary[text]
  if (exact !== undefined) return exact
  const [, lead, rawCore, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!
  const core = rawCore.replace(/\s+/g, " ")
  const inner = dictionary[core]
  if (inner !== undefined) return lead + inner + trail

  const values: Record<string, string> = {}
  let quoted = 0
  let numbers = 0
  // Standalone numbers only: "MP3" or "A4" stay part of the text.
  const pattern = core.replace(/"[^"]*"|\b\d+(?:[.,]\d+)*\b/g, (match) => {
    if (match.startsWith('"')) {
      values[`q${quoted}`] = match.slice(1, -1)
      return `"{q${quoted++}}"`
    }
    values[`#${numbers}`] = match
    return `{#${numbers++}}`
  })
  if (pattern === core) return undefined
  const translated = dictionary[pattern]
  if (translated === undefined) return undefined
  return lead + translated.replace(/\{(q\d+|#\d+)\}/g, (token, key: string) => values[key] ?? token) + trail
}

export function interpolate(text: string, values: TranslationValues): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match))
}

export function createT(locale: Locale): TFunction {
  return (text, values) => translate(locale, text, values)
}
