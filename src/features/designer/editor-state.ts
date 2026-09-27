import { blankPage, duplicatePage, newId, PAGE_SIZES, type DesignContent, type DesignElement, type DesignPage, type PageSizeId } from "@/features/designer/model"

// ---------------------------------------------------------------------------
// Undo / redo
// ---------------------------------------------------------------------------

export const HISTORY_LIMIT = 100

export type History = {
  past: DesignContent[]
  present: DesignContent
  future: DesignContent[]
  /** Typing into one field merges into one undo step. */
  mergeKey: string | null
  mergedAt: number
}

export function createHistory(content: DesignContent): History {
  return { past: [], present: content, future: [], mergeKey: null, mergedAt: 0 }
}

const MERGE_WINDOW_MS = 1200

/** Records a change as an undo step (or folds it into the previous one with the same key). */
export function commit(h: History, next: DesignContent, mergeKey: string | null = null, now = Date.now()): History {
  if (next === h.present) return h
  if (mergeKey && h.mergeKey === mergeKey && now - h.mergedAt < MERGE_WINDOW_MS) {
    return { ...h, present: next, future: [], mergedAt: now }
  }
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present: next, future: [], mergeKey, mergedAt: now }
}

/** A change during a drag: shown but not yet an undo step (see endGesture). */
export function preview(h: History, next: DesignContent): History {
  return { ...h, present: next }
}

/** Ends a drag/resize: one undo step from where the gesture started. */
export function endGesture(h: History, start: DesignContent): History {
  if (h.present === start) return h
  return { past: [...h.past, start].slice(-HISTORY_LIMIT), present: h.present, future: [], mergeKey: null, mergedAt: 0 }
}

export function undo(h: History): History {
  const previous = h.past.at(-1)
  if (!previous) return h
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future], mergeKey: null, mergedAt: 0 }
}

export function redo(h: History): History {
  const [next, ...rest] = h.future
  if (!next) return h
  return { past: [...h.past, h.present], present: next, future: rest, mergeKey: null, mergedAt: 0 }
}

// ---------------------------------------------------------------------------
// Content operations (pure; each returns new content)
// ---------------------------------------------------------------------------

function mapPage(content: DesignContent, pageId: string, fn: (page: DesignPage) => DesignPage): DesignContent {
  return { ...content, pages: content.pages.map((p) => (p.id === pageId ? fn(p) : p)) }
}

export function addElement(content: DesignContent, pageId: string, el: DesignElement) {
  return mapPage(content, pageId, (p) => ({ ...p, elements: [...p.elements, el] }))
}

export function updateElement(content: DesignContent, pageId: string, id: string, patch: Partial<DesignElement>) {
  return mapPage(content, pageId, (p) => ({ ...p, elements: p.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as DesignElement) : el)) }))
}

export function removeElement(content: DesignContent, pageId: string, id: string) {
  return mapPage(content, pageId, (p) => ({ ...p, elements: p.elements.filter((el) => el.id !== id) }))
}

/** Copies an element just below-right of the original, on top. Returns the copy's id. */
export function duplicateElement(content: DesignContent, pageId: string, id: string): [DesignContent, string | null] {
  const page = content.pages.find((p) => p.id === pageId)
  const el = page?.elements.find((e) => e.id === id)
  if (!el) return [content, null]
  const copy = { ...structuredClone(el), id: newId(), x: el.x + 20, y: el.y + 20 } as DesignElement
  return [addElement(content, pageId, copy), copy.id]
}

export type LayerMove = "forward" | "backward" | "front" | "back"

export function moveLayer(content: DesignContent, pageId: string, id: string, move: LayerMove) {
  return mapPage(content, pageId, (p) => {
    const from = p.elements.findIndex((el) => el.id === id)
    if (from < 0) return p
    const last = p.elements.length - 1
    const to = { forward: Math.min(last, from + 1), backward: Math.max(0, from - 1), front: last, back: 0 }[move]
    return { ...p, elements: moveItem(p.elements, from, to) }
  })
}

export function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items
  const next = [...items]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** Inserts a new blank page after `afterId`. Returns the new page's id. */
export function addPage(content: DesignContent, afterId: string): [DesignContent, string] {
  const index = content.pages.findIndex((p) => p.id === afterId)
  const background = content.pages[index]?.background ?? "#ffffff"
  const page = blankPage(background)
  const pages = [...content.pages]
  pages.splice(index + 1, 0, page)
  return [{ ...content, pages }, page.id]
}

export function duplicatePageAfter(content: DesignContent, pageId: string): [DesignContent, string] {
  const index = content.pages.findIndex((p) => p.id === pageId)
  if (index < 0) return [content, pageId]
  const copy = duplicatePage(content.pages[index])
  const pages = [...content.pages]
  pages.splice(index + 1, 0, copy)
  return [{ ...content, pages }, copy.id]
}

/** Removes a page (never the last one). Buttons that opened it fall back to "next page". */
export function removePage(content: DesignContent, pageId: string): DesignContent {
  if (content.pages.length <= 1) return content
  return {
    ...content,
    pages: content.pages
      .filter((p) => p.id !== pageId)
      .map((p) => ({
        ...p,
        elements: p.elements.map((el) => (el.type === "button" && el.action === "page" && el.target === pageId ? { ...el, action: "next" as const, target: null } : el)),
      })),
  }
}

export function movePage(content: DesignContent, from: number, to: number): DesignContent {
  return { ...content, pages: moveItem(content.pages, from, to) }
}

export function setBackground(content: DesignContent, pageId: string, background: string) {
  return mapPage(content, pageId, (p) => ({ ...p, background }))
}

/** Changes the page size, scaling positions so elements stay in place relative to the page. */
export function setPageSize(content: DesignContent, pageSize: PageSizeId): DesignContent {
  const from = PAGE_SIZES[content.pageSize]
  const to = PAGE_SIZES[pageSize]
  if (from === to) return content
  const k = Math.min(to.width / from.width, to.height / from.height)
  const round = (v: number) => Math.round(v * 10) / 10
  return {
    pageSize,
    pages: content.pages.map((p) => ({
      ...p,
      elements: p.elements.map((el) => {
        const scaled = { ...el, x: round(el.x * k), y: round(el.y * k), w: Math.max(1, round(el.w * k)), h: Math.max(1, round(el.h * k)) }
        if ("fontSize" in scaled) (scaled as { fontSize: number }).fontSize = Math.min(200, Math.max(8, Math.round(scaled.fontSize * k)))
        return scaled as DesignElement
      }),
    })),
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export type Box = { x: number; y: number; w: number; h: number }
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw"
export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"]
export const MIN_SIZE = 8

/** The box after dragging a handle by (dx, dy) page pixels; `keepRatio` for corners (Shift). */
export function resizeBox(start: Box, handle: Handle, dx: number, dy: number, keepRatio = false): Box {
  let { x, y, w, h } = start
  if (handle.includes("e")) w = start.w + dx
  if (handle.includes("s")) h = start.h + dy
  if (handle.includes("w")) {
    w = start.w - dx
    x = start.x + dx
  }
  if (handle.includes("n")) {
    h = start.h - dy
    y = start.y + dy
  }
  if (keepRatio && handle.length === 2 && start.h > 0) {
    const ratio = start.w / start.h
    if (Math.abs(w / ratio - start.h) > Math.abs(h - start.h)) h = w / ratio
    else w = h * ratio
    if (handle.includes("w")) x = start.x + start.w - w
    if (handle.includes("n")) y = start.y + start.h - h
  }
  if (w < MIN_SIZE) {
    if (handle.includes("w")) x -= MIN_SIZE - w
    w = MIN_SIZE
  }
  if (h < MIN_SIZE) {
    if (handle.includes("n")) y -= MIN_SIZE - h
    h = MIN_SIZE
  }
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) }
}

export type Guide = { axis: "x" | "y"; at: number }

/**
 * Snaps a moving box to the page's edges and centre lines and to other
 * elements' edges and centres, within `threshold` page pixels.
 */
export function snapBox(box: Box, page: { width: number; height: number }, others: Box[], threshold: number): { box: Box; guides: Guide[] } {
  const xs = [0, page.width / 2, page.width, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])]
  const ys = [0, page.height / 2, page.height, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
  const guides: Guide[] = []
  const snapAxis = (start: number, size: number, targets: number[], axis: "x" | "y") => {
    let best: { delta: number; at: number } | null = null
    for (const edge of [start, start + size / 2, start + size]) {
      for (const t of targets) {
        const delta = t - edge
        if (Math.abs(delta) <= threshold && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, at: t }
      }
    }
    if (!best) return start
    guides.push({ axis, at: best.at })
    return start + best.delta
  }
  const x = snapAxis(box.x, box.w, xs, "x")
  const y = snapAxis(box.y, box.h, ys, "y")
  return { box: { ...box, x: Math.round(x), y: Math.round(y) }, guides }
}
