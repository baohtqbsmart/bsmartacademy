"use client"

import { PlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect, type Option } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { RELATIONSHIP_LABELS } from "@/config/labels"
import { linkParentAction } from "@/features/students/actions"
import type { Enums } from "@/types/database"
import { useT } from "@/i18n/client"

const RELATIONSHIPS = Object.keys(RELATIONSHIP_LABELS) as Enums<"guardian_relationship">[]

export function LinkParentDialog({ studentId, parents }: { studentId: string; parents: Option[] }) {
  const t = useT()
  const [parentId, setParentId] = useState("")
  const [relationship, setRelationship] = useState<Enums<"guardian_relationship">>("mother")
  const [isPrimaryContact, setIsPrimaryContact] = useState(false)

  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <PlusIcon aria-hidden /> {t("Link parent")}
        </Button>
      }
      title={t("Link a parent")}
      description={t("Choose an existing parent record. Add new parents from the Parents page.")}
      submitLabel={t("Link parent")}
      successMessage={t("Parent linked.")}
      onOpen={() => {
        setParentId("")
        setRelationship("mother")
        setIsPrimaryContact(false)
      }}
      onSubmit={() => linkParentAction({ studentId, parentId, relationship, isPrimaryContact })}
    >
      <Field id="link-parent" label={t("Parent")}>
        <OptionSelect id="link-parent" value={parentId} onChange={setParentId} options={parents} placeholder={t("Choose a parent")} />
      </Field>
      <Field id="link-relationship" label={t("Relationship")}>
        <OptionSelect
          id="link-relationship"
          value={relationship}
          onChange={(value) => setRelationship(value as Enums<"guardian_relationship">)}
          options={RELATIONSHIPS.map((r) => ({ id: r, label: RELATIONSHIP_LABELS[r] }))}
          placeholder={t("Relationship")}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox
          id="link-primary"
          checked={isPrimaryContact}
          onCheckedChange={(checked) => setIsPrimaryContact(checked === true)}
        />
        <Label htmlFor="link-primary" className="font-normal">
          {t("Primary contact")}
        </Label>
      </div>
    </ActionDialog>
  )
}
