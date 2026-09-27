"use client"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ENGLISH_FRAMEWORK_LABELS } from "@/config/labels"
import type { Enums } from "@/types/database"

export type EnglishLevelOption = {
  code: string
  name: string
  framework: Enums<"english_framework">
  cefr: string | null
}

const NONE = "none"

type EnglishLevelSelectProps = {
  id?: string
  value: string
  onChange: (value: string) => void
  levels: EnglishLevelOption[]
  placeholder: string
}

/** Levels grouped by framework (CEFR, Pre-IELTS, IELTS, Cambridge). "" means none. */
export function EnglishLevelSelect({ id, value, onChange, levels, placeholder }: EnglishLevelSelectProps) {
  const frameworks = Object.keys(ENGLISH_FRAMEWORK_LABELS) as Enums<"english_framework">[]
  return (
    <Select value={value || NONE} onValueChange={(next) => onChange(next === NONE ? "" : next)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not set</SelectItem>
        {frameworks.map((framework) => (
          <SelectGroup key={framework}>
            <SelectLabel>{ENGLISH_FRAMEWORK_LABELS[framework]}</SelectLabel>
            {levels
              .filter((level) => level.framework === framework)
              .map((level) => (
                <SelectItem key={level.code} value={level.code}>
                  {level.name}
                  {level.cefr && level.framework !== "cefr" && (
                    <span className="text-muted-foreground ml-1 text-xs">≈ {level.cefr}</span>
                  )}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
