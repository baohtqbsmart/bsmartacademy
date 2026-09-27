"use client"

import { KeyRoundIcon, LogOutIcon, UserRoundIcon } from "lucide-react"
import Link from "next/link"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { routes } from "@/config/routes"
import { signOutAction } from "@/features/auth/actions"
import { useT } from "@/i18n/client"

type UserMenuProps = {
  name: string
  email: string
  roleLabel: string
  avatarUrl: string | null
}

export function UserMenu({ name, email, roleLabel, avatarUrl }: UserMenuProps) {
  const t = useT()
  const displayName = name || email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto gap-2 rounded-full px-1 py-1 md:pr-3" aria-label={t("Open user menu")}>
          <UserAvatar name={displayName} avatarUrl={avatarUrl} className="size-8" />
          <span className="hidden text-left leading-tight md:grid">
            <span className="max-w-40 truncate text-sm font-medium">{displayName}</span>
            <span className="text-muted-foreground text-xs font-normal">{t(roleLabel)}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
          <p className="text-muted-foreground text-xs">{roleLabel}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.profile}>
            <UserRoundIcon aria-hidden />
            {t("My profile")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={routes.setPassword}>
            <KeyRoundIcon aria-hidden />
            {t("Change password")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOutIcon aria-hidden />
              {t("Sign out")}
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
