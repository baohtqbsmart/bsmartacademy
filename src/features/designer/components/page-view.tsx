import { FilmIcon, ImageIcon, PlayIcon, Volume2Icon } from "lucide-react"
import { createElement } from "react"

import { designIcon } from "@/features/designer/icons"
import { FONTS, PAGE_SIZES, type DesignElement, type DesignPage, type ElementOf, type PageSizeId } from "@/features/designer/model"

/**
 * Draws a page at its real size (page pixels). Callers scale it with CSS.
 * No hooks: thumbnails render it on the server; the editor, presenter and
 * exporter render it in the browser, where `interactive` replaces the parts
 * that react to clicks (questions, buttons, media).
 *
 * mode:
 *   edit    — every element, hidden ones faded with a dashed outline
 *   present — hidden elements appear once revealed
 *   export  — static; hidden elements only when answers are included
 */
export type PageViewMode = "edit" | "present" | "export"

export type AssetUrls = Record<string, { url: string | null; mimeType: string } | undefined>

type PageViewProps = {
  page: DesignPage
  pageSize: PageSizeId
  assets: AssetUrls
  mode: PageViewMode
  revealed?: boolean
  /** Export: show hidden elements and mark correct answers. */
  showAnswers?: boolean
  /** Browser only: the live version of an element (or undefined for the static one). */
  interactive?: (el: DesignElement) => React.ReactNode | undefined
  /** Editor only: wraps each element (selection, dragging). */
  wrap?: (el: DesignElement, child: React.ReactNode) => React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function PageView({ page, pageSize, assets, mode, revealed = false, showAnswers = false, interactive, wrap, children, className }: PageViewProps) {
  const size = PAGE_SIZES[pageSize]
  return (
    <div
      className={className}
      data-design-page={page.id}
      style={{
        position: "relative",
        width: size.width,
        height: size.height,
        background: page.background,
        overflow: "hidden",
        fontFamily: FONTS.sans.css,
        color: "#1f2937",
      }}
    >
      {page.elements.map((el) => {
        if (el.hidden && ((mode === "present" && !revealed) || (mode === "export" && !showAnswers))) return null
        const body = interactive?.(el) ?? <ElementBody el={el} assets={assets} showAnswers={showAnswers} />
        const box: React.CSSProperties = {
          position: "absolute",
          left: el.x,
          top: el.y,
          width: el.w,
          height: el.h,
          opacity: mode === "edit" && el.hidden ? 0.55 : 1,
          outline: mode === "edit" && el.hidden ? "2px dashed #94a3b8" : undefined,
        }
        return wrap ? (
          <div key={el.id} style={box}>
            {wrap(el, body)}
          </div>
        ) : (
          <div key={el.id} style={box}>
            {body}
          </div>
        )
      })}
      {children}
    </div>
  )
}

const fill = (value: string) => (value === "transparent" ? "transparent" : value)

export function ElementBody({ el, assets, showAnswers = false }: { el: DesignElement; assets: AssetUrls; showAnswers?: boolean }) {
  switch (el.type) {
    case "text":
      return <TextBody el={el} />
    case "image": {
      const url = assets[el.assetId]?.url
      return url ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs, sized by the design
        <img src={url} alt={el.alt} draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, borderRadius: el.radius, display: "block" }} />
      ) : (
        <Placeholder icon={<ImageIcon style={{ width: "30%", height: "30%" }} />} label="Picture unavailable" radius={el.radius} />
      )
    }
    case "shape":
      return <ShapeBody el={el} />
    case "table":
      return <TableBody el={el} />
    case "icon":
      // Icons come from a fixed module-level map (features/designer/icons).
      return createElement(designIcon(el.icon), { "aria-hidden": true, style: { width: "100%", height: "100%", color: el.color }, strokeWidth: 1.75 })
    case "audio":
      return <MediaCard icon={<Volume2Icon style={{ width: 28, height: 28 }} />} label={el.label || "Audio"} />
    case "video":
      return (
        <div style={{ width: "100%", height: "100%", background: "#0f172a", color: "#f8fafc", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          {el.url ? <PlayIcon style={{ width: 56, height: 56 }} /> : <FilmIcon style={{ width: 56, height: 56 }} />}
          <span style={{ fontSize: 20 }}>{el.label || "Video"}</span>
        </div>
      )
    case "question":
      return <QuestionBody el={el} showAnswers={showAnswers} />
    case "button":
      return <ButtonBody el={el} />
  }
}

export function TextBody({ el }: { el: ElementOf<"text"> }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        whiteSpace: "pre-wrap",
        overflowWrap: "anywhere",
        overflow: "hidden",
        fontSize: el.fontSize,
        lineHeight: 1.25,
        fontFamily: FONTS[el.fontFamily].css,
        fontWeight: el.bold ? 700 : 400,
        fontStyle: el.italic ? "italic" : "normal",
        textDecoration: el.underline ? "underline" : "none",
        textAlign: el.align,
        color: el.color,
        background: fill(el.fill),
      }}
    >
      {el.text}
    </div>
  )
}

function ShapeBody({ el }: { el: ElementOf<"shape"> }) {
  const sw = el.strokeWidth
  const stroke = el.stroke === "transparent" ? "none" : el.stroke
  const common = { fill: el.fill === "transparent" ? "none" : el.fill, stroke, strokeWidth: sw }
  const { w, h } = el
  let shape: React.ReactNode
  switch (el.shape) {
    case "rect":
      shape = <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={Math.min(el.radius, w / 2, h / 2)} {...common} />
      break
    case "ellipse":
      shape = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, w / 2 - sw / 2)} ry={Math.max(0, h / 2 - sw / 2)} {...common} />
      break
    case "triangle":
      shape = <polygon points={`${w / 2},${sw} ${w - sw},${h - sw / 2} ${sw},${h - sw / 2}`} strokeLinejoin="round" {...common} />
      break
    case "line": {
      // A line runs along the longer side of its box.
      const horizontal = w >= h
      const thickness = Math.max(sw, 1)
      shape = horizontal ? (
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke={stroke === "none" ? el.fill : stroke} strokeWidth={thickness} strokeLinecap="round" />
      ) : (
        <line x1={w / 2} y1={0} x2={w / 2} y2={h} stroke={stroke === "none" ? el.fill : stroke} strokeWidth={thickness} strokeLinecap="round" />
      )
      break
    }
    case "arrow": {
      const head = Math.min(w * 0.35, h)
      const shaft = h * 0.35
      shape = (
        <polygon
          points={`0,${h / 2 - shaft / 2} ${w - head},${h / 2 - shaft / 2} ${w - head},0 ${w},${h / 2} ${w - head},${h} ${w - head},${h / 2 + shaft / 2} 0,${h / 2 + shaft / 2}`}
          strokeLinejoin="round"
          {...common}
        />
      )
      break
    }
  }
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }} aria-hidden>
      {shape}
    </svg>
  )
}

function TableBody({ el }: { el: ElementOf<"table"> }) {
  return (
    <table style={{ width: "100%", height: "100%", borderCollapse: "collapse", tableLayout: "fixed", fontSize: el.fontSize, color: el.color, background: "#ffffff" }}>
      <tbody>
        {el.rows.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => {
              const head = el.header && r === 0
              const style: React.CSSProperties = {
                border: `1.5px solid ${el.borderColor}`,
                padding: "4px 8px",
                verticalAlign: "middle",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontWeight: head ? 700 : 400,
                background: head ? fill(el.headerFill) : undefined,
              }
              return head ? (
                <th key={c} style={{ ...style, textAlign: "left" }}>
                  {cell}
                </th>
              ) : (
                <td key={c} style={style}>
                  {cell}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const LETTERS = "ABCDEFGH"

export function QuestionBody({ el, showAnswers = false }: { el: ElementOf<"question">; showAnswers?: boolean }) {
  return (
    <div style={{ width: "100%", height: "100%", overflow: "hidden", background: fill(el.fill), color: el.color, fontSize: el.fontSize, padding: 16, borderRadius: 12, border: "1.5px solid #cbd5e1", boxSizing: "border-box" }}>
      <div style={{ fontWeight: 700, marginBottom: 10, whiteSpace: "pre-wrap" }}>{el.prompt}</div>
      {el.questionType === "short_answer" ? (
        <div style={{ borderBottom: "2px solid #94a3b8", minHeight: el.fontSize * 1.6, paddingTop: 4 }}>
          {showAnswers ? <span style={{ color: "#15803d" }}>{el.answers.filter((a) => a.trim()).join(" / ")}</span> : null}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {el.options.map((option, i) => {
            const correct = showAnswers && el.correct.includes(i)
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    width: el.fontSize * 1.2,
                    height: el.fontSize * 1.2,
                    borderRadius: 999,
                    border: `2px solid ${correct ? "#15803d" : "#94a3b8"}`,
                    background: correct ? "#dcfce7" : "transparent",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: el.fontSize * 0.7,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {el.questionType === "true_false" ? "" : LETTERS[i]}
                </span>
                <span style={{ fontWeight: correct ? 700 : 400 }}>{option}</span>
              </div>
            )
          })}
        </div>
      )}
      {showAnswers && el.explanation && <div style={{ marginTop: 10, fontSize: el.fontSize * 0.8, color: "#475569", fontStyle: "italic" }}>{el.explanation}</div>}
    </div>
  )
}

export function ButtonBody({ el }: { el: ElementOf<"button"> }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: el.fill,
        color: el.color,
        fontSize: el.fontSize,
        fontWeight: 700,
        borderRadius: 999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 12px",
        boxShadow: "0 2px 0 rgba(0,0,0,0.15)",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      {el.label}
    </div>
  )
}

export function MediaCard({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", borderRadius: 999, background: "#e0f2fe", color: "#0c4a6e", fontSize: 22, fontWeight: 600, overflow: "hidden", boxSizing: "border-box" }}>
      {icon}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
    </div>
  )
}

function Placeholder({ icon, label, radius }: { icon: React.ReactNode; label: string; radius: number }) {
  return (
    <div style={{ width: "100%", height: "100%", background: "#f1f5f9", color: "#94a3b8", borderRadius: radius, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 16 }}>
      {icon}
      {label}
    </div>
  )
}

/** A page scaled down to a fixed width (lists, template gallery, page strip). */
export function PageThumbnail({ page, pageSize, assets, width }: { page: DesignPage; pageSize: PageSizeId; assets: AssetUrls; width: number }) {
  const size = PAGE_SIZES[pageSize]
  const scale = width / size.width
  return (
    <div aria-hidden style={{ width, height: size.height * scale, overflow: "hidden", position: "relative", pointerEvents: "none" }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
        <PageView page={page} pageSize={pageSize} assets={assets} mode="export" />
      </div>
    </div>
  )
}
