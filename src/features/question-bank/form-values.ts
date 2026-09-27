import type { QuestionFormValues } from "@/features/question-bank/schemas"
import { asContent, asKey, type QuestionType } from "@/features/tests/questions"
import type { Json } from "@/types/database"

export function emptyQuestion(subjectId = ""): QuestionFormValues {
  return {
    subjectId,
    questionType: "multiple_choice",
    skill: "",
    cefrLevel: "",
    topic: "",
    difficulty: "medium",
    points: "1",
    tags: "",
    prompt: "",
    options: ["", "", "", ""],
    correct: [],
    trueFalse: "",
    pairs: [
      { left: "", right: "" },
      { left: "", right: "" },
      { left: "", right: "" },
    ],
    blanks: [],
    caseSensitive: false,
    accepted: "",
    sourceText: "",
    listeningFormat: "choice",
    minWords: "",
    maxWords: "",
    maxSeconds: "",
    explanation: "",
    mediaPath: null,
  }
}

type StoredQuestion = {
  id: string
  subject_id: string
  question_type: QuestionType
  skill: string | null
  cefr_level: string | null
  topic: string | null
  difficulty: QuestionFormValues["difficulty"]
  points: number
  tags: string[]
  prompt: string
  content: Json
  media_path: string | null
  key: { answer: Json; explanation: string | null } | null
}

/** A stored question and its key, back in editor form. */
export function toFormValues(q: StoredQuestion): QuestionFormValues {
  const content = asContent(q.content)
  const key = asKey(q.key?.answer)
  const correct = Array.isArray(key.correct) ? key.correct : typeof key.correct === "number" ? [key.correct] : []
  return {
    ...emptyQuestion(q.subject_id),
    questionId: q.id,
    questionType: q.question_type,
    skill: q.skill ?? "",
    cefrLevel: q.cefr_level ?? "",
    topic: q.topic ?? "",
    difficulty: q.difficulty,
    points: String(Number(q.points)),
    tags: q.tags.join(", "),
    prompt: q.prompt,
    options: content.options ?? ["", "", "", ""],
    correct,
    trueFalse: typeof key.correct === "boolean" ? (key.correct ? "true" : "false") : "",
    pairs: content.left
      ? content.left.map((left, i) => ({ left, right: content.right?.[key.pairs?.[i] ?? -1] ?? "" }))
      : emptyQuestion().pairs,
    blanks: (key.blanks ?? []).map((alternatives) => alternatives.join(" | ")),
    caseSensitive: key.case_sensitive ?? false,
    accepted: (key.accepted ?? []).join("\n"),
    sourceText: content.source_text ?? "",
    listeningFormat: content.format ?? "choice",
    minWords: content.min_words ? String(content.min_words) : "",
    maxWords: content.max_words ? String(content.max_words) : "",
    maxSeconds: content.max_seconds ? String(content.max_seconds) : "",
    explanation: q.key?.explanation ?? "",
    mediaPath: q.media_path,
  }
}
