"use client"

import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveWordAction } from "@/features/english/actions"
import type { WordFormInput } from "@/features/english/schemas"
import { PART_OF_SPEECH_LABELS, PARTS_OF_SPEECH } from "@/features/english/skills"
import { CEFR_LABELS, CEFR_LEVELS } from "@/features/tests/questions"
import type { FieldErrors } from "@/lib/action-result"

const NONE = "__none"

export function WordForm({ initial, cancelHref }: { initial: WordFormInput; cancelHref: string }) {
  const [v, setV] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()
  const set = <K extends keyof WordFormInput>(key: K, value: WordFormInput[K]) => setV((c) => ({ ...c, [key]: value }))
  const fieldError = (name: string) => fieldErrors[name]?.[0] && <p className="text-destructive text-sm">{fieldErrors[name]![0]}</p>

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveWordAction(v)
      if (!result) return
      if (result.ok) toast.success("Word saved.")
      else {
        setError(result.error.message)
        setFieldErrors(result.error.fieldErrors ?? {})
      }
    })
  }

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <FormAlert message={error} />
      <Card>
        <CardHeader>
          <CardTitle>Word</CardTitle>
          <CardDescription>Audio and a picture can be added on the vocabulary page after saving.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="w-word" label="Word">
            <Input id="w-word" value={v.word} onChange={(e) => set("word", e.target.value)} />
            {fieldError("word")}
          </Field>
          <Field id="w-ipa" label="IPA">
            <Input id="w-ipa" value={v.ipa ?? ""} onChange={(e) => set("ipa", e.target.value)} placeholder="/ˈræb.ɪt/" />
          </Field>
          <Field id="w-pos" label="Part of speech">
            <OptionSelect id="w-pos" value={v.partOfSpeech} onChange={(value) => set("partOfSpeech", value as WordFormInput["partOfSpeech"])} options={PARTS_OF_SPEECH.map((p) => ({ id: p, label: PART_OF_SPEECH_LABELS[p] }))} placeholder="Part of speech" />
          </Field>
          <Field id="w-cefr" label="CEFR level">
            <OptionSelect
              id="w-cefr"
              value={v.cefrLevel || NONE}
              onChange={(value) => set("cefrLevel", (value === NONE ? "" : value) as WordFormInput["cefrLevel"])}
              options={[{ id: NONE, label: "Not set" }, ...CEFR_LEVELS.map((l) => ({ id: l, label: CEFR_LABELS[l] }))]}
              placeholder="Level"
            />
          </Field>
          <Field id="w-vi" label="Vietnamese meaning">
            <Input id="w-vi" value={v.meaningVi} onChange={(e) => set("meaningVi", e.target.value)} />
            {fieldError("meaningVi")}
          </Field>
          <Field id="w-topic" label="Topic">
            <Input id="w-topic" value={v.topic ?? ""} onChange={(e) => set("topic", e.target.value)} placeholder="Animals" />
          </Field>
          <div className="sm:col-span-2">
            <Field id="w-def" label="English definition">
              <Textarea id="w-def" rows={2} value={v.definitionEn ?? ""} onChange={(e) => set("definitionEn", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field id="w-example" label="Example sentence (used for fill-in-the-blank practice)">
              <Input id="w-example" value={v.example ?? ""} onChange={(e) => set("example", e.target.value)} />
            </Field>
          </div>
          <Field id="w-coll" label="Collocations (comma separated)">
            <Input id="w-coll" value={v.collocations} onChange={(e) => set("collocations", e.target.value)} />
          </Field>
          <Field id="w-syn" label="Synonyms">
            <Input id="w-syn" value={v.synonyms} onChange={(e) => set("synonyms", e.target.value)} />
          </Field>
          <Field id="w-ant" label="Antonyms">
            <Input id="w-ant" value={v.antonyms} onChange={(e) => set("antonyms", e.target.value)} />
          </Field>
          <label className="flex items-center gap-2 self-end text-sm">
            <Checkbox checked={v.published} onCheckedChange={(checked) => set("published", checked === true)} />
            Published (visible to students)
          </label>
        </CardContent>
      </Card>
      <div className="flex gap-2">
        <SubmitButton pending={isPending}>Save word</SubmitButton>
        <Button variant="outline" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
      </div>
    </form>
  )
}
