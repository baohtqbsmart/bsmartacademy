"use client"

import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/i18n/client"

export type Option = { id: string; label: string }

/** Labelled field wrapper for small dialog forms. */
export function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t(label)}</Label>
      {children}
    </div>
  )
}

export function OptionSelect({
  id,
  value,
  onChange,
  options,
  placeholder,
  disabled,
  ariaLabel,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder: string
  disabled?: boolean
  /** Accessible name when there is no visible <Label htmlFor={id}>. */
  ariaLabel?: string
}) {
  const t = useT()
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-label={ariaLabel}>
        <SelectValue placeholder={options.length === 0 ? t("Nothing available") : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {t(option.label)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
