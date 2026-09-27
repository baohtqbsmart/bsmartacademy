"use client"

import { ListChecksIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveSetAction, setSetWordsAction } from "@/features/english/actions"
import { CEFR_LABELS, CEFR_LEVELS } from "@/features/tests/questions"

const NONE = "__none"

type SetValues = { setId?: string; title: string; description: string; cefrLevel: string; topic: string }

export function SetDialog({ initial }: { initial?: SetValues }) {
  const empty: SetValues = { title: "", description: "", cefrLevel: "", topic: "" }
  const [v, setV] = useState<SetValues>(initial ?? empty)
  const set = <K extends keyof SetValues>(key: K, value: SetValues[K]) => setV((c) => ({ ...c, [key]: value }))
  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="outline" size="sm">
            <PencilIcon aria-hidden /> Edit set
          </Button>
        ) : (
          <Button variant="outline">
            <PlusIcon aria-hidden /> New word set
          </Button>
        )
      }
      title={initial ? "Edit word set" : "New word set"}
      description="Sets are saved as drafts; add at least 4 words, then publish."
      submitLabel="Save"
      successMessage="Set saved."
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => saveSetAction(v)}
    >
      <Field id="s-title" label="Title">
        <Input id="s-title" value={v.title} onChange={(e) => set("title", e.target.value)} />
      </Field>
      <Field id="s-desc" label="Description">
        <Textarea id="s-desc" rows={2} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="s-cefr" label="CEFR level">
          <OptionSelect
            id="s-cefr"
            value={v.cefrLevel || NONE}
            onChange={(value) => set("cefrLevel", value === NONE ? "" : value)}
            options={[{ id: NONE, label: "Not set" }, ...CEFR_LEVELS.map((l) => ({ id: l, label: CEFR_LABELS[l] }))]}
            placeholder="Level"
          />
        </Field>
        <Field id="s-topic" label="Topic">
          <Input id="s-topic" value={v.topic} onChange={(e) => set("topic", e.target.value)} />
        </Field>
      </div>
    </ActionDialog>
  )
}

export type PickableWord = { id: string; word: string; meaning_vi: string; topic: string | null; cefr_level: string | null }

/** Choose which words belong to a set (or to a reading's glossary). */
export function WordPicker({
  words,
  selected: initial,
  onSave,
  label = "Choose words",
}: {
  words: PickableWord[]
  selected: string[]
  onSave?: (ids: string[]) => void
  label?: string
}) {
  const [selected, setSelected] = useState<string[]>(initial)
  const [search, setSearch] = useState("")
  const term = search.trim().toLowerCase()
  const shown = words.filter((w) => !term || `${w.word} ${w.meaning_vi} ${w.topic ?? ""}`.toLowerCase().includes(term))

  return (
    <div className="grid gap-2">
      <Input placeholder="Search words" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search words" />
      <p className="text-muted-foreground text-xs">{selected.length} selected</p>
      <ul className="grid max-h-72 gap-1 overflow-y-auto">
        {shown.map((w) => (
          <li key={w.id}>
            <label className="hover:bg-muted flex items-center gap-2 rounded-md px-2 py-1 text-sm">
              <input
                type="checkbox"
                className="accent-primary size-4"
                checked={selected.includes(w.id)}
                onChange={(e) => {
                  const next = e.target.checked ? [...selected, w.id] : selected.filter((id) => id !== w.id)
                  setSelected(next)
                  onSave?.(next)
                }}
              />
              <span className="font-medium">{w.word}</span>
              <span className="text-muted-foreground">{w.meaning_vi}</span>
              {w.topic && <span className="text-muted-foreground ml-auto text-xs">{w.topic}</span>}
            </label>
          </li>
        ))}
      </ul>
      <span className="sr-only">{label}</span>
    </div>
  )
}

export function SetWordsDialog({ setId, words, selected }: { setId: string; words: PickableWord[]; selected: string[] }) {
  const [ids, setIds] = useState<string[]>(selected)
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <ListChecksIcon aria-hidden /> Choose words
        </Button>
      }
      title="Words in this set"
      description="Published words only. Students need at least 4 words for every activity."
      submitLabel="Save words"
      successMessage="Words saved."
      onOpen={() => setIds(selected)}
      onSubmit={() => setSetWordsAction({ setId, wordIds: ids })}
    >
      <WordPicker key={selected.join(",")} words={words} selected={selected} onSave={setIds} />
    </ActionDialog>
  )
}
