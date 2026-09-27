"use client"

import {
  BanIcon,
  EyeIcon,
  EyeOffIcon,
  LinkIcon,
  Loader2Icon,
  PlayIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  Trash2Icon,
  UnlinkIcon,
  VideoIcon,
} from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  addLinkMaterialAction,
  joinSessionAction,
  linkHomeworkAction,
  materialVisibilityAction,
  removeMaterialAction,
  saveNotesAction,
  sessionStatusAction,
  unlinkHomeworkAction,
} from "@/features/online/actions"
import { JOIN_EARLY_MINUTES, joinState, type SessionStatus } from "@/features/online/sessions"

/** Start lesson / end / reopen / cancel / restore, for the class's teacher. */
export function SessionStatusControls({ sessionId, status, meetingUrl }: { sessionId: string; status: SessionStatus; meetingUrl: string | null }) {
  const [isPending, startTransition] = useTransition()
  const [reason, setReason] = useState("")
  const run = (action: "end" | "reopen" | "restore") => sessionStatusAction.bind(null, { sessionId, action })

  function start() {
    startTransition(async () => {
      const result = await sessionStatusAction({ sessionId, action: "start" })
      if (result.ok) toast.success("Lesson started. Students can join.")
      else toast.error(result.error.message)
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status === "scheduled" &&
        (meetingUrl ? (
          // The link opens the meeting straight away (no pop-up blocking);
          // the click also marks the session live.
          <Button asChild>
            <a href={meetingUrl} target="_blank" rel="noreferrer" onClick={start} aria-disabled={isPending}>
              {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <PlayIcon aria-hidden />} Start lesson
            </a>
          </Button>
        ) : (
          <Button onClick={start} disabled={isPending}>
            <PlayIcon aria-hidden /> Start lesson
          </Button>
        ))}
      {status === "live" && meetingUrl && (
        <Button variant="outline" asChild>
          <a href={meetingUrl} target="_blank" rel="noreferrer">
            <VideoIcon aria-hidden /> Open meeting
          </a>
        </Button>
      )}
      {status === "live" && (
        <ConfirmActionButton variant="default" title="End the lesson?" description="Students can no longer join from BSmart. You can reopen it if needed." confirmLabel="End lesson" successMessage="Lesson ended." action={run("end")}>
          <SquareIcon aria-hidden /> End lesson
        </ConfirmActionButton>
      )}
      {status === "ended" && (
        <ConfirmActionButton title="Reopen the lesson?" description="Marks it live again so students can rejoin." confirmLabel="Reopen" successMessage="Lesson reopened." action={run("reopen")}>
          <RotateCcwIcon aria-hidden /> Reopen
        </ConfirmActionButton>
      )}
      {(status === "scheduled" || status === "live") && (
        <ActionDialog
          trigger={
            <Button variant="ghost">
              <BanIcon aria-hidden /> Cancel session
            </Button>
          }
          title="Cancel this session?"
          description="Students see that it is cancelled and the reason. The meeting itself is not deleted in Google Meet, Zoom or Teams."
          submitLabel="Cancel session"
          successMessage="Session cancelled."
          onOpen={() => setReason("")}
          onSubmit={() => sessionStatusAction({ sessionId, action: "cancel", reason })}
        >
          <Field id="cancel-reason" label="Reason">
            <Textarea id="cancel-reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Teacher unwell – moved to Friday" />
          </Field>
        </ActionDialog>
      )}
      {status === "cancelled" && (
        <ConfirmActionButton title="Restore the session?" description="It is scheduled again." confirmLabel="Restore" successMessage="Session restored." action={run("restore")}>
          <RotateCcwIcon aria-hidden /> Restore
        </ConfirmActionButton>
      )}
    </div>
  )
}

/**
 * Students: the database checks the class and the time window, logs the join
 * and only then returns the link.
 */
export function JoinButton({ session }: { session: { id: string; starts_at: string; ends_at: string; status: SessionStatus; hasLink: boolean } }) {
  const [isPending, startTransition] = useTransition()
  const state = joinState(session)

  function join() {
    // Open the tab during the click so browsers do not block it, then point
    // it at the meeting once the server has allowed the join.
    const tab = window.open("", "_blank")
    startTransition(async () => {
      const result = await joinSessionAction({ sessionId: session.id })
      if (result.ok && result.data) {
        if (tab) {
          tab.opener = null
          tab.location.href = result.data
        } else window.location.href = result.data
      } else {
        tab?.close()
        toast.error(result.ok ? "The meeting link is not available." : result.error.message)
      }
    })
  }

  if (state === "cancelled" || state === "finished") return null
  if (!session.hasLink)
    return (
      <Button disabled variant="outline">
        <VideoIcon aria-hidden /> Link not added yet
      </Button>
    )
  return (
    <div className="grid gap-1">
      <Button onClick={join} disabled={isPending || state !== "open"}>
        {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <VideoIcon aria-hidden />} Join lesson
      </Button>
      {state === "not_yet" && <span className="text-muted-foreground text-xs">Opens {JOIN_EARLY_MINUTES} minutes before the start.</span>}
    </div>
  )
}

export function AddLinkMaterialDialog({ sessionId }: { sessionId: string }) {
  const empty = { title: "", url: "", visible: true }
  const [v, setV] = useState(empty)
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <LinkIcon aria-hidden /> Add link
        </Button>
      }
      title="Add a link"
      description="Slides, a worksheet, a video or a game — any https:// link."
      submitLabel="Add"
      successMessage="Link added."
      onOpen={() => setV(empty)}
      onSubmit={() => addLinkMaterialAction({ sessionId, ...v })}
    >
      <Field id="ml-title" label="Title">
        <Input id="ml-title" maxLength={200} value={v.title} onChange={(e) => setV((c) => ({ ...c, title: e.target.value }))} />
      </Field>
      <Field id="ml-url" label="Link">
        <Input id="ml-url" type="url" maxLength={1000} value={v.url} onChange={(e) => setV((c) => ({ ...c, url: e.target.value.trim() }))} placeholder="https://…" />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={v.visible} onCheckedChange={(checked) => setV((c) => ({ ...c, visible: checked === true }))} /> Students can see it
      </label>
    </ActionDialog>
  )
}

export function MaterialActions({ materialId, visible, title }: { materialId: string; visible: boolean; title: string }) {
  return (
    <div className="flex gap-1">
      <ConfirmActionButton
        variant="ghost"
        size="icon"
        aria-label={visible ? `Hide ${title} from students` : `Show ${title} to students`}
        title={visible ? "Hide from students?" : "Show to students?"}
        description={visible ? "Only staff will see it." : "Students in the class will see it."}
        confirmLabel={visible ? "Hide" : "Show"}
        successMessage={visible ? "Hidden from students." : "Shown to students."}
        action={materialVisibilityAction.bind(null, { materialId, visible: !visible })}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </ConfirmActionButton>
      <ConfirmActionButton variant="ghost" size="icon" aria-label={`Remove ${title}`} title="Remove this material?" description="Uploaded files are deleted." confirmLabel="Remove" successMessage="Material removed." destructive action={removeMaterialAction.bind(null, { materialId })}>
        <Trash2Icon />
      </ConfirmActionButton>
    </div>
  )
}

export function LinkHomeworkDialog({ sessionId, assignments }: { sessionId: string; assignments: { id: string; title: string; status: string }[] }) {
  const [assignmentId, setAssignmentId] = useState("")
  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm" disabled={assignments.length === 0}>
          <PlusIcon aria-hidden /> Link existing
        </Button>
      }
      title="Link homework"
      description="Choose one of the class's assignments. Students do it from Assignments as usual."
      submitLabel="Link"
      successMessage="Homework linked."
      onOpen={() => setAssignmentId("")}
      onSubmit={() => linkHomeworkAction({ sessionId, assignmentId })}
    >
      <Field id="hw-assignment" label="Assignment">
        <OptionSelect
          id="hw-assignment"
          value={assignmentId}
          onChange={setAssignmentId}
          options={assignments.map((a) => ({ id: a.id, label: a.status === "published" ? a.title : `${a.title} (${a.status})` }))}
          placeholder="Choose an assignment"
        />
      </Field>
    </ActionDialog>
  )
}

export function UnlinkHomeworkButton({ sessionId, assignmentId, title }: { sessionId: string; assignmentId: string; title: string }) {
  return (
    <ConfirmActionButton variant="ghost" size="icon" aria-label={`Unlink ${title}`} title="Unlink this homework?" description="The assignment itself is kept." confirmLabel="Unlink" successMessage="Homework unlinked." action={unlinkHomeworkAction.bind(null, { sessionId, assignmentId })}>
      <UnlinkIcon />
    </ConfirmActionButton>
  )
}

export function TeachingNotesEditor({ sessionId, initial }: { sessionId: string; initial: string }) {
  const [notes, setNotes] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await saveNotesAction({ sessionId, notes })
      if (result.ok) {
        setSaved(notes)
        toast.success("Notes saved.")
      } else toast.error(result.error.message)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <Textarea
        aria-label="Teaching notes"
        rows={6}
        maxLength={20000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What was covered, who needs extra help, what to do next time…"
      />
      <div className="flex items-center gap-2">
        <SubmitButton pending={isPending} disabled={notes === saved}>
          Save notes
        </SubmitButton>
        {notes !== saved && <span className="text-muted-foreground text-xs">Unsaved changes</span>}
      </div>
    </form>
  )
}
