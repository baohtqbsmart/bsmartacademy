"use client"

import { PencilIcon, PlusIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveRubricAction } from "@/features/assessments/actions"
import { SCORING_LABELS, type AssessmentKind, type Scoring } from "@/features/assessments/scoring"

export type CriterionInput = { name: string; description: string; maxPoints: string }

/** Rows of criteria; IELTS-style criteria are fixed at 9 bands. */
export function CriteriaEditor({ value, onChange, scoring }: { value: CriterionInput[]; onChange: (v: CriterionInput[]) => void; scoring: Scoring }) {
  const set = (i: number, patch: Partial<CriterionInput>) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Criteria</legend>
      {value.map((c, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[1fr_2fr_6rem_auto]">
          <Input aria-label={`Criterion ${i + 1}`} placeholder="Grammar" value={c.name} onChange={(e) => set(i, { name: e.target.value })} />
          <Input aria-label={`Criterion ${i + 1} description`} placeholder="What a full score looks like" value={c.description} onChange={(e) => set(i, { description: e.target.value })} />
          <Input
            aria-label={`Criterion ${i + 1} maximum`}
            inputMode="decimal"
            disabled={scoring === "ielts_band"}
            value={scoring === "ielts_band" ? "9" : c.maxPoints}
            onChange={(e) => set(i, { maxPoints: e.target.value })}
          />
          <Button type="button" variant="ghost" size="icon" aria-label={`Remove criterion ${i + 1}`} disabled={value.length <= 1} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <XIcon />
          </Button>
        </div>
      ))}
      {value.length < 10 && (
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, { name: "", description: "", maxPoints: scoring === "ielts_band" ? "9" : "5" }])}>
            <PlusIcon aria-hidden /> Add a criterion
          </Button>
        </div>
      )}
    </fieldset>
  )
}

type RubricValues = { rubricId?: string; name: string; kind: AssessmentKind; scoring: Scoring; description: string; criteria: CriterionInput[] }

export function RubricDialog({ initial }: { initial?: RubricValues }) {
  const empty: RubricValues = { name: "", kind: "writing", scoring: "points", description: "", criteria: [{ name: "", description: "", maxPoints: "5" }] }
  const [v, setV] = useState<RubricValues>(initial ?? empty)
  const set = <K extends keyof RubricValues>(key: K, value: RubricValues[K]) => setV((c) => ({ ...c, [key]: value }))
  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden /> New rubric
          </Button>
        )
      }
      title={initial ? "Edit rubric" : "New rubric"}
      description="Tasks copy the rubric when they are set, so editing it never changes existing grades."
      submitLabel="Save rubric"
      successMessage="Rubric saved."
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => saveRubricAction({ ...v, criteria: v.criteria.map((c) => ({ ...c, maxPoints: v.scoring === "ielts_band" ? "9" : c.maxPoints })) })}
    >
      <Field id="r-name" label="Name">
        <Input id="r-name" value={v.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="r-kind" label="For">
          <OptionSelect
            id="r-kind"
            value={v.kind}
            onChange={(value) => set("kind", value as AssessmentKind)}
            options={[
              { id: "writing", label: "Writing" },
              { id: "speaking", label: "Speaking" },
            ]}
            placeholder="Kind"
            disabled={Boolean(initial)}
          />
        </Field>
        <Field id="r-scoring" label="Scoring">
          <OptionSelect
            id="r-scoring"
            value={v.scoring}
            onChange={(value) => set("scoring", value as Scoring)}
            options={(["points", "ielts_band"] as const).map((s) => ({ id: s, label: SCORING_LABELS[s] }))}
            placeholder="Scoring"
          />
        </Field>
      </div>
      <Field id="r-desc" label="Description">
        <Textarea id="r-desc" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <CriteriaEditor value={v.criteria} onChange={(criteria) => set("criteria", criteria)} scoring={v.scoring} />
    </ActionDialog>
  )
}
