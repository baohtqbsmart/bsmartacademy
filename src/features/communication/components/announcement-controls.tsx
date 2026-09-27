"use client"

import { ArchiveIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { archiveAnnouncementAction, createAnnouncementAction } from "@/features/communication/actions"
import { AUDIENCE_LABELS, AUDIENCES } from "@/features/communication/schemas"

type Audience = (typeof AUDIENCES)[number]

/** Admins may address anyone; teachers only the classes they teach (the database enforces both). */
export function NewAnnouncementDialog({ allAudiences, classes }: { allAudiences: boolean; classes: { id: string; name: string }[] }) {
  const audiences: Audience[] = allAudiences ? [...AUDIENCES] : ["class"]
  const empty = { audience: audiences[0] === "class" ? "class" : "parents", classId: classes.length === 1 ? classes[0].id : "", title: "", body: "", pinned: false, expiresOn: "" } as {
    audience: Audience
    classId: string
    title: string
    body: string
    pinned: boolean
    expiresOn: string
  }
  const [v, setV] = useState(empty)
  return (
    <ActionDialog
      trigger={
        <Button>
          <PlusIcon aria-hidden /> New announcement
        </Button>
      }
      title="New announcement"
      description="Everyone in the audience is notified straight away."
      submitLabel="Publish"
      successMessage="Announcement published."
      onOpen={() => setV(empty)}
      onSubmit={() => createAnnouncementAction(v)}
    >
      <Field id="an-audience" label="To">
        <OptionSelect id="an-audience" value={v.audience} onChange={(a) => setV((c) => ({ ...c, audience: a as Audience }))} options={audiences.map((a) => ({ id: a, label: AUDIENCE_LABELS[a] }))} placeholder="Audience" />
      </Field>
      {v.audience === "class" && (
        <Field id="an-class" label="Class">
          <OptionSelect id="an-class" value={v.classId} onChange={(classId) => setV((c) => ({ ...c, classId }))} options={classes.map((c) => ({ id: c.id, label: c.name }))} placeholder="Choose a class" />
        </Field>
      )}
      <Field id="an-title" label="Title">
        <Input id="an-title" maxLength={200} value={v.title} onChange={(e) => setV((c) => ({ ...c, title: e.target.value }))} />
      </Field>
      <Field id="an-body" label="Message">
        <Textarea id="an-body" rows={5} maxLength={5000} value={v.body} onChange={(e) => setV((c) => ({ ...c, body: e.target.value }))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="an-expires" label="Show until (optional)">
          <Input id="an-expires" type="date" value={v.expiresOn} onChange={(e) => setV((c) => ({ ...c, expiresOn: e.target.value }))} />
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={v.pinned} onCheckedChange={(p) => setV((c) => ({ ...c, pinned: p === true }))} /> Pin to the top
        </label>
      </div>
    </ActionDialog>
  )
}

export function ArchiveAnnouncementButton({ announcementId }: { announcementId: string }) {
  return (
    <ConfirmActionButton
      variant="ghost"
      size="sm"
      title="Archive this announcement?"
      description="It disappears for its audience. Notifications already sent stay in people's lists."
      confirmLabel="Archive"
      successMessage="Announcement archived."
      action={archiveAnnouncementAction.bind(null, { announcementId })}
    >
      <ArchiveIcon aria-hidden /> Archive
    </ConfirmActionButton>
  )
}
