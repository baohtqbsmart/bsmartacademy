"use client"

import { Loader2Icon, PlayIcon } from "lucide-react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { startSubmissionAction } from "@/features/assignments/actions"
import { useT } from "@/i18n/client"

/** Starts an attempt (the action redirects to the work page). */
export function StartWorkButton({ assignmentId, label }: { assignmentId: string; label: string }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const result = await startSubmissionAction({ assignmentId })
          if (result && !result.ok) toast.error(result.error.message)
        })
      }
    >
      {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <PlayIcon aria-hidden />}
      {t(label)}
    </Button>
  )
}
