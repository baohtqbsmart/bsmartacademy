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
import { useT } from "@/i18n/client"

export function TaskControls({ taskId, status, closed, publishedBefore }: { taskId: string; status: string; closed: boolean; publishedBefore: boolean }) {
  const t = useT()
  const run = (action: string) => taskAction.bind(null, { taskId, action })
  return (
    <div className="flex flex-wrap gap-2">
      {status === "draft" && (
        <ConfirmActionButton variant="default" title={t("Publish the task?")} description={t("Students in the class can see it and hand in work.")} confirmLabel={t("Publish")} successMessage={t("Task published.")} action={run("publish")}>
          <SendIcon aria-hidden /> {t("Publish")}
        </ConfirmActionButton>
      )}
      {status === "published" && !closed && (
        <ConfirmActionButton title={t("Close the task?")} description={t("Students can no longer hand in work. You can reopen it.")} confirmLabel={t("Close")} successMessage={t("Task closed.")} action={run("close")}>
          <LockIcon aria-hidden /> {t("Close")}
        </ConfirmActionButton>
      )}
      {status === "published" && closed && (
        <ConfirmActionButton title={t("Reopen the task?")} description={t("Students can hand in work again.")} confirmLabel={t("Reopen")} successMessage={t("Task reopened.")} action={run("reopen")}>
          <LockOpenIcon aria-hidden /> {t("Reopen")}
        </ConfirmActionButton>
      )}
      {status !== "archived" && publishedBefore && (
        <ConfirmActionButton title={t("Archive the task?")} description={t("It disappears from students' lists; all work and grades are kept.")} confirmLabel={t("Archive")} successMessage={t("Task archived.")} action={run("archive")}>
          <ArchiveIcon aria-hidden /> {t("Archive")}
        </ConfirmActionButton>
      )}
      {status === "archived" && (
        <ConfirmActionButton title={t("Restore the task?")} description={t("It becomes visible again.")} confirmLabel={t("Restore")} successMessage={t("Task restored.")} action={run("restore")}>
          <ArchiveRestoreIcon aria-hidden /> {t("Restore")}
        </ConfirmActionButton>
      )}
      {status === "draft" && !publishedBefore && (
        <ConfirmActionButton variant="ghost" title={t("Delete this draft?")} description={t("It is deleted permanently.")} confirmLabel={t("Delete")} successMessage={t("Draft deleted.")} destructive action={deleteTaskAction.bind(null, { taskId })}>
          <Trash2Icon aria-hidden /> {t("Delete draft")}
        </ConfirmActionButton>
      )}
    </div>
  )
}

type CommentValues = { commentId?: string; kind: "" | AssessmentKind; category: AnnotationCategory; body: string; shared: boolean }

export function CommentDialog({ initial }: { initial?: CommentValues }) {
  const t = useT()
  const empty: CommentValues = { kind: "", category: "grammar", body: "", shared: false }
  const [v, setV] = useState<CommentValues>(initial ?? empty)
  const set = <K extends keyof CommentValues>(key: K, value: CommentValues[K]) => setV((c) => ({ ...c, [key]: value }))
  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={t("Edit comment")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden /> {t("New comment")}
          </Button>
        )
      }
      title={initial ? t("Edit reusable comment") : t("New reusable comment")}
      submitLabel={t("Save")}
      successMessage={t("Comment saved.")}
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => saveCommentAction(v)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rc-kind" label={t("For")}>
          <OptionSelect
            id="rc-kind"
            value={v.kind || "any"}
            onChange={(value) => set("kind", value === "any" ? "" : (value as AssessmentKind))}
            options={[
              { id: "any", label: "Writing and speaking" },
              { id: "writing", label: "Writing" },
              { id: "speaking", label: "Speaking" },
            ]}
            placeholder={t("For")}
          />
        </Field>
        <Field id="rc-cat" label={t("Category")}>
          <OptionSelect id="rc-cat" value={v.category} onChange={(value) => set("category", value as AnnotationCategory)} options={CATEGORIES.map((c) => ({ id: c, label: CATEGORY_LABELS[c] }))} placeholder={t("Category")} />
        </Field>
      </div>
      <Field id="rc-body" label={t("Comment")}>
        <Textarea id="rc-body" rows={3} maxLength={1000} value={v.body} onChange={(e) => set("body", e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={v.shared} onCheckedChange={(checked) => set("shared", checked === true)} /> {t("Share with other teachers")}
      </label>
    </ActionDialog>
  )
}

export function DeleteCommentButton({ commentId }: { commentId: string }) {
  const t = useT()
  return (
    <ConfirmActionButton variant="ghost" size="icon" aria-label={t("Delete comment")} title={t("Delete this comment?")} description={t("Comments already given to students are not affected.")} confirmLabel={t("Delete")} successMessage={t("Comment deleted.")} destructive action={deleteCommentAction.bind(null, { commentId })}>
      <Trash2Icon />
    </ConfirmActionButton>
  )
}
