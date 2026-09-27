import { z } from "zod"

/**
 * The Lesson Designer's document model. A design is a list of pages; a page is
 * a list of absolutely positioned elements in page pixels. The same rules are
 * enforced by private.design_content_problem() in the database
 * (tests/db/designer.test.ts keeps the two in step).
 */

export const DESIGN_KINDS = [
  "presentation",
  "worksheet",
  "flashcards",
  "vocabulary_cards",
  "grammar_activity",
  "quiz",
  "exit_ticket",
] as const
export type DesignKind = (typeof DESIGN_KINDS)[number]

export const KIND_LABELS: Record<DesignKind, string> = {
  presentation: "Presentation slides",
  worksheet: "Worksheet",
  flashcards: "Flashcards",
  vocabulary_cards: "Vocabulary cards",
  grammar_activity: "Grammar activity",
  quiz: "Quiz",
  exit_ticket: "Exit ticket",
}

export const PAGE_SIZES = {
  slide: { width: 1280, height: 720, label: "Slide 16:9" },
  a4_portrait: { width: 794, height: 1123, label: "A4 portrait" },
  a4_landscape: { width: 1123, height: 794, label: "A4 landscape" },
  card: { width: 900, height: 600, label: "Card 3:2" },
  square: { width: 1080, height: 1080, label: "Square" },
} as const
export type PageSizeId = keyof typeof PAGE_SIZES
export const PAGE_SIZE_IDS = Object.keys(PAGE_SIZES) as PageSizeId[]

export const DEFAULT_PAGE_SIZE: Record<DesignKind, PageSizeId> = {
  presentation: "slide",
  worksheet: "a4_portrait",
  flashcards: "card",
  vocabulary_cards: "card",
  grammar_activity: "slide",
  quiz: "slide",
  exit_ticket: "a4_landscape",
}

export const TEMPLATE_CATEGORIES = ["vocabulary", "grammar", "reading", "listening", "speaking", "writing", "ielts", "cambridge", "review"] as const
export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
  ielts: "IELTS",
  cambridge: "Cambridge",
  review: "Review",
}

export const LIMITS = {
  pages: 60,
  elementsPerPage: 150,
  text: 5000,
  tableRows: 12,
  tableCols: 8,
  cell: 500,
  options: 8,
  option: 300,
  answers: 10,
  contentBytes: 1_000_000,
  coordinate: 5000,
} as const

export const ELEMENT_TYPES = ["text", "image", "shape", "table", "icon", "audio", "video", "question", "button"] as const
export type ElementType = (typeof ELEMENT_TYPES)[number]

export const FONTS = {
  sans: { label: "Sans", css: "ui-sans-serif, system-ui, 'Segoe UI', Roboto, Arial, sans-serif" },
  serif: { label: "Serif", css: "Georgia, 'Times New Roman', serif" },
  rounded: { label: "Playful", css: "'Comic Sans MS', 'Chalkboard SE', 'Comic Neue', ui-rounded, sans-serif" },
  mono: { label: "Mono", css: "ui-monospace, 'Cascadia Mono', Consolas, monospace" },
} as const
export type FontId = keyof typeof FONTS

export const SHAPES = ["rect", "ellipse", "triangle", "line", "arrow"] as const
export const BUTTON_ACTIONS = ["next", "prev", "page", "url", "reveal"] as const
export type ButtonAction = (typeof BUTTON_ACTIONS)[number]
export const BUTTON_ACTION_LABELS: Record<ButtonAction, string> = {
  next: "Next page",
  prev: "Previous page",
  page: "Go to page",
  url: "Open a link",
  reveal: "Reveal hidden items",
}
export const QUESTION_TYPES = ["multiple_choice", "true_false", "short_answer"] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: "Multiple choice",
  true_false: "True / false",
  short_answer: "Short answer",
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ID = /^[A-Za-z0-9_-]{1,40}$/
const COLOR = /^#[0-9A-Fa-f]{6}$/
const HTTPS = /^https:\/\/[^\s<>"]+$/

const id = z.string().regex(ID)
const color = z.string().regex(COLOR)
const fill = z.union([color, z.literal("transparent")])
const text = (max: number) => z.string().max(max)
const num = (min: number, max: number) => z.number().finite().min(min).max(max)
const https = z.string().max(1000).regex(HTTPS, "Links must start with https://")

const base = {
  id,
  x: num(-LIMITS.coordinate, LIMITS.coordinate),
  y: num(-LIMITS.coordinate, LIMITS.coordinate),
  w: num(1, LIMITS.coordinate),
  h: num(1, LIMITS.coordinate),
  /** Hidden until a "Reveal" button is pressed (answers, the back of a flashcard). */
  hidden: z.boolean().optional(),
}

const textElement = z.strictObject({
  ...base,
  type: z.literal("text"),
  text: text(LIMITS.text),
  fontSize: num(8, 200),
  fontFamily: z.enum(Object.keys(FONTS) as [FontId, ...FontId[]]),
  bold: z.boolean(),
  italic: z.boolean(),
  underline: z.boolean(),
  align: z.enum(["left", "center", "right"]),
  color,
  fill,
})

const imageElement = z.strictObject({
  ...base,
  type: z.literal("image"),
  assetId: z.uuid(),
  fit: z.enum(["cover", "contain"]),
  radius: num(0, 1000),
  alt: text(300),
})

const shapeElement = z.strictObject({
  ...base,
  type: z.literal("shape"),
  shape: z.enum(SHAPES),
  fill,
  stroke: fill,
  strokeWidth: num(0, 40),
  radius: num(0, 1000),
})

const tableElement = z.strictObject({
  ...base,
  type: z.literal("table"),
  rows: z
    .array(z.array(text(LIMITS.cell)).min(1).max(LIMITS.tableCols))
    .min(1)
    .max(LIMITS.tableRows)
    .refine((rows) => rows.every((r) => r.length === rows[0].length), "Every row needs the same number of cells."),
  header: z.boolean(),
  fontSize: num(8, 72),
  color,
  borderColor: color,
  headerFill: fill,
})

const iconElement = z.strictObject({
  ...base,
  type: z.literal("icon"),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
  color,
})

const audioElement = z.strictObject({
  ...base,
  type: z.literal("audio"),
  assetId: z.uuid(),
  label: text(200),
})

const videoElement = z
  .strictObject({
    ...base,
    type: z.literal("video"),
    assetId: z.uuid().nullable(),
    url: https.nullable(),
    label: text(200),
  })
  .refine((v) => (v.assetId === null) !== (v.url === null), "A video is either an upload or a link.")

const questionElement = z
  .strictObject({
    ...base,
    type: z.literal("question"),
    questionType: z.enum(QUESTION_TYPES),
    prompt: text(1000).trim().min(1, "Write the question."),
    options: z.array(text(LIMITS.option)).max(LIMITS.options),
    correct: z.array(z.int().min(0).max(LIMITS.options - 1)).max(LIMITS.options),
    answers: z.array(text(200)).max(LIMITS.answers),
    explanation: text(1000),
    fontSize: num(8, 72),
    color,
    fill,
  })
  .superRefine((q, ctx) => {
    const problem = questionProblem(q)
    if (problem) ctx.addIssue({ code: "custom", message: problem })
  })

const buttonElement = z
  .strictObject({
    ...base,
    type: z.literal("button"),
    label: text(60).trim().min(1, "Give the button a label."),
    action: z.enum(BUTTON_ACTIONS),
    target: z.string().max(1000).nullable(),
    fill: color,
    color,
    fontSize: num(8, 72),
  })
  .superRefine((b, ctx) => {
    if (b.action === "url" && !(b.target && HTTPS.test(b.target))) ctx.addIssue({ code: "custom", message: "The button needs an https:// link." })
    if (b.action === "page" && !(b.target && ID.test(b.target))) ctx.addIssue({ code: "custom", message: "Choose the page the button opens." })
  })

export const elementSchema = z.union([
  textElement,
  imageElement,
  shapeElement,
  tableElement,
  iconElement,
  audioElement,
  videoElement,
  questionElement,
  buttonElement,
])

export const pageSchema = z.strictObject({
  id,
  background: color,
  elements: z.array(elementSchema).max(LIMITS.elementsPerPage),
})

export const contentSchema = z
  .strictObject({
    pageSize: z.enum(PAGE_SIZE_IDS as [PageSizeId, ...PageSizeId[]]),
    pages: z.array(pageSchema).min(1).max(LIMITS.pages),
  })
  .superRefine((content, ctx) => {
    const pageIds = new Set<string>()
    const elementIds = new Set<string>()
    for (const page of content.pages) {
      if (pageIds.has(page.id)) ctx.addIssue({ code: "custom", message: "Page ids must be unique." })
      pageIds.add(page.id)
      for (const el of page.elements) {
        if (elementIds.has(el.id)) ctx.addIssue({ code: "custom", message: "Element ids must be unique." })
        elementIds.add(el.id)
      }
    }
    for (const page of content.pages)
      for (const el of page.elements)
        if (el.type === "button" && el.action === "page" && !pageIds.has(el.target ?? ""))
          ctx.addIssue({ code: "custom", message: `The button "${el.label}" opens a page that no longer exists.` })
    if (new TextEncoder().encode(JSON.stringify(content)).length > LIMITS.contentBytes)
      ctx.addIssue({ code: "custom", message: "The design is too large. Split it into several designs." })
  })

export type DesignElement = z.infer<typeof elementSchema>
export type DesignPage = z.infer<typeof pageSchema>
export type DesignContent = z.infer<typeof contentSchema>
export type ElementOf<T extends ElementType> = Extract<DesignElement, { type: T }>

export function questionProblem(q: { questionType: QuestionType; options: string[]; correct: number[]; answers: string[] }) {
  const inRange = q.correct.every((i) => i < q.options.length)
  switch (q.questionType) {
    case "multiple_choice":
      if (q.options.length < 2 || q.options.some((o) => !o.trim())) return "Give at least two options, none empty."
      if (q.correct.length < 1 || !inRange) return "Mark the correct option."
      return null
    case "true_false":
      if (q.options.length !== 2 || q.correct.length !== 1 || !inRange) return "Choose whether the statement is true or false."
      return null
    case "short_answer":
      if (q.answers.filter((a) => a.trim()).length < 1) return "Give at least one accepted answer."
      return null
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function newId(prefix = "e") {
  return `${prefix}${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`
}

export function blankPage(background = "#ffffff"): DesignPage {
  return { id: newId("p"), background, elements: [] }
}

/** A new element of a type, centred on the page. */
export function createElement(type: Exclude<ElementType, "image" | "audio" | "video">, size: { width: number; height: number }): DesignElement
export function createElement(type: "image" | "audio", size: { width: number; height: number }, assetId: string): DesignElement
export function createElement(type: "video", size: { width: number; height: number }, assetId: string | null, url?: string | null): DesignElement
export function createElement(type: ElementType, size: { width: number; height: number }, assetId?: string | null, url?: string | null): DesignElement {
  const box = (w: number, h: number) => ({ id: newId(), x: Math.round((size.width - w) / 2), y: Math.round((size.height - h) / 2), w, h })
  switch (type) {
    case "text":
      return { ...box(480, 80), type, text: "Double-click to edit", fontSize: 36, fontFamily: "sans", bold: false, italic: false, underline: false, align: "left", color: "#1f2937", fill: "transparent" }
    case "image":
      return { ...box(400, 300), type, assetId: assetId!, fit: "cover", radius: 0, alt: "" }
    case "shape":
      return { ...box(240, 160), type, shape: "rect", fill: "#bfdbfe", stroke: "transparent", strokeWidth: 0, radius: 16 }
    case "table":
      return { ...box(600, 180), type, rows: [["Word", "Meaning"], ["", ""], ["", ""]], header: true, fontSize: 20, color: "#1f2937", borderColor: "#94a3b8", headerFill: "#e0f2fe" }
    case "icon":
      return { ...box(120, 120), type, icon: "star", color: "#f59e0b" }
    case "audio":
      return { ...box(360, 80), type, assetId: assetId!, label: "Listen" }
    case "video":
      return { ...box(640, 360), type, assetId: assetId ?? null, url: url ?? null, label: "Video" }
    case "question":
      return { ...box(640, 280), type, questionType: "multiple_choice", prompt: "Choose the correct answer.", options: ["Option A", "Option B", "Option C"], correct: [0], answers: [], explanation: "", fontSize: 24, color: "#1f2937", fill: "#ffffff" }
    case "button":
      return { ...box(220, 64), type, label: "Next", action: "next", target: null, fill: "#2563eb", color: "#ffffff", fontSize: 24 }
  }
}

/** A starting point for "blank" designs of each kind. */
export function blankContent(kind: DesignKind, pageSize: PageSizeId = DEFAULT_PAGE_SIZE[kind]): DesignContent {
  const size = PAGE_SIZES[pageSize]
  const page = blankPage()
  if (kind === "flashcards" || kind === "vocabulary_cards") {
    // Front, a hidden back and a Flip button.
    page.elements.push(
      { id: newId(), type: "text", x: 60, y: size.height / 2 - 120, w: size.width - 120, h: 100, text: "word", fontSize: 64, fontFamily: "sans", bold: true, italic: false, underline: false, align: "center", color: "#1e3a5f", fill: "transparent" },
      { id: newId(), type: "text", x: 60, y: size.height / 2, w: size.width - 120, h: 80, text: "meaning", fontSize: 36, fontFamily: "sans", bold: false, italic: false, underline: false, align: "center", color: "#0f766e", fill: "transparent", hidden: true },
      { id: newId(), type: "button", x: size.width / 2 - 90, y: size.height - 110, w: 180, h: 60, label: "Flip", action: "reveal", target: null, fill: "#0f766e", color: "#ffffff", fontSize: 24 }
    )
  } else if (kind === "quiz" || kind === "exit_ticket") {
    const q = createElement("question", size)
    page.elements.push({ ...q, x: 60, y: 60 })
  }
  return { pageSize, pages: [page] }
}

/** Copy of a page with fresh ids (buttons pointing inside the page keep working). */
export function duplicatePage(page: DesignPage): DesignPage {
  return { ...structuredClone(page), id: newId("p"), elements: page.elements.map((el) => ({ ...structuredClone(el), id: newId() })) }
}

export function assetIdsOf(content: DesignContent) {
  const ids = new Set<string>()
  for (const page of content.pages) for (const el of page.elements) if ("assetId" in el && el.assetId) ids.add(el.assetId)
  return ids
}

/** YouTube / Vimeo links become embeds; anything else is opened as a link. */
export function videoEmbedUrl(url: string) {
  const yt = /^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/.exec(url)
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`
  const vimeo = /^https:\/\/(?:www\.)?vimeo\.com\/(\d{6,12})/.exec(url)
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`
  return null
}

/** Short answers: case, spacing and final punctuation are ignored. */
export function normaliseAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!?]+$/, "")
}

export function isCorrect(q: ElementOf<"question">, response: { selected: number[]; text: string }) {
  if (q.questionType === "short_answer") return q.answers.some((a) => normaliseAnswer(a) === normaliseAnswer(response.text))
  const want = [...q.correct].sort().join(",")
  return [...response.selected].sort().join(",") === want
}
