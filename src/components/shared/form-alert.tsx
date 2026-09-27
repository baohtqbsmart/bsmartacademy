import { CircleAlertIcon, CircleCheckIcon } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"

type FormAlertProps = {
  message: string | null | undefined
  variant?: "error" | "success"
}

/** Form-level feedback (errors not tied to a single field, or success notes). */
export function FormAlert({ message, variant = "error" }: FormAlertProps) {
  if (!message) return null
  const Icon = variant === "error" ? CircleAlertIcon : CircleCheckIcon
  return (
    <Alert variant={variant === "error" ? "destructive" : "default"} role="alert">
      <Icon />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  )
}
