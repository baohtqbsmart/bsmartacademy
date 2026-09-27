"use client"

import { Loader2Icon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import type { ActionResult } from "@/lib/action-result"

type ConfirmActionButtonProps = {
  /** A (bound) Server Action. */
  action: () => Promise<ActionResult<unknown>>
  title: string
  description: string
  confirmLabel: string
  successMessage: string
  destructive?: boolean
  children: React.ReactNode
} & Pick<React.ComponentProps<typeof Button>, "variant" | "size" | "aria-label">

/** A button that asks for confirmation, runs a Server Action and reports the result. */
export function ConfirmActionButton({
  action,
  title,
  description,
  confirmLabel,
  successMessage,
  destructive,
  children,
  variant = "outline",
  size = "sm",
  "aria-label": ariaLabel,
}: ConfirmActionButtonProps) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function confirm() {
    startTransition(async () => {
      const result = await action()
      if (result.ok) {
        toast.success(successMessage)
        setOpen(false)
      } else {
        toast.error(result.error.message)
      }
    })
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant={variant} size={size} aria-label={ariaLabel}>
          {children}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <Button variant={destructive ? "destructive" : "default"} onClick={confirm} disabled={isPending}>
            {isPending && <Loader2Icon className="animate-spin" aria-hidden />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
