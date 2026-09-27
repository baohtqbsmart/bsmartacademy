import {
  ArchiveIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CircleDotIcon,
  ClockIcon,
  FilePenLineIcon,
  LockIcon,
  MailCheckIcon,
  SendIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  ASSIGNMENT_STATUS_LABELS,
  WORK_STATUS_LABELS,
  type AssignmentStatus,
  type WorkStatus,
} from "@/features/assignments/status"
import { cn } from "@/lib/utils"
import { getT } from "@/i18n/server"

// Status palette (good / warning / critical), always icon + label.
const GOOD = "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]"
const WARNING = "border-transparent bg-[#fab219]/20 text-foreground"
const CRITICAL = "border-transparent bg-[#d03b3b]/12 text-[#b02a2a] dark:text-[#ef7b7b]"

const ASSIGNMENT: Record<AssignmentStatus, { icon: LucideIcon; className: string }> = {
  draft: { icon: FilePenLineIcon, className: "text-muted-foreground" },
  scheduled: { icon: ClockIcon, className: "text-foreground" },
  published: { icon: SendIcon, className: GOOD },
  closed: { icon: LockIcon, className: "text-foreground" },
  archived: { icon: ArchiveIcon, className: "text-muted-foreground" },
}

export async function AssignmentStatusBadge({ status }: { status: AssignmentStatus }) {
  const t = await getT()
  const { icon: Icon, className } = ASSIGNMENT[status]
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <Icon className="size-3" aria-hidden />
      {t(ASSIGNMENT_STATUS_LABELS[status])}
    </Badge>
  )
}

const WORK: Record<WorkStatus, { icon: LucideIcon; className: string }> = {
  not_started: { icon: CircleDashedIcon, className: "text-foreground" },
  missing: { icon: CircleAlertIcon, className: CRITICAL },
  in_progress: { icon: CircleDotIcon, className: "text-foreground" },
  submitted: { icon: CircleCheckIcon, className: GOOD },
  late: { icon: ClockIcon, className: WARNING },
  graded: { icon: CircleCheckIcon, className: "text-foreground" },
  returned: { icon: MailCheckIcon, className: GOOD },
}

export async function WorkStatusBadge({ status }: { status: WorkStatus }) {
  const t = await getT()
  const { icon: Icon, className } = WORK[status]
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <Icon className="size-3" aria-hidden />
      {t(WORK_STATUS_LABELS[status])}
    </Badge>
  )
}
