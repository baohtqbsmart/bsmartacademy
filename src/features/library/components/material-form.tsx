"use client"

import { FileUpIcon } from "lucide-react"
import Link from "next/link"
import { useRef, useState, useTransition } from "react"

import { FormAlert } from "@/components/shared/form-alert"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ASSIGNMENT_SKILLS, SKILL_LABELS } from "@/features/assignments/status"
import { createMaterialAction, updateMaterialAction } from "@/features/library/actions"
import { isLibraryMime, LIBRARY_ACCEPT, parseTags } from "@/features/library/catalog"
import { folderPaths, type FolderNode } from "@/features/library/folders"
import type { FieldErrors } from "@/lib/action-result"
import { BUCKETS } from "@/lib/storage"
import { createClient } from "@/lib/supabase/client"
import { checkFile, fileExtension, formatFileSize } from "@/lib/uploads"
import { cn } from "@/lib/utils"

const NONE = "__none"

export type MaterialFormInitial = {
  materialId?: string
  title: string
  description: string
  subjectId: string
  levelId: string
  skill: string
  topic: string
  tags: string
  folderId: string
  visibility: "private" | "staff"
  scope: "personal" | "academy"
}

export function MaterialForm({
  initial,
  userId,
  canManageAcademy,
  subjects,
  levels,
  folders,
  cancelHref,
}: {
  initial: MaterialFormInitial
  userId: string
  canManageAcademy: boolean
  subjects: { id: string; name: string }[]
  levels: { id: string; name: string; subject_id: string }[]
  folders: FolderNode[]
  cancelHref: string
}) {
  const editing = Boolean(initial.materialId)
  const [v, setV] = useState(initial)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [progress, setProgress] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const set = <K extends keyof MaterialFormInitial>(key: K, value: MaterialFormInitial[K]) => setV((c) => ({ ...c, [key]: value }))
  const fieldError = (name: string) => fieldErrors[name]?.[0] && <p className="text-destructive text-sm">{fieldErrors[name]![0]}</p>

  const scopeFolders = folderPaths(folders.filter((f) => f.scope === v.scope && (v.scope === "academy" || f.ownerId === userId)))
  const subjectLevels = levels.filter((l) => l.subject_id === v.subjectId)

  function pick(f: File | undefined) {
    if (!f) return
    const check = checkFile(f)
    if (!check.ok) return setError(check.message)
    if (!isLibraryMime(check.mimeType)) return setError(`"${f.name}" is not a PDF, Word, PowerPoint, image, audio or video file.`)
    setError(null)
    setFile(f)
    if (!v.title.trim()) set("title", f.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 200))
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    const details = {
      title: v.title,
      description: v.description,
      subjectId: v.subjectId,
      levelId: v.levelId,
      skill: v.skill,
      topic: v.topic,
      tags: parseTags(v.tags),
      folderId: v.folderId,
      visibility: v.visibility,
    }
    startTransition(async () => {
      if (editing) {
        const result = await updateMaterialAction({ ...details, materialId: initial.materialId })
        if (result && !result.ok) {
          setError(result.error.message)
          setFieldErrors(result.error.fieldErrors ?? {})
        }
        return
      }
      if (!file) return setError("Choose a file to upload.")
      const check = checkFile(file)
      if (!check.ok) return setError(check.message)
      // Straight to Storage, into the uploader's own folder; the server then
      // checks the bytes and the database checks the record.
      setProgress(`Uploading ${formatFileSize(file.size)}…`)
      const objectPath = `library/${userId}/${crypto.randomUUID()}.${fileExtension(file.name)}`
      const { error: uploadError } = await createClient().storage.from(BUCKETS.assignmentFiles).upload(objectPath, file, { contentType: check.mimeType, upsert: false })
      if (uploadError) {
        setProgress(null)
        return setError("The file could not be uploaded. Please try again.")
      }
      setProgress("Checking the file…")
      const result = await createMaterialAction({ ...details, scope: v.scope, objectPath, fileName: file.name })
      setProgress(null)
      if (result && !result.ok) {
        setError(result.error.message)
        setFieldErrors(result.error.fieldErrors ?? {})
      }
    })
  }

  return (
    <form onSubmit={submit} className="grid max-w-3xl gap-6" noValidate>
      <FormAlert message={error} />
      {!editing && (
        <Card>
          <CardHeader>
            <CardTitle>File</CardTitle>
            <CardDescription>PDF, Word (.docx), PowerPoint (.pptx), images (PNG, JPEG, WebP), audio (MP3, M4A, WAV, WebM) or video (MP4, MOV); up to 20 MB. Its content is checked before it is accepted.</CardDescription>
          </CardHeader>
          <CardContent>
            <input ref={inputRef} type="file" accept={LIBRARY_ACCEPT} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => pick(e.target.files?.[0])} />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                pick(e.dataTransfer.files[0])
              }}
              className={cn("hover:bg-muted/50 flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm", file && "border-primary/50")}
            >
              <FileUpIcon className="text-muted-foreground size-8" aria-hidden />
              {file ? (
                <span>
                  <span className="font-medium">{file.name}</span> · {formatFileSize(file.size)} — choose another
                </span>
              ) : (
                <span>Choose a file or drop it here</span>
              )}
            </button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Used for searching and filtering.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field id="m-title" label="Title">
            <Input id="m-title" maxLength={200} value={v.title} onChange={(e) => set("title", e.target.value)} />
            {fieldError("title")}
          </Field>
          <Field id="m-desc" label="Description">
            <Textarea id="m-desc" rows={3} maxLength={2000} value={v.description} onChange={(e) => set("description", e.target.value)} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="m-subject" label="Subject">
              <OptionSelect
                id="m-subject"
                value={v.subjectId || NONE}
                onChange={(value) => setV((c) => ({ ...c, subjectId: value === NONE ? "" : value, levelId: "" }))}
                options={[{ id: NONE, label: "Any subject" }, ...subjects.map((s) => ({ id: s.id, label: s.name }))]}
                placeholder="Subject"
              />
            </Field>
            <Field id="m-level" label="Level">
              <OptionSelect
                id="m-level"
                value={v.levelId || NONE}
                onChange={(value) => set("levelId", value === NONE ? "" : value)}
                options={[{ id: NONE, label: v.subjectId ? "Any level" : "Choose a subject first" }, ...subjectLevels.map((l) => ({ id: l.id, label: l.name }))]}
                placeholder="Level"
                disabled={!v.subjectId}
              />
            </Field>
            <Field id="m-skill" label="Skill">
              <OptionSelect
                id="m-skill"
                value={v.skill || NONE}
                onChange={(value) => set("skill", value === NONE ? "" : value)}
                options={[{ id: NONE, label: "Any skill" }, ...ASSIGNMENT_SKILLS.map((s) => ({ id: s, label: SKILL_LABELS[s] }))]}
                placeholder="Skill"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="m-topic" label="Topic">
              <Input id="m-topic" maxLength={120} value={v.topic} onChange={(e) => set("topic", e.target.value)} placeholder="Animals" />
            </Field>
            <Field id="m-tags" label="Tags (comma-separated, up to 10)">
              <Input id="m-tags" value={v.tags} onChange={(e) => set("tags", e.target.value)} placeholder="flyers, unit 4, reading" />
              {fieldError("tags")}
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Where and who</CardTitle>
          <CardDescription>Students never see a material until it is assigned to their class or shared with them (from the material page).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {canManageAcademy && !editing && (
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Library</legend>
              <RadioRow name="scope" value="personal" checked={v.scope === "personal"} onChange={() => setV((c) => ({ ...c, scope: "personal", folderId: "" }))} label="My materials" hint="You manage it." />
              <RadioRow name="scope" value="academy" checked={v.scope === "academy"} onChange={() => setV((c) => ({ ...c, scope: "academy", folderId: "" }))} label="Academy library" hint="Shared academy resource, managed by administrators." />
            </fieldset>
          )}
          <Field id="m-folder" label="Folder">
            <OptionSelect
              id="m-folder"
              value={v.folderId || NONE}
              onChange={(value) => set("folderId", value === NONE ? "" : value)}
              options={[{ id: NONE, label: "No folder" }, ...scopeFolders.map((f) => ({ id: f.id, label: f.path }))]}
              placeholder="Folder"
            />
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Other teachers</legend>
            <RadioRow name="visibility" value="private" checked={v.visibility === "private"} onChange={() => set("visibility", "private")} label="Only me" hint={v.scope === "academy" ? "Administrators only (a draft)." : "Administrators can still see it."} />
            <RadioRow name="visibility" value="staff" checked={v.visibility === "staff"} onChange={() => set("visibility", "staff")} label="All teachers" hint="Any teacher can find it and use it in their own classes." />
          </fieldset>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <SubmitButton pending={isPending}>{editing ? "Save changes" : "Upload"}</SubmitButton>
        <Button variant="ghost" asChild>
          <Link href={cancelHref}>Cancel</Link>
        </Button>
        {progress && (
          <span className="text-muted-foreground text-sm" role="status">
            {progress}
          </span>
        )}
      </div>
    </form>
  )
}

function RadioRow({ name, value, checked, onChange, label, hint }: { name: string; value: string; checked: boolean; onChange: () => void; label: string; hint: string }) {
  const id = `${name}-${value}`
  return (
    <div className="flex items-start gap-2">
      <input type="radio" id={id} name={name} value={value} checked={checked} onChange={onChange} className="accent-primary mt-1" />
      <Label htmlFor={id} className="grid gap-0.5 font-normal">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground text-xs">{hint}</span>
      </Label>
    </div>
  )
}
