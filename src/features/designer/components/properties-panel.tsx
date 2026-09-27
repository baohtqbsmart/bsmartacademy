"use client"

import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownToLineIcon,
  ArrowUpToLineIcon,
  BoldIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  ItalicIcon,
  MinusIcon,
  PlusIcon,
  RefreshCwIcon,
  Trash2Icon,
  UnderlineIcon,
} from "lucide-react"

import { OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { LayerMove } from "@/features/designer/editor-state"
import { DESIGN_ICONS } from "@/features/designer/icons"
import {
  BUTTON_ACTION_LABELS,
  BUTTON_ACTIONS,
  FONTS,
  LIMITS,
  PAGE_SIZE_IDS,
  PAGE_SIZES,
  QUESTION_TYPE_LABELS,
  QUESTION_TYPES,
  questionProblem,
  SHAPES,
  type DesignElement,
  type DesignPage,
  type ElementOf,
  type FontId,
  type PageSizeId,
} from "@/features/designer/model"
import type { Media } from "@/features/designer/uploads"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

type Patch = (patch: Partial<DesignElement>, mergeKey?: string) => void

const TYPE_LABELS: Record<DesignElement["type"], string> = {
  text: "Text",
  image: "Image",
  shape: "Shape",
  table: "Table",
  icon: "Icon",
  audio: "Audio",
  video: "Video",
  question: "Question",
  button: "Button",
}

export function elementLabel(el: DesignElement) {
  const detail =
    el.type === "text" ? el.text : el.type === "question" ? el.prompt : el.type === "button" ? el.label : el.type === "audio" || el.type === "video" ? el.label : el.type === "icon" ? el.icon : el.type === "shape" ? el.shape : ""
  return detail ? `${TYPE_LABELS[el.type]}: ${detail.slice(0, 40)}` : TYPE_LABELS[el.type]
}

export function PropertiesPanel({
  element,
  page,
  pages,
  pageSize,
  onPatch,
  onAction,
  onPickMedia,
  onBackground,
  onPageSize,
  onSelect,
  designSection,
}: {
  element: DesignElement | null
  page: DesignPage
  pages: DesignPage[]
  pageSize: PageSizeId
  onPatch: Patch
  onAction: (action: "duplicate" | "delete" | LayerMove) => void
  onPickMedia: (media: Media) => void
  onBackground: (color: string) => void
  onPageSize: (size: PageSizeId) => void
  onSelect: (id: string) => void
  /** Shown when nothing is selected (title, kind, delete). */
  designSection?: React.ReactNode
}) {
  const t = useT()
  if (!element) {
    return (
      <div className="grid gap-5">
        {designSection && <Section title={t("Design")}>{designSection}</Section>}
        <Section title={t("Page")}>
          <ColorField id="page-bg" label={t("Background")} value={page.background} onChange={onBackground} />
          <div className="grid gap-1.5">
            <Label htmlFor="page-size">{t("Page size (all pages)")}</Label>
            <OptionSelect id="page-size" value={pageSize} onChange={(v) => onPageSize(v as PageSizeId)} options={PAGE_SIZE_IDS.map((id) => ({ id, label: PAGE_SIZES[id].label }))} placeholder={t("Page size")} />
          </div>
        </Section>
        <Layers page={page} selectedId={null} onSelect={onSelect} />
        <p className="text-muted-foreground text-xs">
          {t("Select an item to change it. Drag to move, pull the handles to resize (Shift keeps the shape), hold Alt to move without snapping. Shortcuts: Ctrl+Z / Ctrl+Y undo and redo, Ctrl+D duplicate, Delete removes, arrow keys nudge.")}
        </p>
      </div>
    )
  }

  const el = element
  const num = (key: "x" | "y" | "w" | "h", label: string) => (
    <NumberField id={`el-${key}`} label={t(label)} value={el[key]} min={key === "w" || key === "h" ? 1 : -LIMITS.coordinate} max={LIMITS.coordinate} onChange={(v) => onPatch({ [key]: v }, `${el.id}-${key}`)} />
  )

  return (
    <div className="grid gap-5">
      <Section title={t(TYPE_LABELS[el.type])}>
        {el.type === "text" && <TextProps el={el} onPatch={onPatch} />}
        {el.type === "image" && (
          <>
            <Button variant="outline" size="sm" onClick={() => onPickMedia("image")}>
              <RefreshCwIcon aria-hidden /> {t("Replace picture")}
            </Button>
            <Choice label={t("Fit")} value={el.fit} options={[["cover", "Fill the box"], ["contain", "Show whole picture"]]} onChange={(fit) => onPatch({ fit } as Partial<DesignElement>)} />
            <NumberField id="el-radius" label={t("Corner radius")} value={el.radius} min={0} max={1000} onChange={(radius) => onPatch({ radius } as Partial<DesignElement>, `${el.id}-radius`)} />
            <TextField id="el-alt" label={t("Description (for screen readers)")} value={el.alt} max={300} onChange={(alt) => onPatch({ alt } as Partial<DesignElement>, `${el.id}-alt`)} />
          </>
        )}
        {el.type === "shape" && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="el-shape">{t("Shape")}</Label>
              <OptionSelect id="el-shape" value={el.shape} onChange={(shape) => onPatch({ shape } as Partial<DesignElement>)} options={SHAPES.map((s) => ({ id: s, label: s[0].toUpperCase() + s.slice(1) }))} placeholder={t("Shape")} />
            </div>
            <ColorField id="el-fill" label={t("Fill")} value={el.fill} allowNone onChange={(fill) => onPatch({ fill } as Partial<DesignElement>, `${el.id}-fill`)} />
            <ColorField id="el-stroke" label={t("Outline")} value={el.stroke} allowNone onChange={(stroke) => onPatch({ stroke } as Partial<DesignElement>, `${el.id}-stroke`)} />
            <NumberField id="el-sw" label={t("Outline width")} value={el.strokeWidth} min={0} max={40} onChange={(strokeWidth) => onPatch({ strokeWidth } as Partial<DesignElement>, `${el.id}-sw`)} />
            {el.shape === "rect" && <NumberField id="el-radius" label={t("Corner radius")} value={el.radius} min={0} max={1000} onChange={(radius) => onPatch({ radius } as Partial<DesignElement>, `${el.id}-radius`)} />}
          </>
        )}
        {el.type === "table" && <TableProps el={el} onPatch={onPatch} />}
        {el.type === "icon" && (
          <>
            <IconPicker value={el.icon} onChange={(icon) => onPatch({ icon } as Partial<DesignElement>)} />
            <ColorField id="el-color" label={t("Colour")} value={el.color} onChange={(color) => onPatch({ color } as Partial<DesignElement>, `${el.id}-color`)} />
          </>
        )}
        {el.type === "audio" && (
          <>
            <TextField id="el-label" label={t("Label")} value={el.label} max={200} onChange={(label) => onPatch({ label } as Partial<DesignElement>, `${el.id}-label`)} />
            <Button variant="outline" size="sm" onClick={() => onPickMedia("audio")}>
              <RefreshCwIcon aria-hidden /> {t("Replace audio")}
            </Button>
          </>
        )}
        {el.type === "video" && (
          <>
            <TextField id="el-label" label={t("Label")} value={el.label} max={200} onChange={(label) => onPatch({ label } as Partial<DesignElement>, `${el.id}-label`)} />
            {el.url !== null ? (
              <TextField
                id="el-url"
                label={t("Video link (YouTube or Vimeo play inside the page)")}
                value={el.url}
                max={1000}
                onChange={(url) => onPatch({ url: url.trim() } as Partial<DesignElement>, `${el.id}-url`)}
              />
            ) : (
              <p className="text-muted-foreground text-xs">{t("Uploaded video.")}</p>
            )}
            <Button variant="outline" size="sm" onClick={() => onPickMedia("video")}>
              <RefreshCwIcon aria-hidden /> {t("Replace with an upload")}
            </Button>
          </>
        )}
        {el.type === "question" && <QuestionProps el={el} onPatch={onPatch} />}
        {el.type === "button" && <ButtonProps el={el} pages={pages} onPatch={onPatch} />}
      </Section>

      <Section title={t("Position and size")}>
        <div className="grid grid-cols-2 gap-2">
          {num("x", "X")}
          {num("y", "Y")}
          {num("w", "Width")}
          {num("h", "Height")}
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={Boolean(el.hidden)} onCheckedChange={(v) => onPatch({ hidden: v === true ? true : undefined })} className="mt-0.5" />
          <span>
            {t("Hidden until revealed")}
            <span className="text-muted-foreground block text-xs">{t("For answers or the back of a flashcard. Add a button that reveals, or use Reveal when presenting.")}</span>
          </span>
        </label>
      </Section>

      <Section title={t("Arrange")}>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => onAction("forward")}>
            <ChevronUpIcon aria-hidden /> {t("Forward")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAction("backward")}>
            <ChevronDownIcon aria-hidden /> {t("Backward")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAction("front")}>
            <ArrowUpToLineIcon aria-hidden /> {t("To front")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAction("back")}>
            <ArrowDownToLineIcon aria-hidden /> {t("To back")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAction("duplicate")}>
            <CopyIcon aria-hidden /> {t("Duplicate")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => onAction("delete")} className="text-destructive">
            <Trash2Icon aria-hidden /> {t("Delete")}
          </Button>
        </div>
      </Section>

      <Layers page={page} selectedId={el.id} onSelect={onSelect} />
    </div>
  )
}

function Layers({ page, selectedId, onSelect }: { page: DesignPage; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT()
  return (
    <Section title={t("Layers ({length})", { length: page.elements.length })}>
      {page.elements.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t("This page is empty. Add something from the tools.")}</p>
      ) : (
        <ul className="grid max-h-56 gap-0.5 overflow-y-auto">
          {[...page.elements].reverse().map((el) => (
            <li key={el.id}>
              <button
                type="button"
                onClick={() => onSelect(el.id)}
                aria-current={el.id === selectedId ? "true" : undefined}
                className="hover:bg-muted aria-[current=true]:bg-muted w-full truncate rounded px-2 py-1 text-left text-xs"
              >
                {t(elementLabel(el))}
                {el.hidden && <span className="text-muted-foreground"> {t("· hidden")}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function TextProps({ el, onPatch }: { el: ElementOf<"text">; onPatch: Patch }) {
  const t = useT()
  const toggle = (key: "bold" | "italic" | "underline") => onPatch({ [key]: !el[key] } as Partial<DesignElement>)
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="el-text">{t("Text")}</Label>
        <Textarea id="el-text" rows={4} maxLength={LIMITS.text} value={el.text} onChange={(e) => onPatch({ text: e.target.value } as Partial<DesignElement>, `${el.id}-text`)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="el-font">{t("Font")}</Label>
          <OptionSelect id="el-font" value={el.fontFamily} onChange={(v) => onPatch({ fontFamily: v as FontId } as Partial<DesignElement>)} options={(Object.keys(FONTS) as FontId[]).map((f) => ({ id: f, label: FONTS[f].label }))} placeholder={t("Font")} />
        </div>
        <NumberField id="el-size" label={t("Size")} value={el.fontSize} min={8} max={200} onChange={(fontSize) => onPatch({ fontSize } as Partial<DesignElement>, `${el.id}-size`)} />
      </div>
      <div className="flex flex-wrap gap-1" role="toolbar" aria-label={t("Text style")}>
        <Toggle pressed={el.bold} label={t("Bold")} onClick={() => toggle("bold")} icon={<BoldIcon />} />
        <Toggle pressed={el.italic} label={t("Italic")} onClick={() => toggle("italic")} icon={<ItalicIcon />} />
        <Toggle pressed={el.underline} label={t("Underline")} onClick={() => toggle("underline")} icon={<UnderlineIcon />} />
        <span className="w-2" />
        <Toggle pressed={el.align === "left"} label={t("Align left")} onClick={() => onPatch({ align: "left" } as Partial<DesignElement>)} icon={<AlignLeftIcon />} />
        <Toggle pressed={el.align === "center"} label={t("Centre")} onClick={() => onPatch({ align: "center" } as Partial<DesignElement>)} icon={<AlignCenterIcon />} />
        <Toggle pressed={el.align === "right"} label={t("Align right")} onClick={() => onPatch({ align: "right" } as Partial<DesignElement>)} icon={<AlignRightIcon />} />
      </div>
      <ColorField id="el-color" label={t("Text colour")} value={el.color} onChange={(color) => onPatch({ color } as Partial<DesignElement>, `${el.id}-color`)} />
      <ColorField id="el-fill" label={t("Background")} value={el.fill} allowNone onChange={(fill) => onPatch({ fill } as Partial<DesignElement>, `${el.id}-fill`)} />
    </>
  )
}

function TableProps({ el, onPatch }: { el: ElementOf<"table">; onPatch: Patch }) {
  const t = useT()
  const cols = el.rows[0].length
  const setRows = (rows: string[][], mergeKey?: string) => onPatch({ rows } as Partial<DesignElement>, mergeKey)
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>{t("Rows")}</span>
        <Button variant="outline" size="icon" className="size-7" aria-label={t("Remove row")} disabled={el.rows.length <= 1} onClick={() => setRows(el.rows.slice(0, -1))}>
          <MinusIcon />
        </Button>
        <span className="tabular-nums">{el.rows.length}</span>
        <Button variant="outline" size="icon" className="size-7" aria-label={t("Add row")} disabled={el.rows.length >= LIMITS.tableRows} onClick={() => setRows([...el.rows, Array(cols).fill("")])}>
          <PlusIcon />
        </Button>
        <span className="ml-2">{t("Columns")}</span>
        <Button variant="outline" size="icon" className="size-7" aria-label={t("Remove column")} disabled={cols <= 1} onClick={() => setRows(el.rows.map((r) => r.slice(0, -1)))}>
          <MinusIcon />
        </Button>
        <span className="tabular-nums">{cols}</span>
        <Button variant="outline" size="icon" className="size-7" aria-label={t("Add column")} disabled={cols >= LIMITS.tableCols} onClick={() => setRows(el.rows.map((r) => [...r, ""]))}>
          <PlusIcon />
        </Button>
      </div>
      <div className="grid max-h-64 gap-1 overflow-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(4.5rem, 1fr))` }}>
        {el.rows.map((row, r) =>
          row.map((cell, c) => (
            <Input
              key={`${r}-${c}`}
              className="h-8 text-xs"
              value={cell}
              maxLength={LIMITS.cell}
              aria-label={t("Row {value}, column {value2}", { value: r + 1, value2: c + 1 })}
              onChange={(e) => setRows(el.rows.map((rr, i) => (i === r ? rr.map((cc, j) => (j === c ? e.target.value : cc)) : rr)), `${el.id}-cell-${r}-${c}`)}
            />
          ))
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={el.header} onCheckedChange={(v) => onPatch({ header: v === true } as Partial<DesignElement>)} /> {t("First row is a header")}
      </label>
      <NumberField id="el-size" label={t("Text size")} value={el.fontSize} min={8} max={72} onChange={(fontSize) => onPatch({ fontSize } as Partial<DesignElement>, `${el.id}-size`)} />
      <ColorField id="el-color" label={t("Text colour")} value={el.color} onChange={(color) => onPatch({ color } as Partial<DesignElement>, `${el.id}-color`)} />
      <ColorField id="el-border" label={t("Lines")} value={el.borderColor} onChange={(borderColor) => onPatch({ borderColor } as Partial<DesignElement>, `${el.id}-border`)} />
      <ColorField id="el-head" label={t("Header background")} value={el.headerFill} allowNone onChange={(headerFill) => onPatch({ headerFill } as Partial<DesignElement>, `${el.id}-head`)} />
    </>
  )
}

function QuestionProps({ el, onPatch }: { el: ElementOf<"question">; onPatch: Patch }) {
  const tr = useT()
  const problem = questionProblem(el)
  const setType = (questionType: ElementOf<"question">["questionType"]) => {
    if (questionType === "true_false") onPatch({ questionType, options: ["True", "False"], correct: [0] } as Partial<DesignElement>)
    else if (questionType === "multiple_choice") onPatch({ questionType, options: el.options.length >= 2 && el.questionType === "multiple_choice" ? el.options : ["Option A", "Option B", "Option C"], correct: [0] } as Partial<DesignElement>)
    else onPatch({ questionType, options: [], correct: [], answers: el.answers.length ? el.answers : [""] } as Partial<DesignElement>)
  }
  const toggleCorrect = (i: number) => {
    const correct = el.questionType === "true_false" ? [i] : el.correct.includes(i) ? el.correct.filter((x) => x !== i) : [...el.correct, i].sort()
    onPatch({ correct } as Partial<DesignElement>)
  }
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="el-qtype">{tr("Question type")}</Label>
        <OptionSelect id="el-qtype" value={el.questionType} onChange={(v) => setType(v as ElementOf<"question">["questionType"])} options={QUESTION_TYPES.map((t) => ({ id: t, label: QUESTION_TYPE_LABELS[t] }))} placeholder={tr("Type")} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="el-prompt">{el.questionType === "true_false" ? tr("Statement") : tr("Question")}</Label>
        <Textarea id="el-prompt" rows={3} maxLength={1000} value={el.prompt} onChange={(e) => onPatch({ prompt: e.target.value } as Partial<DesignElement>, `${el.id}-prompt`)} />
      </div>
      {el.questionType !== "short_answer" ? (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">{el.questionType === "true_false" ? tr("The statement is") : tr("Options (tick the correct ones)")}</legend>
          {el.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <Checkbox checked={el.correct.includes(i)} onCheckedChange={() => toggleCorrect(i)} aria-label={tr("Option {value} is correct", { value: i + 1 })} />
              {el.questionType === "true_false" ? (
                <span className="text-sm">{option}</span>
              ) : (
                <>
                  <Input
                    className="h-8"
                    value={option}
                    maxLength={LIMITS.option}
                    aria-label={tr("Option {value}", { value: i + 1 })}
                    onChange={(e) => onPatch({ options: el.options.map((o, j) => (j === i ? e.target.value : o)) } as Partial<DesignElement>, `${el.id}-opt-${i}`)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={tr("Remove option {value}", { value: i + 1 })}
                    disabled={el.options.length <= 2}
                    onClick={() => onPatch({ options: el.options.filter((_, j) => j !== i), correct: el.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) } as Partial<DesignElement>)}
                  >
                    <MinusIcon />
                  </Button>
                </>
              )}
            </div>
          ))}
          {el.questionType === "multiple_choice" && (
            <Button variant="outline" size="sm" disabled={el.options.length >= LIMITS.options} onClick={() => onPatch({ options: [...el.options, `Option ${String.fromCharCode(65 + el.options.length)}`] } as Partial<DesignElement>)}>
              <PlusIcon aria-hidden /> {tr("Add option")}
            </Button>
          )}
        </fieldset>
      ) : (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-medium">{tr("Accepted answers")}</legend>
          {el.answers.map((answer, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input className="h-8" value={answer} maxLength={200} aria-label={tr("Accepted answer {value}", { value: i + 1 })} onChange={(e) => onPatch({ answers: el.answers.map((a, j) => (j === i ? e.target.value : a)) } as Partial<DesignElement>, `${el.id}-ans-${i}`)} />
              <Button variant="ghost" size="icon" className="size-8" aria-label={tr("Remove answer {value}", { value: i + 1 })} disabled={el.answers.length <= 1} onClick={() => onPatch({ answers: el.answers.filter((_, j) => j !== i) } as Partial<DesignElement>)}>
                <MinusIcon />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={el.answers.length >= LIMITS.answers} onClick={() => onPatch({ answers: [...el.answers, ""] } as Partial<DesignElement>)}>
            <PlusIcon aria-hidden /> {tr("Add accepted answer")}
          </Button>
          <p className="text-muted-foreground text-xs">{tr("Capitals, extra spaces and a final full stop are ignored.")}</p>
        </fieldset>
      )}
      {problem && <p className="text-destructive text-sm">{problem}</p>}
      <div className="grid gap-1.5">
        <Label htmlFor="el-expl">{tr("Explanation (shown after checking)")}</Label>
        <Textarea id="el-expl" rows={2} maxLength={1000} value={el.explanation} onChange={(e) => onPatch({ explanation: e.target.value } as Partial<DesignElement>, `${el.id}-expl`)} />
      </div>
      <NumberField id="el-size" label={tr("Text size")} value={el.fontSize} min={8} max={72} onChange={(fontSize) => onPatch({ fontSize } as Partial<DesignElement>, `${el.id}-size`)} />
      <ColorField id="el-color" label={tr("Text colour")} value={el.color} onChange={(color) => onPatch({ color } as Partial<DesignElement>, `${el.id}-color`)} />
      <ColorField id="el-fill" label={tr("Background")} value={el.fill} allowNone onChange={(fill) => onPatch({ fill } as Partial<DesignElement>, `${el.id}-fill`)} />
      <p className="text-muted-foreground text-xs">{tr("Practice only: students can check their answer when presenting; nothing is recorded. Use Tests or Assignments for marks.")}</p>
    </>
  )
}

function ButtonProps({ el, pages, onPatch }: { el: ElementOf<"button">; pages: DesignPage[]; onPatch: Patch }) {
  const t = useT()
  return (
    <>
      <TextField id="el-label" label={t("Label")} value={el.label} max={60} onChange={(label) => onPatch({ label } as Partial<DesignElement>, `${el.id}-label`)} />
      <div className="grid gap-1.5">
        <Label htmlFor="el-action">{t("When pressed")}</Label>
        <OptionSelect
          id="el-action"
          value={el.action}
          onChange={(v) => {
            const action = v as ElementOf<"button">["action"]
            onPatch({ action, target: action === "page" ? (pages[0]?.id ?? null) : action === "url" ? "https://" : null } as Partial<DesignElement>)
          }}
          options={BUTTON_ACTIONS.map((a) => ({ id: a, label: BUTTON_ACTION_LABELS[a] }))}
          placeholder={t("Action")}
        />
      </div>
      {el.action === "page" && (
        <div className="grid gap-1.5">
          <Label htmlFor="el-target">{t("Page")}</Label>
          <OptionSelect id="el-target" value={el.target ?? ""} onChange={(target) => onPatch({ target } as Partial<DesignElement>)} options={pages.map((p, i) => ({ id: p.id, label: `Page ${i + 1}` }))} placeholder={t("Choose a page")} />
        </div>
      )}
      {el.action === "url" && (
        <>
          <TextField id="el-target" label={t("Link (https://…)")} value={el.target ?? ""} max={1000} onChange={(target) => onPatch({ target: target.trim() } as Partial<DesignElement>, `${el.id}-target`)} />
          {!/^https:\/\/[^\s<>"]+$/.test(el.target ?? "") && <p className="text-destructive text-sm">{t("Links must start with https://")}</p>}
        </>
      )}
      <NumberField id="el-size" label={t("Text size")} value={el.fontSize} min={8} max={72} onChange={(fontSize) => onPatch({ fontSize } as Partial<DesignElement>, `${el.id}-size`)} />
      <ColorField id="el-fill" label={t("Button colour")} value={el.fill} onChange={(fill) => onPatch({ fill } as Partial<DesignElement>, `${el.id}-fill`)} />
      <ColorField id="el-color" label={t("Text colour")} value={el.color} onChange={(color) => onPatch({ color } as Partial<DesignElement>, `${el.id}-color`)} />
    </>
  )
}

export function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t("Icon")} className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto rounded-md border p-1">
      {Object.entries(DESIGN_ICONS).map(([name, { icon: Icon, label }]) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          aria-label={t(label)}
          title={t(label)}
          onClick={() => onChange(name)}
          className={cn("hover:bg-muted flex aspect-square items-center justify-center rounded", value === name && "bg-primary/10 ring-primary ring-2")}
        >
          <Icon className="size-5" aria-hidden />
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Small fields
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-muted-foreground text-xs font-semibold tracking-wide uppercase">{title}</h3>
      {children}
    </section>
  )
}

function NumberField({ id, label, value, min, max, onChange }: { id: string; label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const t = useT()
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">
        {t(label)}
      </Label>
      <Input
        id={id}
        type="number"
        className="h-8"
        value={Math.round(value * 10) / 10}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value)
          if (e.target.value !== "" && Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)))
        }}
      />
    </div>
  )
}

function TextField({ id, label, value, max, onChange }: { id: string; label: string; value: string; max: number; onChange: (v: string) => void }) {
  const t = useT()
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t(label)}</Label>
      <Input id={id} value={value} maxLength={max} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

function ColorField({ id, label, value, allowNone = false, onChange }: { id: string; label: string; value: string; allowNone?: boolean; onChange: (v: string) => void }) {
  const t = useT()
  const none = value === "transparent"
  return (
    <div className="flex items-center justify-between gap-2">
      <Label htmlFor={id} className="text-sm font-normal">
        {t(label)}
      </Label>
      <div className="flex items-center gap-2">
        {allowNone && (
          <label className="text-muted-foreground flex items-center gap-1 text-xs">
            <Checkbox checked={none} onCheckedChange={(v) => onChange(v === true ? "transparent" : "#ffffff")} /> {t("None")}
          </label>
        )}
        <input id={id} type="color" value={none ? "#ffffff" : value} disabled={none} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 cursor-pointer rounded border bg-transparent p-0.5 disabled:opacity-40" />
      </div>
    </div>
  )
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  const t = useT()
  return (
    <div className="grid gap-1.5">
      <span className="text-sm font-medium">{t(label)}</span>
      <div role="radiogroup" aria-label={t(label)} className="flex flex-wrap gap-1">
        {options.map(([v, text]) => (
          <Button key={v} type="button" role="radio" aria-checked={value === v} size="sm" variant={value === v ? "secondary" : "outline"} onClick={() => onChange(v)}>
            {text}
          </Button>
        ))}
      </div>
    </div>
  )
}

function Toggle({ pressed, label, onClick, icon }: { pressed: boolean; label: string; onClick: () => void; icon: React.ReactNode }) {
  const t = useT()
  return (
    <Button type="button" variant={pressed ? "secondary" : "ghost"} size="icon" className="size-8" aria-pressed={pressed} aria-label={t(label)} title={t(label)} onClick={onClick}>
      {icon}
    </Button>
  )
}
