"use client"

import {
  AlertTriangleIcon,
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CircleHelpIcon,
  CloudIcon,
  CopyIcon,
  DownloadIcon,
  FilmIcon,
  ImageIcon,
  Loader2Icon,
  MousePointerClickIcon,
  PlayIcon,
  PlusIcon,
  Redo2Icon,
  ShapesIcon,
  SlidersHorizontalIcon,
  SmileIcon,
  TableIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  Volume2Icon,
} from "lucide-react"
import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { routes } from "@/config/routes"
import { deleteDesignAction, saveDesignAction } from "@/features/designer/actions"
import { EditorCanvas } from "@/features/designer/components/editor-canvas"
import { ExportDialog } from "@/features/designer/components/export-dialog"
import { MediaPicker } from "@/features/designer/components/media-picker"
import { PageThumbnail, type AssetUrls } from "@/features/designer/components/page-view"
import { Presenter } from "@/features/designer/components/presenter"
import { elementLabel, PropertiesPanel } from "@/features/designer/components/properties-panel"
import { ShareDialog } from "@/features/designer/components/share-dialog"
import { useFitScale } from "@/features/designer/components/use-fit-scale"
import {
  addElement,
  addPage,
  commit,
  createHistory,
  duplicateElement,
  duplicatePageAfter,
  endGesture,
  movePage,
  moveLayer,
  preview,
  redo,
  removeElement,
  removePage,
  setBackground,
  setPageSize,
  undo,
  updateElement,
  type Box,
  type History,
} from "@/features/designer/editor-state"
import {
  contentSchema,
  createElement,
  DESIGN_KINDS,
  KIND_LABELS,
  PAGE_SIZES,
  type DesignContent,
  type DesignElement,
  type DesignKind,
} from "@/features/designer/model"
import type { AssetInfo } from "@/features/designer/server/design-service"
import type { Media } from "@/features/designer/uploads"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

type SaveStatus = { state: "saved" | "dirty" | "saving" } | { state: "invalid" | "error" | "conflict"; message: string }

const AUTOSAVE_MS = 1500
const ZOOMS = [
  { id: "fit", label: "Fit" },
  { id: "0.5", label: "50%" },
  { id: "0.75", label: "75%" },
  { id: "1", label: "100%" },
  { id: "1.5", label: "150%" },
]

type Tool = { id: DesignElement["type"]; label: string; icon: typeof TypeIcon }
const TOOLS: Tool[] = [
  { id: "text", label: "Text", icon: TypeIcon },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "shape", label: "Shape", icon: ShapesIcon },
  { id: "table", label: "Table", icon: TableIcon },
  { id: "icon", label: "Icon", icon: SmileIcon },
  { id: "audio", label: "Audio", icon: Volume2Icon },
  { id: "video", label: "Video", icon: FilmIcon },
  { id: "question", label: "Question", icon: CircleHelpIcon },
  { id: "button", label: "Button", icon: MousePointerClickIcon },
]

/** Where the first problem is, in words: "Page 2, Question: …". */
function describeProblem(content: DesignContent) {
  const parsed = contentSchema.safeParse(content)
  if (parsed.success) return null
  const issue = parsed.error.issues[0]
  const [, pageIndex, , elementIndex] = issue.path
  const page = typeof pageIndex === "number" ? content.pages[pageIndex] : undefined
  const el = page && typeof elementIndex === "number" ? page.elements[elementIndex] : undefined
  const where = [page ? `Page ${(pageIndex as number) + 1}` : null, el ? elementLabel(el) : null].filter(Boolean).join(", ")
  return { message: where ? `${where}: ${issue.message}` : issue.message, pageId: page?.id, elementId: el?.id }
}

export function DesignEditor({
  design,
  initialAssets,
}: {
  design: { id: string; title: string; kind: DesignKind; content: DesignContent; version: number; share_token: string | null }
  initialAssets: Record<string, AssetInfo>
}) {
  const t = useT()
  const [history, setHistory] = useState<History>(() => createHistory(design.content))
  const content = history.present
  const [title, setTitle] = useState(design.title)
  const [kind, setKind] = useState<DesignKind>(design.kind)
  const [pageId, setPageId] = useState(design.content.pages[0].id)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [assets, setAssets] = useState(initialAssets)
  const [status, setStatus] = useState<SaveStatus>({ state: "saved" })
  const [zoom, setZoom] = useState("fit")
  const [presenting, setPresenting] = useState(false)
  const [picker, setPicker] = useState<{ media: Media; replace: boolean } | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const page = content.pages.find((p) => p.id === pageId) ?? content.pages[0]
  const pageIndex = content.pages.indexOf(page)
  const selected = page.elements.find((el) => el.id === selectedId) ?? null
  const size = PAGE_SIZES[content.pageSize]
  const assetUrls: AssetUrls = assets

  const viewportRef = useRef<HTMLDivElement>(null)
  const fit = useFitScale(viewportRef, size.width, size.height, { padding: 24, max: 1.5 })
  const scale = zoom === "fit" ? fit : Number(zoom)

  // --- changes --------------------------------------------------------------
  const change = useCallback((fn: (c: DesignContent) => DesignContent, mergeKey: string | null = null) => {
    setHistory((h) => commit(h, fn(h.present), mergeKey))
  }, [])

  /** For changes that create ids: computed once from the current content (updaters may run twice). */
  const apply = (next: DesignContent) => setHistory((h) => commit(h, next))

  const gestureStart = useRef<DesignContent | null>(null)

  function add(type: DesignElement["type"]) {
    if (type === "image" || type === "audio" || type === "video") {
      setPicker({ media: type, replace: false })
      return
    }
    const el = createElement(type, size)
    change((c) => addElement(c, page.id, el))
    setSelectedId(el.id)
  }

  function placeMedia(media: Media, assetId: string | null, url: string | null = null) {
    const replacing = picker?.replace && selected && selected.type === media
    setPicker(null)
    if (replacing) {
      change((c) => updateElement(c, page.id, selected.id, media === "video" ? { assetId, url } : { assetId: assetId! }))
      return
    }
    const el = media === "video" ? createElement("video", size, assetId, url) : createElement(media, size, assetId!)
    change((c) => addElement(c, page.id, el))
    setSelectedId(el.id)
  }

  const elementAction = useCallback(
    (action: "duplicate" | "delete" | "forward" | "backward" | "front" | "back") => {
      if (!selectedId) return
      if (action === "delete") {
        change((c) => removeElement(c, pageId, selectedId))
        setSelectedId(null)
      } else if (action === "duplicate") {
        const [next, copyId] = duplicateElement(content, pageId, selectedId)
        setHistory((h) => commit(h, next))
        if (copyId) setSelectedId(copyId)
      } else change((c) => moveLayer(c, pageId, selectedId, action))
    },
    [change, content, pageId, selectedId]
  )

  // --- keyboard ---------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (presenting || picker) return
      const target = e.target as HTMLElement | null
      if (target?.closest("input, textarea, select, [contenteditable=true], [role=dialog]")) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault()
        setHistory((h) => (e.shiftKey ? redo(h) : undo(h)))
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault()
        setHistory(redo)
      } else if (mod && e.key.toLowerCase() === "d" && selectedId) {
        e.preventDefault()
        elementAction("duplicate")
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault()
        elementAction("delete")
      } else if (e.key === "Escape") {
        setSelectedId(null)
      } else if (selected && e.key.startsWith("Arrow")) {
        e.preventDefault()
        const step = e.shiftKey ? 10 : 1
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0
        change((c) => updateElement(c, pageId, selected.id, { x: selected.x + dx, y: selected.y + dy }), `${selected.id}-nudge`)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [change, elementAction, pageId, picker, presenting, selected, selectedId])

  // --- saving -----------------------------------------------------------------
  const latest = useRef({ content, title, kind })
  const saved = useRef({ content: design.content, title: design.title, kind: design.kind })
  const version = useRef(design.version)
  const inFlight = useRef(false)
  const conflict = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Bumped when edits arrived during a save, so the effect below saves again.
  const [saveAgain, setSaveAgain] = useState(0)

  const isDirty = () => latest.current.content !== saved.current.content || latest.current.title !== saved.current.title || latest.current.kind !== saved.current.kind

  const save = useCallback(async () => {
    clearTimeout(timer.current)
    if (conflict.current || inFlight.current || !isDirty()) return
    const snapshot = latest.current
    if (!snapshot.title.trim()) return setStatus({ state: "invalid", message: "Give the design a title." })
    const problem = describeProblem(snapshot.content)
    if (problem) return setStatus({ state: "invalid", message: problem.message })

    inFlight.current = true
    setStatus({ state: "saving" })
    let result: Awaited<ReturnType<typeof saveDesignAction>>
    try {
      result = await saveDesignAction({ designId: design.id, version: version.current, title: snapshot.title, kind: snapshot.kind, content: snapshot.content })
    } catch {
      // Offline or the server is unreachable: keep the changes here; the next edit or Retry saves again.
      inFlight.current = false
      setStatus({ state: "error", message: "Could not reach the server. Your changes are kept on this page." })
      return
    }
    inFlight.current = false
    if (result.ok) {
      version.current = result.data
      saved.current = snapshot
      if (isDirty()) setSaveAgain((n) => n + 1)
      else setStatus({ state: "saved" })
    } else if (result.error.code === "CONFLICT") {
      conflict.current = true
      setStatus({ state: "conflict", message: result.error.message })
    } else {
      setStatus({ state: "error", message: result.error.message })
    }
  }, [design.id])

  useEffect(() => {
    latest.current = { content, title, kind }
    if (!isDirty()) return
    if (!conflict.current) setStatus((s) => (s.state === "saving" ? s : { state: "dirty" }))
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void save(), AUTOSAVE_MS)
  }, [content, title, kind, save, saveAgain])

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (isDirty()) e.preventDefault()
    }
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      clearTimeout(timer.current)
    }
  }, [])

  // --- page list drag and drop -------------------------------------------------
  const [dragPage, setDragPage] = useState<number | null>(null)

  const panel = (
    <PropertiesPanel
      element={selected}
      page={page}
      pages={content.pages}
      pageSize={content.pageSize}
      onPatch={(patch, mergeKey) => selected && change((c) => updateElement(c, page.id, selected.id, patch), mergeKey ?? null)}
      onAction={elementAction}
      onPickMedia={(media) => setPicker({ media, replace: true })}
      onBackground={(color) => change((c) => setBackground(c, page.id, color), `${page.id}-bg`)}
      onPageSize={(ps) => change((c) => setPageSize(c, ps))}
      onSelect={setSelectedId}
      designSection={
        <>
          <div className="grid gap-1.5">
            <Label htmlFor="design-kind">{t("Type")}</Label>
            <OptionSelect id="design-kind" value={kind} onChange={(v) => setKind(v as DesignKind)} options={DESIGN_KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] }))} placeholder={t("Type")} />
          </div>
          <ConfirmActionButton
            variant="ghost"
            title={t("Delete this design?")}
            description={t("The design, its uploaded files and its share link are deleted permanently.")}
            confirmLabel={t("Delete design")}
            successMessage={t("Design deleted.")}
            destructive
            action={() => deleteDesignAction({ designId: design.id })}
          >
            <Trash2Icon aria-hidden /> {t("Delete design")}
          </ConfirmActionButton>
        </>
      }
    />
  )

  const pageList = (
    <ol className="flex gap-3 lg:flex-col" aria-label={t("Pages")}>
      {content.pages.map((p, i) => (
        <li
          key={p.id}
          draggable
          onDragStart={(e) => {
            setDragPage(i)
            e.dataTransfer.effectAllowed = "move"
          }}
          onDragOver={(e) => {
            if (dragPage !== null) e.preventDefault()
          }}
          onDrop={(e) => {
            e.preventDefault()
            if (dragPage !== null && dragPage !== i) change((c) => movePage(c, dragPage, i))
            setDragPage(null)
          }}
          onDragEnd={() => setDragPage(null)}
          className={cn("grid shrink-0 gap-1", dragPage === i && "opacity-50")}
        >
          <button
            type="button"
            onClick={() => {
              setPageId(p.id)
              setSelectedId(null)
            }}
            aria-current={p.id === page.id ? "page" : undefined}
            aria-label={t("Page {value}", { value: i + 1 })}
            className={cn("overflow-hidden rounded border-2 bg-white", p.id === page.id ? "border-primary" : "hover:border-muted-foreground/40 border-border")}
          >
            <PageThumbnail page={p} pageSize={content.pageSize} assets={assetUrls} width={120} />
          </button>
          <div className="flex items-center justify-between gap-1">
            <span className="text-muted-foreground text-xs tabular-nums">{i + 1}</span>
            {p.id === page.id && (
              <span className="flex">
                <IconButton label={t("Move page up")} disabled={i === 0} onClick={() => change((c) => movePage(c, i, i - 1))} icon={<ChevronUpIcon />} />
                <IconButton label={t("Move page down")} disabled={i === content.pages.length - 1} onClick={() => change((c) => movePage(c, i, i + 1))} icon={<ChevronDownIcon />} />
                <IconButton
                  label={t("Duplicate page")}
                  onClick={() => {
                    const [next, copy] = duplicatePageAfter(content, p.id)
                    apply(next)
                    setPageId(copy)
                  }}
                  icon={<CopyIcon />}
                />
                <IconButton
                  label={t("Delete page")}
                  disabled={content.pages.length <= 1}
                  onClick={() => {
                    const neighbour = content.pages[i + 1] ?? content.pages[i - 1]
                    change((c) => removePage(c, p.id))
                    setPageId(neighbour.id)
                    setSelectedId(null)
                  }}
                  icon={<Trash2Icon />}
                />
              </span>
            )}
          </div>
        </li>
      ))}
      <li className="shrink-0">
        <Button
          variant="outline"
          className="h-full min-h-16 w-[120px]"
          onClick={() => {
            const [next, newPageId] = addPage(content, page.id)
            apply(next)
            setPageId(newPageId)
            setSelectedId(null)
          }}
        >
          <PlusIcon aria-hidden /> {t("Page")}
        </Button>
      </li>
    </ol>
  )

  const problem = useMemo(() => describeProblem(content), [content])

  return (
    <div className="bg-background -m-4 flex min-h-[calc(100dvh-3.5rem)] flex-col md:-m-6 lg:h-[calc(100dvh-3.5rem)]">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="icon" asChild>
          <Link href={routes.designs} aria-label={t("Back to designs")}>
            <ArrowLeftIcon />
          </Link>
        </Button>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} aria-label={t("Design title")} className="h-8 w-44 font-medium sm:w-64" />
        <SaveIndicator status={status} onRetry={() => void save()} />
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <IconButton label={t("Undo (Ctrl+Z)")} disabled={history.past.length === 0} onClick={() => setHistory(undo)} icon={<Undo2Icon />} />
          <IconButton label={t("Redo (Ctrl+Y)")} disabled={history.future.length === 0} onClick={() => setHistory(redo)} icon={<Redo2Icon />} />
          <div className="hidden w-24 sm:block">
            <OptionSelect ariaLabel={t("Zoom level")} id="zoom" value={zoom} onChange={setZoom} options={ZOOMS} placeholder={t("Zoom level")} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setPresenting(true)}>
            <PlayIcon aria-hidden /> {t("Preview")}
          </Button>
          <ShareDialog designId={design.id} initialToken={design.share_token} />
          <ExportDialog
            content={content}
            assets={assetUrls}
            title={title}
            pageIndex={pageIndex}
            allowAnswers
            trigger={
              <Button size="sm">
                <DownloadIcon aria-hidden /> {t("Export")}
              </Button>
            }
          />
        </div>
      </div>

      {status.state === "conflict" && (
        <div role="alert" className="bg-destructive/10 text-destructive flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
          <AlertTriangleIcon className="size-4" aria-hidden /> {t(status.message)}
          <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
            {t("Reload")}
          </Button>
        </div>
      )}

      {/* Tools: a column on large screens, a scrolling row on small ones. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <nav aria-label={t("Tools")} className="flex shrink-0 gap-1 overflow-x-auto border-b p-2 lg:w-20 lg:flex-col lg:overflow-y-auto lg:border-r lg:border-b-0">
          {TOOLS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" onClick={() => add(id)} className="hover:bg-muted flex min-w-16 flex-col items-center gap-1 rounded-md px-2 py-2 text-xs">
              <Icon className="size-5" aria-hidden />
              {t(label)}
            </button>
          ))}
        </nav>

        <div className="hidden w-40 shrink-0 overflow-y-auto border-r p-3 lg:block">{pageList}</div>

        <div className="flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0">
          <div
            ref={viewportRef}
            className="bg-muted relative min-h-0 flex-1 overflow-auto"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) setSelectedId(null)
            }}
          >
            <div className="flex min-h-full min-w-fit items-center justify-center p-6">
              {scale > 0 && (
                <EditorCanvas
                  page={page}
                  pageSize={content.pageSize}
                  assets={assetUrls}
                  scale={scale}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onGestureStart={() => {
                    gestureStart.current = content
                  }}
                  onGestureChange={(id, box: Box) => setHistory((h) => preview(h, updateElement(h.present, page.id, id, box)))}
                  onGestureEnd={() => {
                    const start = gestureStart.current
                    gestureStart.current = null
                    if (start) setHistory((h) => endGesture(h, start))
                  }}
                  onTextCommit={(id, text) => change((c) => updateElement(c, page.id, id, { text }))}
                />
              )}
            </div>
          </div>
          {problem && status.state !== "conflict" && (
            <button
              type="button"
              className="bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100 flex items-center gap-2 border-t px-3 py-1.5 text-left text-xs"
              onClick={() => {
                if (problem.pageId) setPageId(problem.pageId)
                if (problem.elementId) setSelectedId(problem.elementId)
              }}
            >
              <AlertTriangleIcon className="size-3.5 shrink-0" aria-hidden /> {t("Not saved until fixed — {message}", { message: problem.message })}
            </button>
          )}
          {/* Small screens: pages under the canvas, properties in a sheet. */}
          <div className="flex items-start gap-2 overflow-x-auto border-t p-2 lg:hidden">{pageList}</div>
          <div className="border-t p-2 lg:hidden">
            <Button variant="outline" className="w-full" onClick={() => setPanelOpen(true)}>
              <SlidersHorizontalIcon aria-hidden /> {selected ? t("Edit {elementLabel}", { elementLabel: elementLabel(selected) }) : t("Page and design settings")}
            </Button>
          </div>
        </div>

        <aside aria-label={t("Properties")} className="hidden w-80 shrink-0 overflow-y-auto border-l p-4 lg:block">
          {panel}
        </aside>
      </div>

      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-4 lg:hidden">
          <SheetHeader className="p-0">
            <SheetTitle>{selected ? elementLabel(selected) : t("Page and design")}</SheetTitle>
            <SheetDescription className="sr-only">{t("Settings for the selected item")}</SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>

      <MediaPicker
        designId={design.id}
        media={picker?.media ?? null}
        assets={assets}
        onAssetsChange={setAssets}
        onChoose={(assetId) => picker && placeMedia(picker.media, assetId)}
        onChooseLink={(url) => placeMedia("video", null, url)}
        onClose={() => setPicker(null)}
      />

      {presenting && (
        <div className="fixed inset-0 z-50 flex flex-col" role="dialog" aria-modal="true" aria-label={t("Preview of {title}", { title })}>
          <Presenter content={content} assets={assetUrls} title={t("Preview · {title}", { title })} onClose={() => setPresenting(false)} className="flex-1" />
        </div>
      )}
    </div>
  )
}

function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  const t = useT()
  const base = "flex items-center gap-1 text-xs"
  switch (status.state) {
    case "saved":
      return (
        <span className={cn(base, "text-muted-foreground")} role="status">
          <CheckIcon className="size-3.5" aria-hidden /> {t("Saved")}
        </span>
      )
    case "dirty":
      return (
        <span className={cn(base, "text-muted-foreground")} role="status">
          <CloudIcon className="size-3.5" aria-hidden /> {t("Unsaved changes")}
        </span>
      )
    case "saving":
      return (
        <span className={cn(base, "text-muted-foreground")} role="status">
          <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> {t("Saving…")}
        </span>
      )
    case "invalid":
      return (
        <span className={cn(base, "text-amber-700 dark:text-amber-300")} role="status" title={t(status.message)}>
          <AlertTriangleIcon className="size-3.5" aria-hidden /> {t("Not saved")}
        </span>
      )
    case "error":
      return (
        <span className={cn(base, "text-destructive")} role="alert">
          <AlertTriangleIcon className="size-3.5" aria-hidden /> {t(status.message)}
          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={onRetry}>
            {t("Retry")}
          </Button>
        </span>
      )
    case "conflict":
      return (
        <span className={cn(base, "text-destructive")} role="status">
          <AlertTriangleIcon className="size-3.5" aria-hidden /> {t("Not saved")}
        </span>
      )
  }
}

function IconButton({ label, icon, onClick, disabled }: { label: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  const t = useT()
  return (
    <Button type="button" variant="ghost" size="icon" className="size-8" aria-label={t(label)} title={t(label)} onClick={onClick} disabled={disabled}>
      {icon}
    </Button>
  )
}
