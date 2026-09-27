import { ArchiveIcon, FilePenLineIcon, LockIcon, SendIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { TEST_STATUS_LABELS, type TestStatus } from "@/features/tests/questions"
import { cn } from "@/lib/utils"

const STATUS: Record<TestStatus, { icon: LucideIcon; className: string }> = {
  draft: { icon: FilePenLineIcon, className: "text-muted-foreground" },
  published: { icon: SendIcon, className: "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]" },
  closed: { icon: LockIcon, className: "text-foreground" },
  archived: { icon: ArchiveIcon, className: "text-muted-foreground" },
}

export function TestStatusBadge({ status }: { status: TestStatus }) {
  const { icon: Icon, className } = STATUS[status]
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <Icon className="size-3" aria-hidden />
      {TEST_STATUS_LABELS[status]}
    </Badge>
  )
}

export function AttemptStatusText({ status, score, total }: { status: string; score: number | null; total: number }) {
  if (status === "in_progress") return <span className="text-muted-foreground">In progress</span>
  if (status === "submitted") return <span className="text-muted-foreground">Waiting for marking</span>
  return <span className="font-medium tabular-nums">{`${Number(score ?? 0)} / ${Number(total)}`}</span>
}
