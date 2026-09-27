"use client"

import { KeyRoundIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { setUserPermissionAction } from "@/features/users/actions"

type UserGrantsDialogProps = {
  userId: string
  userName: string
  /** Permissions the current user holds at scope "all" (only those can be granted). */
  grantable: { code: string; description: string }[]
  granted: string[]
}

/**
 * Individual access on top of the user's role, e.g. finance access for one
 * teacher. The database refuses grants the current user does not hold.
 */
export function UserGrantsDialog({ userId, userName, grantable, granted }: UserGrantsDialogProps) {
  const [selected, setSelected] = useState<string[]>(granted)

  async function save() {
    const changes = grantable
      .map((p) => p.code)
      .filter((code) => selected.includes(code) !== granted.includes(code))
    for (const permission of changes) {
      const result = await setUserPermissionAction({ userId, permission, granted: selected.includes(permission) })
      if (!result.ok) return result
    }
    return { ok: true as const, data: undefined }
  }

  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          <KeyRoundIcon aria-hidden /> Extra access{granted.length > 0 ? ` (${granted.length})` : ""}
        </Button>
      }
      title={`Extra access for ${userName}`}
      description="Granted in addition to their role, for the whole academy. Use sparingly, e.g. finance access for one teacher."
      submitLabel="Save access"
      successMessage="Access updated."
      onOpen={() => setSelected(granted)}
      onSubmit={save}
    >
      <fieldset className="grid max-h-80 gap-2 overflow-y-auto">
        <legend className="sr-only">Permissions</legend>
        {grantable.map((permission) => (
          <div key={permission.code} className="flex items-start gap-2">
            <Checkbox
              id={`grant-${userId}-${permission.code}`}
              checked={selected.includes(permission.code)}
              onCheckedChange={(checked) =>
                setSelected((current) =>
                  checked === true ? [...current, permission.code] : current.filter((c) => c !== permission.code)
                )
              }
            />
            <Label htmlFor={`grant-${userId}-${permission.code}`} className="grid gap-0.5 font-normal">
              <span>{permission.description}</span>
              <span className="text-muted-foreground font-mono text-xs">{permission.code}</span>
            </Label>
          </div>
        ))}
      </fieldset>
    </ActionDialog>
  )
}
