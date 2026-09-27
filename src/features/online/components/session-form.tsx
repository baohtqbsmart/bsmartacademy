"use client"

import { ExternalLinkIcon } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { saveSessionAction } from "@/features/online/actions"
import type { SessionFormInput } from "@/features/online/schemas"
import type { FieldErrors } from "@/lib/action-result"
import { detectProvider, MEETING_PROVIDERS, PROVIDERS, type MeetingProviderId } from "@/lib/meetings"
import { useT } from "@/i18n/client"

type ClassOption = { id: string; name: string; meetingUrl: string | null; teachers: { id: string; full_name: string; lead: boolean }[] }

export function SessionForm({
  initial,
  classes,
  editing,
  cancelHref,
}: {
  initial: SessionFormInput
  classes: ClassOption[]
  editing: boolean
  cancelHref: string
}) {
  const tr = useT()
  const [v, setV] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [isPending, startTransition] = useTransition()
  const set = <K extends keyof SessionFormInput>(key: K, value: SessionFormInput[K]) => setV((c) => ({ ...c, [key]: value }))
  const fieldError = (name: string) => fieldErrors[name]?.[0] && <p className="text-destructive text-sm">{tr(fieldErrors[name]![0])}</p>

  const klass = classes.find((c) => c.id === v.classId)
  const provider = PROVIDERS[v.provider as MeetingProviderId]

  function chooseClass(id: string) {
    const next = classes.find((c) => c.id === id)
    const lead = next?.teachers.find((t) => t.lead) ?? next?.teachers[0]
    setV((c) => ({ ...c, classId: id, teacherId: lead?.id ?? "" }))
  }

  function pasteLink(url: string) {
    // Recognise the platform from the pasted link.
    const detected = detectProvider(url)
    setV((c) => ({ ...c, meetingUrl: url, provider: detected && detected !== "other" ? detected : c.provider }))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await saveSessionAction(v)
      if (result && !result.ok) {
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
          <CardTitle>{tr("Class and time")}</CardTitle>
          <CardDescription>{tr("Times are Vietnam time. A teacher cannot have two sessions at once.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="os-class" label={tr("Class")}>
              <OptionSelect
                id="os-class"
                value={v.classId}
                onChange={chooseClass}
                options={classes.map((c) => ({ id: c.id, label: c.name }))}
                placeholder={tr("Choose a class")}
                disabled={editing}
              />
              {fieldError("classId")}
            </Field>
            <Field id="os-teacher" label={tr("Teacher")}>
              <OptionSelect
                id="os-teacher"
                value={v.teacherId}
                onChange={(value) => set("teacherId", value)}
                options={(klass?.teachers ?? []).map((t) => ({ id: t.id, label: t.lead ? `${t.full_name} (lead)` : t.full_name }))}
                placeholder={klass ? tr("Choose the teacher") : tr("Choose a class first")}
                disabled={!klass}
              />
              {fieldError("teacherId")}
            </Field>
          </div>
          <Field id="os-title" label={tr("Title")}>
            <Input id="os-title" maxLength={200} value={v.title} onChange={(e) => set("title", e.target.value)} placeholder={tr("Unit 5 – Animals: speaking practice")} />
            {fieldError("title")}
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="os-date" label={tr("Date")}>
              <Input id="os-date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} />
              {fieldError("date")}
            </Field>
            <Field id="os-start" label={tr("Start time")}>
              <Input id="os-start" type="time" value={v.startTime} onChange={(e) => set("startTime", e.target.value)} />
              {fieldError("startTime")}
            </Field>
            <Field id="os-end" label={tr("End time")}>
              <Input id="os-end" type="time" value={v.endTime} onChange={(e) => set("endTime", e.target.value)} />
              {fieldError("endTime")}
            </Field>
          </div>
          <Field id="os-agenda" label={tr("Agenda (students see it)")}>
            <Textarea id="os-agenda" rows={3} maxLength={5000} value={v.agenda ?? ""} onChange={(e) => set("agenda", e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr("Meeting")}</CardTitle>
          <CardDescription>
            {tr("Lessons run in Google Meet, Zoom or Microsoft Teams. Create the meeting there and paste its link; students get it from the Join button, 15 minutes before the start.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
            <Field id="os-provider" label={tr("Platform")}>
              <OptionSelect
                id="os-provider"
                value={v.provider}
                onChange={(value) => set("provider", value as MeetingProviderId)}
                options={MEETING_PROVIDERS.map((p) => ({ id: p, label: PROVIDERS[p].label }))}
                placeholder={tr("Platform")}
              />
            </Field>
            <Field id="os-url" label={tr("Meeting link")}>
              <Input id="os-url" type="url" inputMode="url" maxLength={500} value={v.meetingUrl ?? ""} onChange={(e) => pasteLink(e.target.value.trim())} placeholder={provider.example} />
              {fieldError("meetingUrl")}
            </Field>
          </div>
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            {provider.help}
            {provider.createUrl && (
              <a href={provider.createUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                {tr("Open {label}", { label: provider.label })} <ExternalLinkIcon className="size-3.5" aria-hidden />
              </a>
            )}
            {klass?.meetingUrl && !v.meetingUrl && (
              <Button type="button" variant="link" className="h-auto p-0" onClick={() => pasteLink(klass.meetingUrl!)}>
                {tr("Use the class's usual link")}
              </Button>
            )}
          </p>
          <p className="text-muted-foreground text-sm">{tr("You can save now and add the link later; students cannot join until it is there.")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="os-code" label={tr("Meeting ID (optional)")}>
              <Input id="os-code" maxLength={100} value={v.meetingCode ?? ""} onChange={(e) => set("meetingCode", e.target.value)} />
            </Field>
            <Field id="os-pass" label={tr("Passcode (optional)")}>
              <Input id="os-pass" maxLength={100} value={v.passcode ?? ""} onChange={(e) => set("passcode", e.target.value)} />
            </Field>
          </div>
          {editing && (
            <Field id="os-rec" label={tr("Recording link (optional)")}>
              <Input id="os-rec" type="url" maxLength={1000} value={v.recordingUrl ?? ""} onChange={(e) => set("recordingUrl", e.target.value)} placeholder={tr("https://…")} />
              {fieldError("recordingUrl")}
            </Field>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <SubmitButton pending={isPending}>{editing ? tr("Save changes") : tr("Create session")}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>{tr("Cancel")}</Link>
        </Button>
      </div>
    </form>
  )
}
