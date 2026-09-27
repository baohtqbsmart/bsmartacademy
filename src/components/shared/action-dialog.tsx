"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { ActionResult } from "@/lib/action-result"
import { useT } from "@/i18n/client"

type ActionDialogProps = {
  trigger: React.ReactNode
  title: string
  description?: string
  submitLabel: string
  successMessage: string
  /** Called on submit; return the Server Action's result. */
  onSubmit: () => Promise<ActionResult<unknown>>
  /** Called when the dialog opens, to reset field state. */
  onOpen?: () => void
  children: React.ReactNode
}

/** Small form-in-a-dialog for Server Actions (enrol, link parent, transfer...). */
export function ActionDialog({
  trigger,
  title,
  description,
  submitLabel,
  successMessage,
  onSubmit,
  onOpen,
  children,
}: ActionDialogProps) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setError(null)
      onOpen?.()
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await onSubmit()
      if (result.ok) {
        toast.success(successMessage)
        setOpen(false)
      } else {
        const fieldMessages = Object.values(result.error.fieldErrors ?? {}).flat().filter(Boolean)
        setError(fieldMessages[0] ?? result.error.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <FormAlert message={error} />
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              {t("Cancel")}
            </Button>
            <SubmitButton pending={isPending}>{t(submitLabel)}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
