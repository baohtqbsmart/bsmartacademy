import { CEFR_NAMES, STAGE_NAMES, STAGES, type GenerationInput, type LessonPlan } from "@/features/ai/content"
import { newId, PAGE_SIZES, type DesignContent, type DesignElement, type DesignPage } from "@/features/designer/model"

/**
 * Turns an approved plan into platform content. Both results are private or
 * draft: a lesson design only its teacher sees, or an assignment in "draft"
 * status. The teacher decides whether and when students get them.
 */

export const AI_CREDIT = "Prepared with the BSmart AI assistant and reviewed by the teacher."

const { width: W } = PAGE_SIZES.slide
const NAVY = "#1e3a5f"
const INK = "#1f2937"
const MUTED = "#64748b"

const text = (y: number, h: number, value: string, o: Partial<Extract<DesignElement, { type: "text" }>> = {}): DesignElement => ({
  id: newId(),
  type: "text",
  x: 60,
  y,
  w: W - 120,
  h,
  text: value.slice(0, 5000),
  fontSize: 24,
  fontFamily: "sans",
  bold: false,
  italic: false,
  underline: false,
  align: "left",
  color: INK,
  fill: "transparent",
  ...o,
})
const heading = (value: string) => text(36, 70, value.slice(0, 120), { fontSize: 40, bold: true, color: NAVY })
const page = (elements: DesignElement[], background = "#ffffff"): DesignPage => ({ id: newId("p"), background, elements })
const chunk = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size))
const bullets = (items: string[]) => items.map((s) => `• ${s}`).join("\n")

/** Long text split on paragraph or sentence boundaries into slide-sized pieces. */
function splitText(value: string, max = 900) {
  const parts: string[] = []
  let rest = value.trim()
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf("\n", max), rest.lastIndexOf(". ", max) + 1)
    const at = cut > max / 2 ? cut : max
    parts.push(rest.slice(0, at).trim())
    rest = rest.slice(at).trim()
  }
  if (rest) parts.push(rest)
  return parts
}

function exerciseElement(e: LessonPlan["exercises"][number], y: number, index: number): DesignElement[] {
  const base = { id: newId(), x: 60, y, w: W - 120, h: 280, fontSize: 22, color: INK, fill: "#ffffff", explanation: e.explanation.slice(0, 1000) }
  const prompt = `${index}. ${e.prompt}`.slice(0, 1000)
  if (e.type === "multiple_choice" && e.options.length >= 2 && e.options.includes(e.answer))
    return [{ ...base, type: "question", questionType: "multiple_choice", prompt, options: e.options.slice(0, 8).map((o) => o.slice(0, 300)), correct: [e.options.indexOf(e.answer)], answers: [] }]
  if (e.type === "true_false")
    return [{ ...base, h: 200, type: "question", questionType: "true_false", prompt, options: ["True", "False"], correct: [/^true$/i.test(e.answer) ? 0 : 1], answers: [] }]
  if (e.type === "gap_fill" || e.type === "short_answer")
    return [{ ...base, h: 200, type: "question", questionType: "short_answer", prompt, options: [], correct: [], answers: [e.answer.slice(0, 200)] }]
  // Matching: the items as text, the answer hidden until revealed.
  return [
    text(y, 180, `${prompt}\n${e.options.map((o) => `   ${o}`).join("\n")}`, { fontSize: 22 }),
    text(y + 190, 60, `Answer: ${e.answer}`, { fontSize: 20, color: "#15803d", hidden: true }),
  ]
}

export function planToDesign(plan: LessonPlan, input: GenerationInput): DesignContent {
  const pages: DesignPage[] = []
  pages.push(
    page(
      [
        text(200, 130, plan.title, { fontSize: 56, bold: true, align: "center", color: NAVY }),
        text(340, 110, plan.summary.slice(0, 400), { fontSize: 24, align: "center", color: MUTED }),
        text(470, 50, `${CEFR_NAMES[input.cefr]} · age ${input.studentAge} · ${input.durationMinutes} minutes`, { fontSize: 22, align: "center", color: MUTED }),
        text(640, 40, AI_CREDIT, { fontSize: 16, italic: true, align: "center", color: MUTED }),
      ],
      "#f0f7ff"
    )
  )
  pages.push(page([heading("Learning objectives"), text(130, 540, bullets(plan.objectives), { fontSize: 28 })]))

  for (const stage of STAGES) {
    const s = plan[stage]
    chunk(s.steps, 6).forEach((steps, i) => {
      const elements = [heading(`${STAGE_NAMES[stage]} · ${s.minutes} min${i ? " (cont.)" : ""}`), text(130, 440, bullets(steps), { fontSize: 24 })]
      if (i === 0 && s.materials.length) elements.push(text(590, 50, `Materials: ${s.materials.join(", ")}`.slice(0, 500), { fontSize: 18, color: MUTED }))
      if (i === 0 && s.teacherNotes) elements.push(text(645, 50, `Teacher notes: ${s.teacherNotes}`.slice(0, 500), { fontSize: 16, italic: true, color: MUTED, hidden: true }))
      pages.push(page(elements))
    })
  }

  chunk(plan.vocabulary, 8).forEach((words, i) =>
    pages.push(
      page([
        heading(i ? "Vocabulary (cont.)" : "Vocabulary"),
        {
          id: newId(),
          type: "table",
          x: 60,
          y: 120,
          w: W - 120,
          h: 560,
          rows: [["Word", "Meaning", "Example"], ...words.map((v) => [`${v.word} (${v.partOfSpeech})${v.vietnamese ? ` – ${v.vietnamese}` : ""}`.slice(0, 500), v.meaning.slice(0, 500), v.example.slice(0, 500)])],
          header: true,
          fontSize: 18,
          color: INK,
          borderColor: "#94a3b8",
          headerFill: "#e0f2fe",
        },
      ])
    )
  )

  for (const [label, body] of [
    ["Reading", plan.readingText],
    ["Listening script (for the teacher)", plan.listeningScript],
  ] as const)
    splitText(body).forEach((part, i) => pages.push(page([heading(i ? `${label} (cont.)` : label), text(120, 560, part, { fontSize: 22, fontFamily: "serif" })])))

  chunk(plan.exercises, 2).forEach((pair, i) =>
    pages.push(page([heading(i ? "Exercises (cont.)" : "Exercises"), ...pair.flatMap((e, j) => exerciseElement(e, 120 + j * 290, i * 2 + j + 1))], "#fffdf7"))
  )

  chunk(plan.speakingPrompts, 5).forEach((prompts, i) => pages.push(page([heading(i ? "Speaking (cont.)" : "Speaking"), text(130, 540, bullets(prompts), { fontSize: 26 })])))

  if (plan.writingPrompt)
    pages.push(
      page([
        heading("Writing"),
        text(130, 260, plan.writingPrompt.task, { fontSize: 26 }),
        text(400, 40, `${plan.writingPrompt.minWords}–${plan.writingPrompt.maxWords} words`, { fontSize: 22, bold: true }),
        text(450, 230, `Criteria:\n${bullets(plan.writingPrompt.criteria)}`, { fontSize: 20, color: MUTED }),
      ])
    )

  if (plan.differentiation)
    pages.push(
      page([
        heading("Differentiated activities"),
        {
          id: newId(),
          type: "table",
          x: 60,
          y: 120,
          w: W - 120,
          h: 560,
          rows: [["Support", "Core", "Challenge"], [bullets(plan.differentiation.support), bullets(plan.differentiation.core), bullets(plan.differentiation.challenge)].map((c) => c.slice(0, 500))],
          header: true,
          fontSize: 18,
          color: INK,
          borderColor: "#94a3b8",
          headerFill: "#ecfdf5",
        },
      ])
    )

  pages.push(page([heading("Homework"), text(120, 120, plan.homework.instructions, { fontSize: 24 }), text(250, 430, bullets(plan.homework.tasks), { fontSize: 24 })], "#fff7ed"))

  return { pageSize: "slide", pages: pages.slice(0, 60) }
}

/** Instructions for a draft homework assignment. */
export function planToHomework(plan: LessonPlan, reviewer: string) {
  const tasks = plan.homework.tasks.map((t, i) => `${i + 1}. ${t}`).join("\n")
  return {
    title: `Homework – ${plan.title}`.slice(0, 200),
    instructions: `${plan.homework.instructions}\n\n${tasks}\n\n— ${AI_CREDIT.replace("the teacher", reviewer || "the teacher")}`.slice(0, 10_000),
  }
}

