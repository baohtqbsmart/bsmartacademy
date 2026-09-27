"use client"

import { ClipboardListIcon, PaletteIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { Field, OptionSelect } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { saveAsAssignmentAction, saveAsDesignAction } from "@/features/ai/actions"

/** Saving an approved plan creates private or draft content only; the teacher publishes it later. */
export function SaveToPlatform({ draftId, classes, canDesign, canAssign }: { draftId: string; classes: { id: string; name: string }[]; canDesign: boolean; canAssign: boolean }) {
  const [classId, setClassId] = useState(classes.length === 1 ? classes[0].id : "")
  return (
    <div className="flex flex-wrap gap-2">
      {canDesign && (
        <ConfirmActionButton
          variant="default"
          title="Save as a lesson design?"
          description="Creates a private design in the Lesson designer (slides with the stages, vocabulary, exercises as questions and homework). Only you can see it until you share it."
          confirmLabel="Create design"
          successMessage="Design created."
          action={() => saveAsDesignAction({ draftId })}
        >
          <PaletteIcon aria-hidden /> Save as lesson design
        </ConfirmActionButton>
      )}
      {canAssign && (
        <ActionDialog
          trigger={
            <Button variant="outline" disabled={classes.length === 0}>
              <ClipboardListIcon aria-hidden /> Save homework as a draft assignment
            </Button>
          }
          title="Create a draft homework assignment"
          description="The assignment is created as a DRAFT: students cannot see it. Review it, set the due date and publish it from the assignment page when you are ready."
          submitLabel="Create draft"
          successMessage="Draft assignment created."
          onSubmit={() => saveAsAssignmentAction({ draftId, classId })}
        >
          <Field id="save-class" label="Class">
            <OptionSelect id="save-class" value={classId} onChange={setClassId} options={classes.map((c) => ({ id: c.id, label: c.name }))} placeholder="Choose a class" />
          </Field>
        </ActionDialog>
      )}
    </div>
  )
}
