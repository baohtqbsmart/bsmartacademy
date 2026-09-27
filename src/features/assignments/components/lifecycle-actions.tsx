"use client"

import { ArchiveIcon, ArchiveRestoreIcon, ClockIcon, LockIcon, LockOpenIcon, SendIcon, Trash2Icon, Undo2Icon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { changeAssignmentStatusAction, deleteDraftAction } from "@/features/assignments/actions"
import { availableActions, type AssignmentStatus } from "@/features/assignments/status"
import { isoToAcademyInput } from "@/lib/dates"

type LifecycleActionsProps = {
  assignmentId: string
  state: AssignmentStatus
  publishAt: string | null
  canDelete: boolean
}

/** Buttons for the moves the database allows from the current state. */
export function LifecycleActions({ assignmentId, state, publishAt, canDelete }: LifecycleActionsProps) {
  const actions = availableActions(state)
  const run = (action: string) => changeAssignmentStatusAction.bind(null, { assignmentId, action })

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes("publish") && (
        <ConfirmActionButton
          variant="default"
          title="Publish now?"
          description="Students in the class will see the assignment straight away."
          confirmLabel="Publish"
          successMessage="Assignment published."
          action={run("publish")}
        >
          <SendIcon aria-hidden /> Publish
        </ConfirmActionButton>
      )}
      {actions.includes("schedule") && <ScheduleDialog assignmentId={assignmentId} publishAt={publishAt} rescheduling={state === "scheduled"} />}
      {actions.includes("unschedule") && (
        <ConfirmActionButton
          title="Back to draft?"
          description="The scheduled publication is cancelled."
          confirmLabel="Back to draft"
          successMessage="Moved back to draft."
          action={run("unschedule")}
        >
          <Undo2Icon aria-hidden /> Unschedule
        </ConfirmActionButton>
      )}
      {actions.includes("close") && (
        <ConfirmActionButton
          title="Close the assignment?"
          description="Students can still see it and their grades, but can no longer start or hand in work. You can reopen it later."
          confirmLabel="Close"
          successMessage="Assignment closed."
          action={run("close")}
        >
          <LockIcon aria-hidden /> Close
        </ConfirmActionButton>
      )}
      {actions.includes("reopen") && (
        <ConfirmActionButton
          title="Reopen the assignment?"
          description="Students can hand in work again."
          confirmLabel="Reopen"
          successMessage="Assignment reopened."
          action={run("reopen")}
        >
          <LockOpenIcon aria-hidden /> Reopen
        </ConfirmActionButton>
      )}
      {actions.includes("archive") && (
        <ConfirmActionButton
          title="Archive the assignment?"
          description="It disappears from students' and parents' lists. Submissions and grades are kept, and you can restore it."
          confirmLabel="Archive"
          successMessage="Assignment archived."
          action={run("archive")}
        >
          <ArchiveIcon aria-hidden /> Archive
        </ConfirmActionButton>
      )}
      {actions.includes("restore") && (
        <ConfirmActionButton
          title="Restore the assignment?"
          description="It comes back as closed (if students saw it before) or as a draft."
          confirmLabel="Restore"
          successMessage="Assignment restored."
          action={run("restore")}
        >
          <ArchiveRestoreIcon aria-hidden /> Restore
        </ConfirmActionButton>
      )}
      {canDelete && (
        <ConfirmActionButton
          variant="ghost"
          title="Delete this draft?"
          description="The draft, its questions and attachments are deleted permanently."
          confirmLabel="Delete"
          successMessage="Draft deleted."
          destructive
          action={deleteDraftAction.bind(null, { assignmentId })}
        >
          <Trash2Icon aria-hidden /> Delete draft
        </ConfirmActionButton>
      )}
    </div>
  )
}

function ScheduleDialog({ assignmentId, publishAt, rescheduling }: { assignmentId: string; publishAt: string | null; rescheduling: boolean }) {
  const [value, setValue] = useState(isoToAcademyInput(publishAt))
  return (
    <ActionDialog
      trigger={
        <Button variant="outline">
          <ClockIcon aria-hidden /> {rescheduling ? "Reschedule" : "Schedule"}
        </Button>
      }
      title={rescheduling ? "Change the publication time" : "Schedule publication"}
      description="The assignment becomes visible to students at this time (Vietnam time)."
      submitLabel="Schedule"
      successMessage="Publication scheduled."
      onOpen={() => setValue(isoToAcademyInput(publishAt))}
      onSubmit={() => changeAssignmentStatusAction({ assignmentId, action: "schedule", publishAt: value })}
    >
      <Field id="publish-at" label="Publish at">
        <Input id="publish-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} required />
      </Field>
    </ActionDialog>
  )
}
