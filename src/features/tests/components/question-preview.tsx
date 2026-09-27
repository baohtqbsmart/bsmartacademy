import { CircleCheckIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  asContent,
  asKey,
  describeKey,
  QUESTION_TYPE_LABELS,
  splitBlanks,
  type QuestionType,
} from "@/features/tests/questions"
import type { Json } from "@/types/database"

type PreviewProps = {
  type: QuestionType
  prompt: string
  content: Json
  points: number
  /** Only for staff (or when a review policy allows it). */
  answerKey?: Json | null
  explanation?: string | null
  mediaUrl?: string | null
}

/** A question as a teacher sees it, with the correct answer highlighted when given. */
export function QuestionPreview({ type, prompt, content: raw, points, answerKey, explanation, mediaUrl }: PreviewProps) {
  const content = asContent(raw)
  const key = answerKey ? asKey(answerKey) : null
  const correct = key ? (Array.isArray(key.correct) ? key.correct : typeof key.correct === "number" ? [key.correct] : []) : []

  return (
    <div className="grid gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{QUESTION_TYPE_LABELS[type]}</Badge>
        <span className="text-muted-foreground tabular-nums">
          {Number(points)} pt{Number(points) === 1 ? "" : "s"}
        </span>
      </div>
      <p className="font-medium whitespace-pre-wrap">
        {type === "fill_blank"
          ? splitBlanks(prompt).map((part, i, parts) => (
              <span key={i}>
                {part}
                {i < parts.length - 1 && <span className="text-muted-foreground mx-1 inline-block min-w-12 border-b">({i + 1})</span>}
              </span>
            ))
          : prompt}
      </p>
      {content.source_text && <p className="bg-muted/50 rounded-md px-3 py-2 italic">{content.source_text}</p>}
      {mediaUrl && (type === "listening" || type === "speaking" ? (
        <audio controls src={mediaUrl} className="w-full max-w-md" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl} alt="" className="max-h-64 rounded-md border" />
      ))}
      {content.options && (
        <ul className="grid gap-1">
          {content.options.map((option, i) => (
            <li key={i} className={correct.includes(i) ? "font-medium" : undefined}>
              {String.fromCharCode(65 + i)}. {option}
              {correct.includes(i) && <CircleCheckIcon className="ml-1 inline size-3.5 text-[#006300] dark:text-[#0ca30c]" aria-label="Correct" />}
            </li>
          ))}
        </ul>
      )}
      {content.left && (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1">
          <ul className="grid gap-1">
            {content.left.map((item, i) => (
              <li key={i}>
                {i + 1}. {item}
              </li>
            ))}
          </ul>
          <ul className="grid gap-1">
            {(content.right ?? []).map((item, i) => (
              <li key={i}>
                {String.fromCharCode(97 + i)}. {item}
              </li>
            ))}
          </ul>
        </div>
      )}
      {key && type !== "multiple_choice" && type !== "multiple_response" && describeKey(type, content, key) && (
        <p>
          <span className="text-muted-foreground">Correct answer: </span>
          {describeKey(type, content, key)}
        </p>
      )}
      {explanation && (
        <p className="text-muted-foreground whitespace-pre-wrap">
          <span className="font-medium">Explanation: </span>
          {explanation}
        </p>
      )}
    </div>
  )
}
