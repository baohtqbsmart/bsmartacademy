import { describe, expect, it } from "vitest"

import {
  addElement,
  addPage,
  commit,
  createHistory,
  duplicateElement,
  endGesture,
  moveLayer,
  movePage,
  preview,
  redo,
  removePage,
  resizeBox,
  setPageSize,
  snapBox,
  undo,
  updateElement,
} from "@/features/designer/editor-state"
import { blankContent, contentSchema, createElement, isCorrect, PAGE_SIZES, videoEmbedUrl, type DesignContent, type ElementOf } from "@/features/designer/model"

const slide = PAGE_SIZES.slide
const base = (): DesignContent => ({ pageSize: "slide", pages: [{ id: "p1", background: "#ffffff", elements: [] }] })

describe("undo and redo", () => {
  it("steps back and forward through changes", () => {
    const a = base()
    const b = addElement(a, "p1", createElement("text", slide))
    const c = addElement(b, "p1", createElement("shape", slide))
    let h = commit(commit(createHistory(a), b), c)
    h = undo(h)
    expect(h.present).toBe(b)
    h = undo(h)
    expect(h.present).toBe(a)
    expect(undo(h)).toBe(h)
    h = redo(redo(h))
    expect(h.present).toBe(c)
    expect(redo(h)).toBe(h)
  })

  it("a new change clears redo; typing in one field is one step", () => {
    const a = base()
    const el = createElement("text", slide)
    const b = addElement(a, "p1", el)
    let h = commit(createHistory(a), b)
    h = commit(h, updateElement(b, "p1", el.id, { text: "H" }), "text", 1000)
    h = commit(h, updateElement(h.present, "p1", el.id, { text: "Hi" }), "text", 1500)
    expect(h.past).toHaveLength(2)
    h = undo(h)
    expect(h.present).toBe(b)
    h = commit(h, a)
    expect(h.future).toHaveLength(0)
  })

  it("a drag is one step, however many moves", () => {
    const el = createElement("shape", slide)
    const start = addElement(base(), "p1", el)
    let h = createHistory(start)
    for (let i = 1; i <= 5; i++) h = preview(h, updateElement(h.present, "p1", el.id, { x: i * 10 }))
    h = endGesture(h, start)
    expect(h.past).toEqual([start])
    expect(undo(h).present).toBe(start)
  })
})

describe("elements and pages", () => {
  it("duplicates with a new id, offset, on top", () => {
    const el = createElement("icon", slide)
    const [content, copyId] = duplicateElement(addElement(base(), "p1", el), "p1", el.id)
    const [orig, copy] = content.pages[0].elements
    expect(copy.id).toBe(copyId)
    expect(copy.id).not.toBe(orig.id)
    expect([copy.x - orig.x, copy.y - orig.y]).toEqual([20, 20])
  })

  it("reorders layers", () => {
    const [a, b, c] = [createElement("text", slide), createElement("shape", slide), createElement("icon", slide)]
    const content = [a, b, c].reduce((acc, el) => addElement(acc, "p1", el), base())
    const order = (x: DesignContent) => x.pages[0].elements.map((el) => el.id)
    expect(order(moveLayer(content, "p1", a.id, "front"))).toEqual([b.id, c.id, a.id])
    expect(order(moveLayer(content, "p1", c.id, "back"))).toEqual([c.id, a.id, b.id])
    expect(order(moveLayer(content, "p1", a.id, "backward"))).toEqual([a.id, b.id, c.id])
  })

  it("adds, moves and removes pages; buttons to a removed page fall back to next", () => {
    const [two, p2] = addPage(base(), "p1")
    const button = { ...(createElement("button", slide) as ElementOf<"button">), action: "page" as const, target: p2 }
    const content = addElement(two, "p1", button)
    expect(movePage(content, 0, 1).pages.map((p) => p.id)).toEqual([p2, "p1"])
    const removed = removePage(content, p2)
    expect(removed.pages).toHaveLength(1)
    expect(removed.pages[0].elements[0]).toMatchObject({ action: "next", target: null })
    expect(removePage(removed, "p1")).toBe(removed)
    expect(contentSchema.safeParse(removed).success).toBe(true)
  })

  it("changing page size keeps the layout proportional and valid", () => {
    const content = setPageSize(blankContent("flashcards"), "a4_portrait")
    expect(content.pageSize).toBe("a4_portrait")
    expect(contentSchema.safeParse(content).success).toBe(true)
  })

  it("every blank starting point is valid", () => {
    for (const kind of ["presentation", "worksheet", "flashcards", "vocabulary_cards", "grammar_activity", "quiz", "exit_ticket"] as const)
      expect(contentSchema.safeParse(blankContent(kind)).success).toBe(true)
  })
})

describe("geometry", () => {
  const box = { x: 100, y: 100, w: 200, h: 100 }
  it("resizes from each side and keeps a minimum size", () => {
    expect(resizeBox(box, "se", 50, 20)).toEqual({ x: 100, y: 100, w: 250, h: 120 })
    expect(resizeBox(box, "nw", 50, 20)).toEqual({ x: 150, y: 120, w: 150, h: 80 })
    expect(resizeBox(box, "e", -500, 0).w).toBe(8)
    expect(resizeBox(box, "se", 100, 0, true)).toEqual({ x: 100, y: 100, w: 300, h: 150 })
  })

  it("snaps to the page centre and other elements", () => {
    const page = { width: 1280, height: 720 }
    const snapped = snapBox({ x: 537, y: 10, w: 200, h: 50 }, page, [], 6)
    expect(snapped.box.x).toBe(540)
    expect(snapped.guides).toContainEqual({ axis: "x", at: 640 })
    expect(snapBox({ x: 403, y: 300, w: 50, h: 50 }, page, [{ x: 100, y: 0, w: 300, h: 40 }], 6).box.x).toBe(400)
    expect(snapBox({ x: 420, y: 300, w: 50, h: 50 }, page, [], 6).guides).toEqual([])
  })
})

describe("practice questions and media", () => {
  const q = createElement("question", slide) as ElementOf<"question">
  it("checks answers", () => {
    expect(isCorrect(q, { selected: [0], text: "" })).toBe(true)
    expect(isCorrect(q, { selected: [1], text: "" })).toBe(false)
    const short = { ...q, questionType: "short_answer" as const, answers: ["went"] }
    expect(isCorrect(short, { selected: [], text: "  Went. " })).toBe(true)
    expect(isCorrect(short, { selected: [], text: "go" })).toBe(false)
  })

  it("embeds YouTube and Vimeo only", () => {
    expect(videoEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
    expect(videoEmbedUrl("https://youtu.be/dQw4w9WgXcQ?t=5")).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")
    expect(videoEmbedUrl("https://vimeo.com/123456789")).toBe("https://player.vimeo.com/video/123456789")
    expect(videoEmbedUrl("https://evil.test/youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull()
  })
})
