"use client"

import { useRef, useState } from "react"

import { PageView, type AssetUrls } from "@/features/designer/components/page-view"
import { HANDLES, resizeBox, snapBox, type Box, type Guide, type Handle } from "@/features/designer/editor-state"
import { FONTS, PAGE_SIZES, type DesignElement, type DesignPage, type ElementOf, type PageSizeId } from "@/features/designer/model"
import { useT } from "@/i18n/client"

type Drag =
  | { kind: "move"; id: string; px: number; py: number; box: Box; moved: boolean }
  | { kind: "resize"; id: string; handle: Handle; px: number; py: number; box: Box; moved: boolean }

const HANDLE_PX = 12
const SNAP_PX = 6
const DRAG_START_PX = 3

const CURSORS: Record<Handle, string> = { n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize", ne: "nesw-resize", sw: "nesw-resize", nw: "nwse-resize", se: "nwse-resize" }

/**
 * The editable page. Coordinates are page pixels; `scale` maps them to the
 * screen. Dragging and resizing report live boxes (onGestureChange) between
 * onGestureStart and onGestureEnd, so a whole drag is a single undo step.
 */
export function EditorCanvas({
  page,
  pageSize,
  assets,
  scale,
  selectedId,
  onSelect,
  onGestureStart,
  onGestureChange,
  onGestureEnd,
  onTextCommit,
}: {
  page: DesignPage
  pageSize: PageSizeId
  assets: AssetUrls
  scale: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onGestureStart: () => void
  onGestureChange: (id: string, box: Box) => void
  onGestureEnd: () => void
  onTextCommit: (id: string, text: string) => void
}) {
  const t = useT()
  const size = PAGE_SIZES[pageSize]
  const drag = useRef<Drag | null>(null)
  const [guides, setGuides] = useState<Guide[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const selected = page.elements.find((el) => el.id === selectedId) ?? null

  function begin(e: React.PointerEvent, d: Drag) {
    if (e.button !== 0) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = d
  }

  function move(e: React.PointerEvent) {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.px) / scale
    const dy = (e.clientY - d.py) / scale
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.px, e.clientY - d.py) < DRAG_START_PX) return
      d.moved = true
      onGestureStart()
    }
    if (d.kind === "move") {
      const raw = { ...d.box, x: Math.round(d.box.x + dx), y: Math.round(d.box.y + dy) }
      if (e.altKey) {
        setGuides([])
        onGestureChange(d.id, raw)
      } else {
        const others = page.elements.filter((el) => el.id !== d.id)
        const snapped = snapBox(raw, size, others, SNAP_PX / scale)
        setGuides(snapped.guides)
        onGestureChange(d.id, snapped.box)
      }
    } else {
      onGestureChange(d.id, resizeBox(d.box, d.handle, dx, dy, e.shiftKey))
    }
  }

  function end() {
    const d = drag.current
    drag.current = null
    setGuides([])
    if (d?.moved) onGestureEnd()
  }

  const wrap = (el: DesignElement, body: React.ReactNode) => {
    const editing = editingId === el.id && el.type === "text"
    return (
      <div
        role="button"
        tabIndex={-1}
        aria-label={t("{type} element", { type: el.type })}
        aria-pressed={el.id === selectedId}
        style={{ width: "100%", height: "100%", cursor: editing ? "text" : "move", touchAction: "none", userSelect: "none" }}
        onPointerDown={(e) => {
          onSelect(el.id)
          if (!editing) begin(e, { kind: "move", id: el.id, px: e.clientX, py: e.clientY, box: { x: el.x, y: el.y, w: el.w, h: el.h }, moved: false })
          else e.stopPropagation()
        }}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onDoubleClick={() => el.type === "text" && setEditingId(el.id)}
      >
        {editing ? <InlineText el={el as ElementOf<"text">} onDone={(text) => { setEditingId(null); if (text !== null) onTextCommit(el.id, text) }} /> : body}
      </div>
    )
  }

  return (
    <div
      style={{ position: "relative", width: size.width * scale, height: size.height * scale }}
      className="shadow-md"
      onPointerDown={() => {
        setEditingId(null)
        onSelect(null)
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", inset: 0 }}>
        <PageView page={page} pageSize={pageSize} assets={assets} mode="edit" wrap={wrap} />
      </div>

      {guides.map((g, i) => (
        <div
          key={i}
          aria-hidden
          className="pointer-events-none absolute bg-fuchsia-500"
          style={g.axis === "x" ? { left: g.at * scale, top: 0, width: 1, height: size.height * scale } : { top: g.at * scale, left: 0, height: 1, width: size.width * scale }}
        />
      ))}

      {selected && editingId !== selected.id && (
        <div
          aria-hidden
          className="border-primary pointer-events-none absolute border-2"
          style={{ left: selected.x * scale - 1, top: selected.y * scale - 1, width: selected.w * scale + 2, height: selected.h * scale + 2 }}
        >
          {HANDLES.map((handle) => (
            <div
              key={handle}
              className="bg-background border-primary pointer-events-auto absolute rounded-sm border-2"
              style={{
                width: HANDLE_PX,
                height: HANDLE_PX,
                cursor: CURSORS[handle],
                touchAction: "none",
                left: handle.includes("w") ? -HANDLE_PX / 2 : handle.includes("e") ? `calc(100% - ${HANDLE_PX / 2}px)` : `calc(50% - ${HANDLE_PX / 2}px)`,
                top: handle.includes("n") ? -HANDLE_PX / 2 : handle.includes("s") ? `calc(100% - ${HANDLE_PX / 2}px)` : `calc(50% - ${HANDLE_PX / 2}px)`,
              }}
              onPointerDown={(e) => begin(e, { kind: "resize", id: selected.id, handle, px: e.clientX, py: e.clientY, box: { x: selected.x, y: selected.y, w: selected.w, h: selected.h }, moved: false })}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function InlineText({ el, onDone }: { el: ElementOf<"text">; onDone: (text: string | null) => void }) {
  const t = useT()
  const [value, setValue] = useState(el.text)
  // Escape unmounts the textarea, which also fires blur: finish only once.
  const finished = useRef(false)
  const finish = (text: string | null) => {
    if (finished.current) return
    finished.current = true
    onDone(text)
  }
  return (
    <textarea
      // Focus once, when the editor opens.
      ref={(node) => {
        if (node && document.activeElement !== node && !node.dataset.focused) {
          node.dataset.focused = "1"
          node.focus()
          node.select()
        }
      }}
      aria-label={t("Edit text")}
      value={value}
      maxLength={5000}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === "Escape") finish(null)
      }}
      style={{
        width: "100%",
        height: "100%",
        resize: "none",
        border: "none",
        outline: "2px solid #2563eb",
        padding: 0,
        margin: 0,
        overflow: "hidden",
        fontSize: el.fontSize,
        lineHeight: 1.25,
        fontFamily: FONTS[el.fontFamily].css,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textDecoration: el.underline ? "underline" : "none",
        textAlign: el.align,
        color: el.color,
        background: el.fill === "transparent" ? "rgba(255,255,255,0.85)" : el.fill,
      }}
    />
  )
}
