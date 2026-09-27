"use client"

import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, EyeIcon, MaximizeIcon, MinimizeIcon, XIcon } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ButtonBody, MediaCard, PageView, type AssetUrls } from "@/features/designer/components/page-view"
import { useFitScale } from "@/features/designer/components/use-fit-scale"
import { isCorrect, PAGE_SIZES, videoEmbedUrl, type DesignContent, type DesignElement, type ElementOf } from "@/features/designer/model"
import { cn } from "@/lib/utils"

type Response = { selected: number[]; text: string; checked: boolean }

/**
 * Plays a design page by page: buttons work, hidden items appear on Reveal,
 * questions can be answered and checked (practice only; nothing is recorded
 * or graded — use Tests or Assignments for that).
 */
export function Presenter({ content, assets, title, onClose, className }: { content: DesignContent; assets: AssetUrls; title: string; onClose?: () => void; className?: string }) {
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [responses, setResponses] = useState<Record<string, Response>>({})
  const [fullscreen, setFullscreen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const size = PAGE_SIZES[content.pageSize]
  const scale = useFitScale(stageRef, size.width, size.height, { padding: 12, max: 3 })
  const page = content.pages[Math.min(index, content.pages.length - 1)]
  const hasHidden = page.elements.some((el) => el.hidden)
  const isRevealed = revealed.has(page.id)

  const go = useCallback((next: number) => setIndex(Math.max(0, Math.min(content.pages.length - 1, next))), [content.pages.length])
  const reveal = () => setRevealed((r) => new Set(r).add(page.id))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [contenteditable=true]")) return
      if (["ArrowRight", "PageDown", " "].includes(e.key)) {
        e.preventDefault()
        go(index + 1)
      } else if (["ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault()
        go(index - 1)
      } else if (e.key === "Escape" && onClose && !document.fullscreenElement) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [go, index, onClose])

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined)
  }

  function runButton(el: ElementOf<"button">) {
    switch (el.action) {
      case "next":
        return go(index + 1)
      case "prev":
        return go(index - 1)
      case "page": {
        const target = content.pages.findIndex((p) => p.id === el.target)
        if (target >= 0) go(target)
        return
      }
      case "reveal":
        return reveal()
      case "url":
        if (el.target?.startsWith("https://")) window.open(el.target, "_blank", "noopener,noreferrer")
        return
    }
  }

  const interactive = (el: DesignElement): React.ReactNode | undefined => {
    switch (el.type) {
      case "button":
        return (
          <button type="button" onClick={() => runButton(el)} style={{ all: "unset", display: "block", width: "100%", height: "100%", cursor: "pointer" }} aria-label={el.label}>
            <ButtonBody el={el} />
          </button>
        )
      case "question":
        return (
          <PracticeQuestion
            el={el}
            response={responses[el.id] ?? { selected: [], text: "", checked: false }}
            onChange={(r) => setResponses((all) => ({ ...all, [el.id]: r }))}
          />
        )
      case "audio": {
        const url = assets[el.assetId]?.url
        return url ? (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center" }}>
            <audio controls src={url} style={{ width: "100%" }} aria-label={el.label || "Audio"} />
          </div>
        ) : (
          <MediaCard icon={null} label="Audio unavailable" />
        )
      }
      case "video": {
        if (el.assetId) {
          const url = assets[el.assetId]?.url
          return url ? <video controls src={url} style={{ width: "100%", height: "100%", background: "#000", borderRadius: 12 }} aria-label={el.label || "Video"} /> : <MediaCard icon={null} label="Video unavailable" />
        }
        const embed = el.url ? videoEmbedUrl(el.url) : null
        if (embed)
          return (
            <iframe
              src={embed}
              title={el.label || "Video"}
              style={{ width: "100%", height: "100%", border: 0, borderRadius: 12 }}
              allow="encrypted-media; picture-in-picture; fullscreen"
              sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )
        return (
          <a href={el.url ?? "#"} target="_blank" rel="noopener noreferrer" style={{ all: "unset", display: "block", width: "100%", height: "100%", cursor: "pointer" }}>
            <MediaCard icon={<ExternalLinkIcon style={{ width: 28, height: 28 }} />} label={`${el.label || "Video"} — open link`} />
          </a>
        )
      }
      default:
        return undefined
    }
  }

  return (
    <div ref={rootRef} className={cn("bg-muted flex min-h-0 flex-col", fullscreen && "bg-black", className)}>
      <div className="bg-background flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        {hasHidden && (
          <Button size="sm" variant="outline" onClick={reveal} disabled={isRevealed}>
            <EyeIcon aria-hidden /> {isRevealed ? "Revealed" : "Reveal"}
          </Button>
        )}
        <Button size="icon" variant="ghost" onClick={toggleFullscreen} aria-label={fullscreen ? "Exit full screen" : "Full screen"}>
          {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
        </Button>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close preview">
            <XIcon />
          </Button>
        )}
      </div>
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {scale > 0 && (
          <div style={{ width: size.width * scale, height: size.height * scale }} className="shadow-lg">
            <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
              <PageView key={page.id} page={page} pageSize={content.pageSize} assets={assets} mode="present" revealed={isRevealed} interactive={interactive} />
            </div>
          </div>
        )}
      </div>
      <div className="bg-background flex items-center justify-center gap-3 border-t px-3 py-2">
        <Button size="icon" variant="outline" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous page">
          <ChevronLeftIcon />
        </Button>
        <span className="text-sm tabular-nums" aria-live="polite">
          {index + 1} / {content.pages.length}
        </span>
        <Button size="icon" variant="outline" onClick={() => go(index + 1)} disabled={index === content.pages.length - 1} aria-label="Next page">
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}

function PracticeQuestion({ el, response, onChange }: { el: ElementOf<"question">; response: Response; onChange: (r: Response) => void }) {
  const multiple = el.questionType === "multiple_choice" && el.correct.length > 1
  const right = response.checked && isCorrect(el, response)
  const toggle = (i: number) => {
    const selected = multiple ? (response.selected.includes(i) ? response.selected.filter((x) => x !== i) : [...response.selected, i]) : [i]
    onChange({ ...response, selected, checked: false })
  }
  const answered = el.questionType === "short_answer" ? response.text.trim() !== "" : response.selected.length > 0
  return (
    <div style={{ width: "100%", height: "100%", overflow: "auto", background: el.fill === "transparent" ? "transparent" : el.fill, color: el.color, fontSize: el.fontSize, padding: 16, borderRadius: 12, border: "1.5px solid #cbd5e1", boxSizing: "border-box" }}>
      <div style={{ fontWeight: 700, marginBottom: 10, whiteSpace: "pre-wrap" }}>{el.prompt}</div>
      {el.questionType === "short_answer" ? (
        <input
          value={response.text}
          onChange={(e) => onChange({ ...response, text: e.target.value, checked: false })}
          aria-label={el.prompt}
          style={{ width: "100%", fontSize: el.fontSize, padding: "4px 8px", border: "2px solid #94a3b8", borderRadius: 8, background: "#fff", color: "#1f2937", boxSizing: "border-box" }}
        />
      ) : (
        <div role={multiple ? "group" : "radiogroup"} aria-label={el.prompt} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {el.options.map((option, i) => {
            const selected = response.selected.includes(i)
            const markRight = response.checked && el.correct.includes(i)
            const markWrong = response.checked && selected && !el.correct.includes(i)
            return (
              <button
                key={i}
                type="button"
                role={multiple ? "checkbox" : "radio"}
                aria-checked={selected}
                onClick={() => toggle(i)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "4px 10px",
                  borderRadius: 10,
                  border: `2px solid ${markRight ? "#15803d" : markWrong ? "#b91c1c" : selected ? "#2563eb" : "#e2e8f0"}`,
                  background: markRight ? "#dcfce7" : markWrong ? "#fee2e2" : selected ? "#dbeafe" : "#ffffff",
                  color: "#1f2937",
                }}
              >
                {option}
                {markRight && " ✓"}
                {markWrong && " ✗"}
              </button>
            )
          })}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={!answered}
          onClick={() => onChange({ ...response, checked: true })}
          style={{ all: "unset", cursor: answered ? "pointer" : "not-allowed", opacity: answered ? 1 : 0.5, background: "#0f766e", color: "#fff", padding: "4px 16px", borderRadius: 999, fontSize: el.fontSize * 0.8, fontWeight: 700 }}
        >
          Check
        </button>
        {response.checked && (
          <span role="status" style={{ fontWeight: 700, color: right ? "#15803d" : "#b91c1c", fontSize: el.fontSize * 0.85 }}>
            {right ? "✓ Correct!" : el.questionType === "short_answer" ? `✗ Answer: ${el.answers.filter((a) => a.trim()).join(" / ")}` : "✗ Not quite"}
          </span>
        )}
      </div>
      {response.checked && el.explanation && <div style={{ marginTop: 8, fontSize: el.fontSize * 0.8, color: "#475569", fontStyle: "italic" }}>{el.explanation}</div>}
    </div>
  )
}
