"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { setUserActiveAction, setUserRoleAction } from "@/features/users/actions"
import { useT } from "@/i18n/client"

type UserAccessControlsProps = {
  userId: string
  userName: string
  roleCode: string
  isActive: boolean
  /** Roles the current user may assign (already filtered by rank). */
  assignableRoles: { code: string; name: string }[]
}

/**
 * Role and activation controls for one account. Only rendered for accounts
 * the current user may manage; the database re-checks every change.
 */
export function UserAccessControls({
  userId,
  userName,
  roleCode,
  isActive,
  assignableRoles,
}: UserAccessControlsProps) {
  const t = useT()
  const [isPending, startTransition] = useTransition()

  function changeRole(nextRole: string) {
    if (nextRole === roleCode) return
    startTransition(async () => {
      const result = await setUserRoleAction({ userId, roleCode: nextRole })
      if (result.ok) toast.success(t("Updated {userName}'s role.", { userName }))
      else toast.error(result.error.message)
    })
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setUserActiveAction({ userId, active: !isActive })
      if (result.ok) toast.success(t("{value} {userName}.", { value: isActive ? "Deactivated" : "Reactivated", userName }))
      else toast.error(result.error.message)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={roleCode} onValueChange={changeRole} disabled={isPending}>
        <SelectTrigger size="sm" className="w-44" aria-label={t("Role for {userName}", { userName })}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {assignableRoles.map((role) => (
            <SelectItem key={role.code} value={role.code}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant={isActive ? "outline" : "default"}
        size="sm"
        disabled={isPending}
        onClick={toggleActive}
      >
        {isActive ? t("Deactivate") : t("Reactivate")}
      </Button>
    </div>
  )
}
