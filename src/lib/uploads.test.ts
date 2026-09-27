import { describe, expect, it } from "vitest"

import { checkFile, cleanFileName, matchesSignature, mimeTypeForName } from "@/lib/uploads"

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)))

describe("mimeTypeForName / checkFile", () => {
  it.each([
    ["bai-lam.PDF", "application/pdf"],
    ["anh.jpeg", "image/jpeg"],
    ["ghi-am.m4a", "audio/mp4"],
    ["essay.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    ["virus.exe", null],
    ["no-extension", null],
    ["trick.pdf.exe", null],
  ])("%s -> %s", (name, expected) => {
    expect(mimeTypeForName(name)).toBe(expected)
  })

  it("rejects empty, oversized and unknown files with a readable message", () => {
    expect(checkFile({ name: "a.pdf", size: 10 })).toEqual({ ok: true, mimeType: "application/pdf" })
    expect(checkFile({ name: "a.pdf", size: 0 })).toMatchObject({ ok: false, message: expect.stringMatching(/empty/) })
    expect(checkFile({ name: "a.pdf", size: 21 * 1024 * 1024 })).toMatchObject({ ok: false, message: expect.stringMatching(/20 MB/) })
    expect(checkFile({ name: "a.sh", size: 10 })).toMatchObject({ ok: false, message: expect.stringMatching(/not an accepted/) })
  })

  it("cleans names without losing the extension", () => {
    expect(cleanFileName("  bài/làm\u0000.pdf ")).toBe("bài_làm_.pdf")
    const long = cleanFileName(`${"a".repeat(300)}.docx`)
    expect(long.length).toBeLessThanOrEqual(200)
    expect(long.endsWith(".docx")).toBe(true)
  })
})

describe("matchesSignature", () => {
  it.each([
    ["application/pdf", bytes("%PDF-1.7\n")],
    ["image/png", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])],
    ["image/jpeg", bytes([0xff, 0xd8, 0xff, 0xe0])],
    ["image/webp", bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ")],
    ["audio/wav", bytes("RIFF", [0, 0, 0, 0], "WAVEfmt ")],
    ["audio/mpeg", bytes("ID3", [4, 0])],
    ["audio/mpeg", bytes([0xff, 0xfb, 0x90, 0x64])],
    ["audio/webm", bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f])],
    ["audio/mp4", bytes([0, 0, 0, 0x20], "ftypM4A ")],
    ["video/mp4", bytes([0, 0, 0, 0x18], "ftypmp42")],
    ["text/plain", new TextEncoder().encode("Xin chào các bạn")],
    // A multi-byte character cut off at the end of the sniffed prefix.
    ["text/plain", new TextEncoder().encode("Xin chào").slice(0, 8)],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes([0x50, 0x4b, 0x03, 0x04], "....word/document.xml")],
  ] as const)("accepts a real %s", (mime, content) => {
    expect(matchesSignature(content, mime)).toBe(true)
  })

  it.each([
    // A Windows executable renamed to .pdf / .png.
    ["application/pdf", bytes("MZ", [0x90, 0])],
    ["image/png", bytes("MZ", [0x90, 0])],
    // An HTML page (script) renamed to .jpg.
    ["image/jpeg", bytes("<html><script>")],
    // A spreadsheet renamed to .docx: a ZIP, but not a Word document.
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes([0x50, 0x4b, 0x03, 0x04], "....xl/workbook.xml")],
    // Binary data renamed to .txt.
    ["text/plain", bytes("abc", [0], "def")],
    ["text/plain", bytes([0xc3, 0x28])],
    ["audio/wav", bytes("RIFF", [0, 0, 0, 0], "WEBP")],
  ] as const)("rejects content that is not really %s", (mime, content) => {
    expect(matchesSignature(content, mime)).toBe(false)
  })
})
