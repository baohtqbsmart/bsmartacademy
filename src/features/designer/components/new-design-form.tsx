"use client"

import { FileIcon } from "lucide-react"
import { useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { createDesignAction } from "@/features/designer/actions"
import { PageThumbnail } from "@/features/designer/components/page-view"
import {
  CATEGORY_LABELS,
  DEFAULT_PAGE_SIZE,
  DESIGN_KINDS,
  KIND_LABELS,
  PAGE_SIZE_IDS,
  PAGE_SIZES,
  TEMPLATE_CATEGORIES,
  type DesignContent,
  type DesignKind,
  type PageSizeId,
  type TemplateCategory,
} from "@/features/designer/model"
import type { FieldErrors } from "@/lib/action-result"
import { cn } from "@/lib/utils"
import { useT } from "@/i18n/client"

type Template = { key: string; category: TemplateCategory; kind: DesignKind; name: string; description: string; content: DesignContent }

export function NewDesignForm({ templates, initialTemplate }: { templates: Template[]; initialTemplate: string | null }) {
  const tr = useT()
  const start = templates.find((t) => t.key === initialTemplate) ?? null
  const [templateKey, setTemplateKey] = useState<string | null>(start?.key ?? null)
  const [kind, setKind] = useState<DesignKind>(start?.kind ?? "presentation")
  const [pageSize, setPageSize] = useState<PageSizeId>(start?.content.pageSize ?? "slide")
  const [title, setTitle] = useState(start?.name ?? "")
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()

  function chooseTemplate(t: Template | null) {
    setTemplateKey(t?.key ?? null)
    if (t) {
      setKind(t.kind)
      setPageSize(t.content.pageSize)
      if (!title.trim() || templates.some((x) => x.name === title)) setTitle(t.name)
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await createDesignAction({ title, kind, templateKey, pageSize })
      if (result && !result.ok) {
        setError(result.error.message)
        setFieldErrors(result.error.fieldErrors ?? {})
      }
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-6" noValidate>
      <FormAlert message={error} />
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{tr("Design")}</CardTitle>
          <CardDescription>{templateKey ? tr("The template's type and page size are used; you can change them in the editor.") : tr("A blank design of the chosen type.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-3">
            <Field id="d-title" label={tr("Title")}>
              <Input id="d-title" maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tr("Unit 5 – Food vocabulary")} />
              {fieldErrors.title?.[0] && <p className="text-destructive text-sm">{tr(fieldErrors.title[0])}</p>}
            </Field>
          </div>
          <Field id="d-kind" label={tr("Type")}>
            <OptionSelect
              id="d-kind"
              value={kind}
              onChange={(v) => {
                setKind(v as DesignKind)
                if (!templateKey) setPageSize(DEFAULT_PAGE_SIZE[v as DesignKind])
              }}
              options={DESIGN_KINDS.map((k) => ({ id: k, label: KIND_LABELS[k] }))}
              placeholder={tr("Type")}
            />
          </Field>
          <Field id="d-size" label={tr("Page size")}>
            <OptionSelect id="d-size" value={pageSize} onChange={(v) => setPageSize(v as PageSizeId)} options={PAGE_SIZE_IDS.map((id) => ({ id, label: PAGE_SIZES[id].label }))} placeholder={tr("Page size")} disabled={Boolean(templateKey)} />
          </Field>
          <div className="flex items-end">
            <SubmitButton pending={isPending} className="w-full">
              {tr("Create and open")}
            </SubmitButton>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-labelledby="start-from">
        <h2 id="start-from" className="text-lg font-semibold">
          {tr("Start from")}
        </h2>
        <div role="radiogroup" aria-labelledby="start-from" className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
          <TemplateOption selected={templateKey === null} onSelect={() => chooseTemplate(null)} title={tr("Blank")} subtitle={tr(KIND_LABELS[kind])} description={tr("An empty design (flashcards and quizzes start with a sample card or question).")}>
            <div className="text-muted-foreground flex aspect-video items-center justify-center rounded border border-dashed bg-white">
              <FileIcon className="size-8" aria-hidden />
            </div>
          </TemplateOption>
          {TEMPLATE_CATEGORIES.flatMap((category) =>
            templates
              .filter((t) => t.category === category)
              .map((t) => (
                <TemplateOption key={t.key} selected={templateKey === t.key} onSelect={() => chooseTemplate(t)} title={t.name} subtitle={tr(CATEGORY_LABELS[category])} description={tr(t.description)}>
                  <div className="flex aspect-video items-center justify-center overflow-hidden rounded border bg-white">
                    <PageThumbnail page={t.content.pages[0]} pageSize={t.content.pageSize} assets={{}} width={t.content.pageSize === "a4_portrait" ? 110 : 208} />
                  </div>
                </TemplateOption>
              ))
          )}
        </div>
      </section>
    </form>
  )
}

function TemplateOption({ selected, onSelect, title, subtitle, description, children }: { selected: boolean; onSelect: () => void; title: string; subtitle: string; description: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn("bg-card grid content-start gap-2 rounded-lg border p-2 text-left transition-shadow hover:shadow-sm", selected && "border-primary ring-primary/30 ring-2")}
    >
      {children}
      <span className="grid gap-0.5 px-1 pb-1">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="shrink-0">
            {t(subtitle)}
          </Badge>
        </span>
        <span className="text-muted-foreground line-clamp-2 text-xs">{description}</span>
      </span>
    </button>
  )
}
