import { BotIcon, MessageSquareIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  AI_FEEDBACK_LABEL,
  AI_FEEDBACK_NOTICE,
  CATEGORY_LABELS,
  formatSeconds,
  isOfficial,
  segments,
  type AnnotationCategory,
  type FeedbackSource,
} from "@/features/assessments/scoring"
import { cn } from "@/lib/utils"

export type AnnotationView = {
  id: string
  anchor: "text" | "time" | "general"
  start_offset: number | null
  end_offset: number | null
  quote: string | null
  time_seconds: number | null
  category: AnnotationCategory
  comment: string | null
  suggestion: string | null
  source: FeedbackSource
  created_by_name: string
}

/**
 * The submitted text with numbered highlights. Numbers are drawn with CSS
 * (::after), so the rendered text stays identical to the stored text and
 * selections map to the same character offsets.
 */
export function AnnotatedText({
  text,
  annotations,
  activeId,
  containerRef,
}: {
  text: string
  annotations: AnnotationView[]
  activeId?: string | null
  containerRef?: React.Ref<HTMLDivElement>
}) {
  const highlights = annotations
    .filter((a) => a.anchor === "text" && a.start_offset !== null && a.end_offset !== null)
    .map((a) => ({ ...a, id: a.id, start: a.start_offset!, end: a.end_offset! }))
  const number = new Map(highlights.sort((a, b) => a.start - b.start).map((h, i) => [h.id, i + 1]))
  return (
    <div ref={containerRef} className="rounded-md border p-4 text-base leading-8 whitespace-pre-wrap">
      {segments(text, highlights).map((part) =>
        part.highlight ? (
          <mark
            key={part.start}
            data-n={number.get(part.highlight.id)}
            title={[CATEGORY_LABELS[part.highlight.category], part.highlight.comment, part.highlight.suggestion && `→ ${part.highlight.suggestion}`].filter(Boolean).join(" · ")}
            className={cn(
              "rounded-sm bg-[#fab219]/30 px-0.5 text-inherit after:ml-0.5 after:align-super after:text-[0.65em] after:font-semibold after:content-[attr(data-n)]",
              activeId === part.highlight.id && "ring-2 ring-[#fab219]",
              !isOfficial(part.highlight.source) && "bg-muted underline decoration-dotted"
            )}
          >
            {part.text}
          </mark>
        ) : (
          <span key={part.start}>{part.text}</span>
        )
      )}
    </div>
  )
}

/** The list of comments (highlights first, in text order, then time-stamped, then general). */
export function AnnotationList({ annotations, actions }: { annotations: AnnotationView[]; actions?: (a: AnnotationView) => React.ReactNode }) {
  const text = annotations.filter((a) => a.anchor === "text").sort((a, b) => (a.start_offset ?? 0) - (b.start_offset ?? 0))
  const timed = annotations.filter((a) => a.anchor === "time").sort((a, b) => (a.time_seconds ?? 0) - (b.time_seconds ?? 0))
  const general = annotations.filter((a) => a.anchor === "general")
  if (annotations.length === 0) return <p className="text-muted-foreground text-sm">No comments.</p>
  return (
    <ol className="grid gap-3 text-sm">
      {[...text, ...timed, ...general].map((a) => (
        <li key={a.id} className="grid gap-1 border-b pb-3 last:border-0">
          <div className="flex flex-wrap items-center gap-2">
            {a.anchor === "text" && <span className="font-semibold tabular-nums">{text.indexOf(a) + 1}</span>}
            {a.anchor === "time" && <Badge variant="secondary" className="tabular-nums">{formatSeconds(Number(a.time_seconds))}</Badge>}
            {a.anchor === "general" && <MessageSquareIcon className="text-muted-foreground size-4" aria-label="General comment" />}
            <Badge variant="outline">{CATEGORY_LABELS[a.category]}</Badge>
            <SourceBadge source={a.source} />
            {actions && <span className="ml-auto flex gap-1">{actions(a)}</span>}
          </div>
          {a.quote && (
            <p>
              <span className="text-[#b02a2a] line-through dark:text-[#ef7b7b]">{a.quote}</span>
              {a.suggestion && <span className="text-[#006300] dark:text-[#0ca30c]"> → {a.suggestion}</span>}
            </p>
          )}
          {!a.quote && a.suggestion && <p className="text-[#006300] dark:text-[#0ca30c]">Suggested: {a.suggestion}</p>}
          {a.comment && <p className="whitespace-pre-wrap">{a.comment}</p>}
          {!isOfficial(a.source) && <p className="text-muted-foreground text-xs">{AI_FEEDBACK_NOTICE}</p>}
        </li>
      ))}
    </ol>
  )
}

/** Teacher comments need no badge; anything else is always labelled "AI-assisted feedback". */
export function SourceBadge({ source }: { source: FeedbackSource }) {
  if (isOfficial(source)) return null
  return (
    <Badge variant="outline" className="gap-1">
      <BotIcon className="size-3" aria-hidden /> {AI_FEEDBACK_LABEL}
    </Badge>
  )
}
