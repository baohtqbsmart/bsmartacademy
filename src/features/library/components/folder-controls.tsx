"use client"

import { FolderPlusIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { deleteFolderAction, saveFolderAction } from "@/features/library/actions"
import { useT } from "@/i18n/client"

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
  const t = useT()
  const empty = { name: "", parentId: ROOT, scope }
  const start = initial ? { name: initial.name, parentId: initial.parentId ?? ROOT, scope } : empty
  const [v, setV] = useState(start)
  const places = parents.filter((p) => p.scope === v.scope)
  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" className="size-7" aria-label={t("Rename or move {name}", { name: initial.name })} title={t("Rename or move")}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full">
            <FolderPlusIcon aria-hidden /> {t("New folder")}
          </Button>
        )
      }
      title={initial ? t("Rename or move folder") : t("New folder")}
      submitLabel={t("Save")}
      successMessage={initial ? t("Folder saved.") : t("Folder created.")}
      onOpen={() => setV(start)}
      onSubmit={() => saveFolderAction({ folderId: initial?.folderId, scope: v.scope, parentId: v.parentId === ROOT ? "" : v.parentId, name: v.name })}
    >
      {!initial && canManageAcademy && (
        <Field id="f-scope" label={t("Library")}>
          <OptionSelect
            id="f-scope"
            value={v.scope}
            onChange={(value) => setV((c) => ({ ...c, scope: value as Scope, parentId: ROOT }))}
            options={[
              { id: "personal", label: "My materials" },
              { id: "academy", label: "Academy library" },
            ]}
            placeholder={t("Library")}
          />
        </Field>
      )}
      <Field id="f-name" label={t("Name")}>
        <Input id="f-name" maxLength={100} value={v.name} onChange={(e) => setV((c) => ({ ...c, name: e.target.value }))} />
      </Field>
      <Field id="f-parent" label={t("Inside")}>
        <OptionSelect
          id="f-parent"
          value={v.parentId}
          onChange={(value) => setV((c) => ({ ...c, parentId: value }))}
          options={[{ id: ROOT, label: "Top level" }, ...places.map((p) => ({ id: p.id, label: p.path }))]}
          placeholder={t("Inside")}
        />
      </Field>
      <p className="text-muted-foreground text-xs">{t("Folders can be nested up to five levels.")}</p>
    </ActionDialog>
  )
}

export function DeleteFolderButton({ folderId, name }: { folderId: string; name: string }) {
  const t = useT()
  return (
    <ConfirmActionButton
      variant="ghost"
      size="icon"
      aria-label={t("Delete {name}", { name })}
      title={t("Delete this folder?")}
      description={t("Its sub-folders are deleted too. Materials inside are kept and move to “No folder”.")}
      confirmLabel={t("Delete folder")}
      successMessage={t("Folder deleted.")}
      destructive
      action={deleteFolderAction.bind(null, { folderId })}
    >
      <Trash2Icon />
    </ConfirmActionButton>
  )
}
