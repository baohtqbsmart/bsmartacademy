"use client"

import { PlusIcon, SendIcon } from "lucide-react"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { markThreadReadAction, sendMessageAction, startThreadAction } from "@/features/communication/actions"
import { useT } from "@/i18n/client"

type Target = { studentId: string; studentName: string; people: { profileId: string; name: string; detail: string }[] }

/** Parents pick a child and one of its teachers; teachers pick a student and one of its parents. */
export function NewThreadDialog({ role, userId, targets }: { role: "parent" | "teacher"; userId: string; targets: Target[] }) {
  const tr = useT()
  const [studentId, setStudentId] = useState(targets.length === 1 ? targets[0].studentId : "")
  const [personId, setPersonId] = useState("")
  const people = targets.find((t) => t.studentId === studentId)?.people ?? []
  return (
    <ActionDialog
      trigger={
        <Button disabled={targets.length === 0}>
          <PlusIcon aria-hidden /> {tr("New conversation")}
        </Button>
      }
      title={tr("New conversation")}
      description={role === "parent" ? tr("Write to one of your child's teachers.") : tr("Write to a parent of a student you teach.")}
      submitLabel={tr("Open conversation")}
      successMessage={tr("Conversation opened.")}
      onOpen={() => setPersonId("")}
      onSubmit={() =>
        startThreadAction({
          studentId,
          teacherProfileId: role === "teacher" ? userId : personId,
          parentProfileId: role === "parent" ? userId : personId,
        })
      }
    >
      <Field id="nt-student" label={role === "parent" ? tr("Child") : tr("Student")}>
        <OptionSelect
          id="nt-student"
          value={studentId}
          onChange={(v) => {
            setStudentId(v)
            setPersonId("")
          }}
          options={targets.map((t) => ({ id: t.studentId, label: t.studentName }))}
          placeholder={tr("Choose")}
        />
      </Field>
      <Field id="nt-person" label={role === "parent" ? tr("Teacher") : tr("Parent")}>
        <OptionSelect
          id="nt-person"
          value={personId}
          onChange={setPersonId}
          options={people.map((p) => ({ id: p.profileId, label: `${p.name} (${p.detail})` }))}
          placeholder={studentId ? tr("Choose") : tr("Choose the student first")}
          disabled={!studentId || people.length === 0}
        />
        {studentId && people.length === 0 && (
          <p className="text-muted-foreground text-xs">
            {tr("{value} Please contact the academy office.", { value: role === "parent" ? "None of this child's current teachers has an account yet." : "No parent of this student has an account yet." })}
          </p>
        )}
      </Field>
    </ActionDialog>
  )
}

export function MessageComposer({ threadId }: { threadId: string }) {
  const t = useT()
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()
  function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text) return
    startTransition(async () => {
      const result = await sendMessageAction({ threadId, body: text })
      if (result.ok) setBody("")
      else toast.error(result.error.message)
    })
  }
  return (
    <form onSubmit={submit} className="grid gap-2">
      <Textarea
        aria-label={t("Message")}
        rows={3}
        maxLength={4000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e)
        }}
        placeholder={t("Write a message… (Ctrl+Enter to send)")}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-xs">{body.length}/4000</span>
        <SubmitButton pending={isPending} disabled={!body.trim()}>
          <SendIcon aria-hidden /> {t("Send")}
        </SubmitButton>
      </div>
    </form>
  )
}

/** Marks the conversation read when a participant opens it. */
export function MarkThreadRead({ threadId }: { threadId: string }) {
  useEffect(() => {
    void markThreadReadAction({ threadId })
  }, [threadId])
  return null
}
