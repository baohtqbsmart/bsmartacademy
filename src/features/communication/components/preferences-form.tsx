"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { preferenceAction } from "@/features/communication/actions"
import { KIND_INFO, NOTIFICATION_KINDS } from "@/features/communication/schemas"

type Kind = (typeof NOTIFICATION_KINDS)[number]

export function PreferencesForm({ initial, kinds }: { initial: Record<string, boolean>; kinds: Kind[] }) {
  const [enabled, setEnabled] = useState(initial)
  const [isPending, startTransition] = useTransition()

  function toggle(kind: Kind, on: boolean) {
    setEnabled((e) => ({ ...e, [kind]: on }))
    startTransition(async () => {
      const result = await preferenceAction({ kind, enabled: on })
      if (result.ok) toast.success(`${KIND_INFO[kind].label}: ${on ? "on" : "off"}`)
      else {
        setEnabled((e) => ({ ...e, [kind]: !on }))
        toast.error(result.error.message)
      }
    })
  }

  return (
    <ul className="grid gap-3">
      {kinds.map((kind) => (
        <li key={kind}>
          <label className="flex items-start gap-3 rounded-lg border p-3">
            <Checkbox
              className="mt-0.5"
              checked={kind === "system" ? true : enabled[kind] !== false}
              disabled={kind === "system" || isPending}
              onCheckedChange={(v) => toggle(kind, v === true)}
            />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">{KIND_INFO[kind].label}</span>
              <span className="text-muted-foreground text-xs">{KIND_INFO[kind].description}</span>
            </span>
          </label>
        </li>
      ))}
    </ul>
  )
}
