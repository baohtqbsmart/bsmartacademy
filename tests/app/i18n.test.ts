import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { vi } from "@/i18n/messages/vi"
import { interpolate, lookup, translate } from "@/i18n/translate"

/**
 * Vietnamese is the default interface language, so every string the code
 * translates must have a Vietnamese entry (a missing one would show English).
 */
const srcDir = path.resolve(import.meta.dirname, "../../src")

function findFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return findFiles(full)
    return /\.(ts|tsx)$/.test(entry) && !/\.test\./.test(entry) ? [full] : []
  })
}

function translatedKeys() {
  const keys = new Map<string, string>()
  for (const file of findFiles(srcDir)) {
    const text = readFileSync(file, "utf8")
    if (!/\b(t|tr)\(|<Trans\b/.test(text)) continue
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && /^(t|tr)$/.test(node.expression.text)) {
        const [arg] = node.arguments
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) keys.set(arg.text, path.relative(srcDir, file))
      }
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText() === "Trans") {
        for (const child of node.children) {
          if (ts.isJsxExpression(child) && child.expression && ts.isStringLiteral(child.expression)) {
            keys.set(child.expression.text, path.relative(srcDir, file))
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return keys
}

const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))

describe("translate", () => {
  it("falls back to the English text", () => {
    expect(translate("vi", "No such key {n}", { n: 2 })).toBe("No such key 2")
    expect(translate("en", "Sign in")).toBe("Sign in")
  })

  it("translates and fills placeholders", () => {
    expect(translate("vi", "Sign in")).toBe("Đăng nhập")
    expect(translate("vi", "Signed in as {email}.", { email: "a@b" })).toBe("Đang đăng nhập với a@b.")
  })

  it("matches messages built with numbers or quoted names", () => {
    expect(translate("vi", "Use at most 200 characters.")).toBe("Dùng tối đa 200 ký tự.")
    expect(translate("vi", '"bài 1.pdf" is larger than 20 MB.')).toBe('"bài 1.pdf" lớn hơn 20 MB.')
    expect(translate("vi", '"a.mp3" is not audio (MP3, M4A, WAV or WebM).')).toBe('"a.mp3" không phải âm thanh (MP3, M4A, WAV hoặc WebM).')
    expect(translate("vi", "Amount must be between 1 and 10.000.000.000 ₫.")).toBe("Số tiền phải từ 1 đến 10.000.000.000 ₫.")
    expect(translate("vi", "Nothing like this 42")).toBe("Nothing like this 42")
  })

  it("keeps surrounding spaces", () => {
    expect(translate("vi", " · late")).toBe(" · trễ")
  })

  it("leaves unknown placeholders untouched", () => {
    expect(interpolate("{a} {b}", { a: 1 })).toBe("1 {b}")
  })
})

describe("Vietnamese dictionary", () => {
  const keys = translatedKeys()

  it("finds the translated strings", () => {
    expect(keys.size).toBeGreaterThan(1500)
  })

  it("covers every string passed to t() or <Trans>", () => {
    const missing = [...keys].filter(([key]) => lookup(vi, key) === undefined).map(([key, file]) => `${file}: ${key}`)
    expect(missing).toEqual([])
  })

  it("only uses placeholders the English text provides", () => {
    const wrong = Object.entries(vi)
      .filter(([key, value]) => [...placeholders(value)].some((p) => !placeholders(key).has(p)))
      .map(([key]) => key)
    expect(wrong).toEqual([])
  })
})
