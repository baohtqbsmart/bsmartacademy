"use client"

import type { Control, FieldPath, FieldValues } from "react-hook-form"

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useT } from "@/i18n/client"

// Thin React Hook Form field components used by the module forms.

type BaseProps<T extends FieldValues, TTransformed> = {
  control: Control<T, unknown, TTransformed>
  name: FieldPath<T>
  label: string
  className?: string
}

export function TextField<T extends FieldValues, TTransformed>({
  control,
  name,
  label,
  className,
  ...inputProps
}: BaseProps<T, TTransformed> & Omit<React.ComponentProps<typeof Input>, "name">) {
  const t = useT()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{t(label)}</FormLabel>
          <FormControl>
            <Input {...inputProps} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

export function TextareaField<T extends FieldValues, TTransformed>({
  control,
  name,
  label,
  className,
  rows = 4,
}: BaseProps<T, TTransformed> & { rows?: number }) {
  const t = useT()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{t(label)}</FormLabel>
          <FormControl>
            <Textarea rows={rows} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

const NONE = "__none"

/** Select bound to a string field; `optional` adds a "Not set" choice stored as "". */
export function SelectField<T extends FieldValues, TTransformed>({
  control,
  name,
  label,
  className,
  options,
  optional,
  placeholder = "Choose…",
}: BaseProps<T, TTransformed> & {
  options: { value: string; label: string }[]
  optional?: boolean
  placeholder?: string
}) {
  const t = useT()
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>{t(label)}</FormLabel>
          <Select
            value={field.value ? String(field.value) : optional ? NONE : ""}
            onValueChange={(value) => field.onChange(value === NONE ? "" : value)}
          >
            <FormControl>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t(placeholder)} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {optional && <SelectItem value={NONE}>{t("Not set")}</SelectItem>}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {t(option.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}
