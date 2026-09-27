"use client"

import { ArchiveIcon, ArchiveRestoreIcon, LockIcon, LockOpenIcon, PencilIcon, PlusIcon, SendIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { deleteCommentAction, deleteTaskAction, saveCommentAction, taskAction } from "@/features/assessments/actions"
import { CATEGORIES, CATEGORY_LABELS, type AnnotationCategory, type AssessmentKind } from "@/features/assessments/scoring"

export function TaskControls({ taskId, status, closed, publishedBefore }: { taskId: string; status: string; closed: boolean; publishedBefore: boolean }) {
  const run = (action: string) => taskAction.bind(null, { taskId, action })
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <ConfirmActionButton variant="default" title="Publish the task?" description="Students in the class can see it and hand in work." confirmLabel="Publish" successMessage="Task published." action={run("publish")}>
          <SendIcon aria-hidden /> Publish
        </ConfirmActionButton>
      )}
      {status === "published" && !closed && (
        <ConfirmActionButton title="Close the task?" description="Students can no longer hand in work. You can reopen it." confirmLabel="Close" successMessage="Task closed." action={run("close")}>
          <LockIcon aria-hidden /> Close
        </ConfirmActionButton>
      )}
      {status === "published" && closed && (
        <ConfirmActionButton title="Reopen the task?" description="Students can hand in work again." confirmLabel="Reopen" successMessage="Task reopened." action={run("reopen")}>
          <LockOpenIcon aria-hidden /> Reopen
        </ConfirmActionButton>
      )}
      {status !== "archived" && publishedBefore && (
        <ConfirmActionButton title="Archive the task?" description="It disappears from students' lists; all work and grades are kept." confirmLabel="Archive" successMessage="Task archived." action={run("archive")}>
          <ArchiveIcon aria-hidden /> Archive
        </ConfirmActionButton>
      )}
      {status === "archived" && (
        <ConfirmActionButton title="Restore the task?" description="It becomes visible again." confirmLabel="Restore" successMessage="Task restored." action={run("restore")}>
          <ArchiveRestoreIcon aria-hidden /> Restore
        </ConfirmActionButton>
      )}
      {status === "draft" && !publishedBefore && (
        <ConfirmActionButton variant="ghost" title="Delete this draft?" description="It is deleted permanently." confirmLabel="Delete" successMessage="Draft deleted." destructive action={deleteTaskAction.bind(null, { taskId })}>
          <Trash2Icon aria-hidden /> Delete draft
        </ConfirmActionButton>
      )}
    </div>
  )
}

type CommentValues = { commentId?: string; kind: "" | AssessmentKind; category: AnnotationCategory; body: string; shared: boolean }

export function CommentDialog({ initial }: { initial?: CommentValues }) {
  const empty: CommentValues = { kind: "", category: "grammar", body: "", shared: false }
  const [v, setV] = useState<CommentValues>(initial ?? empty)
  const set = <K extends keyof CommentValues>(key: K, value: CommentValues[K]) => setV((c) => ({ ...c, [key]: value }))
  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label="Edit comment">
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden /> New comment
          </Button>
        )
      }
      title={initial ? "Edit reusable comment" : "New reusable comment"}
      submitLabel="Save"
      successMessage="Comment saved."
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => saveCommentAction(v)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rc-kind" label="For">
          <OptionSelect
            id="rc-kind"
            value={v.kind || "any"}
            onChange={(value) => set("kind", value === "any" ? "" : (value as AssessmentKind))}
            options={[
              { id: "any", label: "Writing and speaking" },
              { id: "writing", label: "Writing" },
              { id: "speaking", label: "Speaking" },
            ]}
            placeholder="For"
          />
        </Field>
        <Field id="rc-cat" label="Category">
          <OptionSelect id="rc-cat" value={v.category} onChange={(value) => set("category", value as AnnotationCategory)} options={CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))} placeholder="Category" />
        </Field>
      </div>
      <Field id="rc-body" label="Comment">
        <Textarea id="rc-body" rows={3} maxLength={1000} value={v.body} onChange={(e) => set("body", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={v.shared} onCheckedChange={(checked) => set("shared", checked === true)} /> Share with other teachers
      </label>
    </ActionDialog>
  )
}

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  return (
    <ConfirmActionButton variant="ghost" size="icon" aria-label="Delete comment" title="Delete this comment?" description="Comments already given to students are not affected." confirmLabel="Delete" successMessage="Comment deleted." destructive action={deleteCommentAction.bind(null, { commentId })}>
      <Trash2Icon />
    </ConfirmActionButton>
  )
}
