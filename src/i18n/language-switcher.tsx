"use client"

import { LanguagesIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { setLocaleAction } from "@/i18n/actions"
import { useLocale, useT } from "@/i18n/client"
import { isLocale, localeNames, locales } from "@/i18n/config"
import { cn } from "@/lib/utils"

/** Interface-language picker (Settings and the sign-in page). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const t = useT()
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()

  return (
    <Select
      value={locale}
      disabled={isPending}
      onValueChange={(value) => {
        if (!isLocale(value) || value === locale) return
        startTransition(async () => {
          const result = await setLocaleAction({ locale: value })
          if (!result.ok) toast.error(result.error.message)
        })
      }}
    >
      <SelectTrigger className={cn("w-44", className)} aria-label={t("Language")}>
        <LanguagesIcon aria-hidden className="text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {locales.map((code) => (
          <SelectItem key={code} value={code} lang={code}>
            {localeNames[code]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
