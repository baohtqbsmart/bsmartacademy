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
import { useT } from "@/i18n/client"

type LifecycleActionsProps = {
  assignmentId: string
  state: AssignmentStatus
  publishAt: string | null
  canDelete: boolean
}

/** Buttons for the moves the database allows from the current state. */
export function LifecycleActions({ assignmentId, state, publishAt, canDelete }: LifecycleActionsProps) {
  const t = useT()
  const actions = availableActions(state)
  const run = (action: string) => changeAssignmentStatusAction.bind(null, { assignmentId, action })

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes("publish") && (
        <ConfirmActionButton
          variant="default"
          title={t("Publish now?")}
          description={t("Students in the class will see the assignment straight away.")}
          confirmLabel={t("Publish")}
          successMessage={t("Assignment published.")}
          action={run("publish")}
        >
          <SendIcon aria-hidden /> {t("Publish")}
        </ConfirmActionButton>
      )}
      {actions.includes("schedule") && <ScheduleDialog assignmentId={assignmentId} publishAt={publishAt} rescheduling={state === "scheduled"} />}
      {actions.includes("unschedule") && (
        <ConfirmActionButton
          title={t("Back to draft?")}
          description={t("The scheduled publication is cancelled.")}
          confirmLabel={t("Back to draft")}
          successMessage={t("Moved back to draft.")}
          action={run("unschedule")}
        >
          <Undo2Icon aria-hidden /> {t("Unschedule")}
        </ConfirmActionButton>
      )}
      {actions.includes("close") && (
        <ConfirmActionButton
          title={t("Close the assignment?")}
          description={t("Students can still see it and their grades, but can no longer start or hand in work. You can reopen it later.")}
          confirmLabel={t("Close")}
          successMessage={t("Assignment closed.")}
          action={run("close")}
        >
          <LockIcon aria-hidden /> {t("Close")}
        </ConfirmActionButton>
      )}
      {actions.includes("reopen") && (
        <ConfirmActionButton
          title={t("Reopen the assignment?")}
          description={t("Students can hand in work again.")}
          confirmLabel={t("Reopen")}
          successMessage={t("Assignment reopened.")}
          action={run("reopen")}
        >
          <LockOpenIcon aria-hidden /> {t("Reopen")}
        </ConfirmActionButton>
      )}
      {actions.includes("archive") && (
        <ConfirmActionButton
          title={t("Archive the assignment?")}
          description={t("It disappears from students' and parents' lists. Submissions and grades are kept, and you can restore it.")}
          confirmLabel={t("Archive")}
          successMessage={t("Assignment archived.")}
          action={run("archive")}
        >
          <ArchiveIcon aria-hidden /> {t("Archive")}
        </ConfirmActionButton>
      )}
      {actions.includes("restore") && (
        <ConfirmActionButton
          title={t("Restore the assignment?")}
          description={t("It comes back as closed (if students saw it before) or as a draft.")}
          confirmLabel={t("Restore")}
          successMessage={t("Assignment restored.")}
          action={run("restore")}
        >
          <ArchiveRestoreIcon aria-hidden /> {t("Restore")}
        </ConfirmActionButton>
      )}
      {canDelete && (
        <ConfirmActionButton
          variant="ghost"
          title={t("Delete this draft?")}
          description={t("The draft, its questions and attachments are deleted permanently.")}
          confirmLabel={t("Delete")}
          successMessage={t("Draft deleted.")}
          destructive
          action={deleteDraftAction.bind(null, { assignmentId })}
        >
          <Trash2Icon aria-hidden /> {t("Delete draft")}
        </ConfirmActionButton>
      )}
    </div>
  )
}

function ScheduleDialog({ assignmentId, publishAt, rescheduling }: { assignmentId: string; publishAt: string | null; rescheduling: boolean }) {
  const t = useT()
  const [value, setValue] = useState(isoToAcademyInput(publishAt))
  return (
    <ActionDialog
      trigger={
        <Button variant="outline">
          <ClockIcon aria-hidden /> {rescheduling ? t("Reschedule") : t("Schedule")}
        </Button>
      }
      title={rescheduling ? t("Change the publication time") : t("Schedule publication")}
      description={t("The assignment becomes visible to students at this time (Vietnam time).")}
      submitLabel={t("Schedule")}
      successMessage={t("Publication scheduled.")}
      onOpen={() => setValue(isoToAcademyInput(publishAt))}
      onSubmit={() => changeAssignmentStatusAction({ assignmentId, action: "schedule", publishAt: value })}
    >
      <Field id="publish-at" label={t("Publish at")}>
        <Input id="publish-at" type="datetime-local" value={value} onChange={(e) => setValue(e.target.value)} required />
      </Field>
    </ActionDialog>
  )
}
