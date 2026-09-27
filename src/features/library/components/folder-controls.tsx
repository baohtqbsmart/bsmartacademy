"use client"

import { FolderPlusIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteFolderAction, saveFolderAction } from "@/features/library/actions"

const ROOT = "__root"

type Scope = "personal" | "academy"

/** New folder (or rename/move an existing one). `parents` are the allowed places. */
export function FolderDialog({
  scope,
  parents,
  initial,
  canManageAcademy,
}: {
  scope: Scope
  parents: { id: string; path: string; scope: Scope }[]
  initial?: { folderId: string; name: string; parentId: string | null }
  canManageAcademy: boolean
}) {
  const empty = { name: "", parentId: ROOT, scope }
  const start = initial ? { name: initial.name, parentId: initial.parentId ?? ROOT, scope } : empty
  const [v, setV] = useState(start)
  const places = parents.filter((p) => p.scope === v.scope)
  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Rename or move ${initial.name}`} title="Rename or move">
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full">
            <FolderPlusIcon aria-hidden /> New folder
          </Button>
        )
      }
      title={initial ? "Rename or move folder" : "New folder"}
      submitLabel="Save"
      successMessage={initial ? "Folder saved." : "Folder created."}
      onOpen={() => setV(start)}
      onSubmit={() => saveFolderAction({ folderId: initial?.folderId, scope: v.scope, parentId: v.parentId === ROOT ? "" : v.parentId, name: v.name })}
    >
      {!initial && canManageAcademy && (
        <Field id="f-scope" label="Library">
          <OptionSelect
            id="f-scope"
            value={v.scope}
            onChange={(value) => setV((c) => ({ ...c, scope: value as Scope, parentId: ROOT }))}
            options={[
              { id: "personal", label: "My materials" },
              { id: "academy", label: "Academy library" },
            ]}
            placeholder="Library"
          />
        </Field>
      )}
      <Field id="f-name" label="Name">
        <Input id="f-name" maxLength={100} value={v.name} onChange={(e) => setV((c) => ({ ...c, name: e.target.value }))} />
      </Field>
      <Field id="f-parent" label="Inside">
        <OptionSelect
          id="f-parent"
          value={v.parentId}
          onChange={(value) => setV((c) => ({ ...c, parentId: value }))}
          options={[{ id: ROOT, label: "Top level" }, ...places.map((p) => ({ id: p.id, label: p.path }))]}
          placeholder="Inside"
        />
      </Field>
      <p className="text-muted-foreground text-xs">Folders can be nested up to five levels.</p>
    </ActionDialog>
  )
}

export function DeleteFolderButton({ folderId, name }: { folderId: string; name: string }) {
  return (
    <ConfirmActionButton
      variant="ghost"
      size="icon"
      aria-label={`Delete ${name}`}
      title="Delete this folder?"
      description="Its sub-folders are deleted too. Materials inside are kept and move to “No folder”."
      confirmLabel="Delete folder"
      successMessage="Folder deleted."
      destructive
      action={deleteFolderAction.bind(null, { folderId })}
    >
      <Trash2Icon />
    </ConfirmActionButton>
  )
}
