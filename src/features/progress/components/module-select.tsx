"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { setWorkUnitAction } from "@/features/progress/actions"
import { useT } from "@/i18n/client"

const NONE = "none"

/** Which module of the course an assignment or test belongs to (editors). */
export function ModuleSelect({
  kind,
  id,
  unitId,
  units,
}: {
  kind: "assignment" | "test"
  id: string
  unitId: string | null
  units: { id: string; title: string }[]
}) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{t("Module")}</span>
      <Select
        value={unitId ?? NONE}
        disabled={isPending}
        onValueChange={(value) =>
          startTransition(async () => {
            const result = await setWorkUnitAction({
              kind,
              id,
              unitId: value === NONE ? null : value,
            })
            if (result.ok) toast.success(t("Module saved."))
            else toast.error(result.error.message)
          })
        }
      >
        <SelectTrigger className="w-64" aria-label={t("Module")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t("No module")}</SelectItem>
          {units.map((u, i) => (
            <SelectItem key={u.id} value={u.id}>
              {i + 1}. {u.title}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
