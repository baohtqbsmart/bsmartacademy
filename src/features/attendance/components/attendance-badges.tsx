import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleMinusIcon,
  CircleXIcon,
  ClockIcon,
  MonitorIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import type { AlertLevel, AttendanceStatus } from "@/features/attendance/summary"
import { cn } from "@/lib/utils"
import { Trans } from "@/i18n/client"

// Status palette (good / warning / critical), always with an icon and a
// label, never colour alone.
const GOOD = "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]"
const WARNING = "border-transparent bg-[#fab219]/20 text-foreground"
const CRITICAL = "border-transparent bg-[#d03b3b]/12 text-[#b02a2a] dark:text-[#ef7b7b]"

export const ATTENDANCE_STATUS: Record<AttendanceStatus, { label: string; icon: LucideIcon; className: string }> = {
  present: { label: "Present", icon: CircleCheckIcon, className: GOOD },
  late: { label: "Late", icon: ClockIcon, className: WARNING },
  absent: { label: "Absent", icon: CircleXIcon, className: CRITICAL },
  excused: { label: "Excused", icon: CircleMinusIcon, className: "text-muted-foreground" },
}

export function AttendanceStatusBadge({
  status,
  minutesLate,
  online,
}: {
  status: AttendanceStatus
  minutesLate?: number | null
  online?: boolean
}) {
  const config = ATTENDANCE_STATUS[status]
  const Icon = config.icon
  return (
    <span className="inline-flex items-center gap-1">
      <Badge variant="outline" className={cn("gap-1", config.className)}>
        <Icon className="size-3" aria-hidden />
        <Trans>{config.label}</Trans>
        {status === "late" && minutesLate ? (
          <>
            {" · "}
            <Trans values={{ minutes: minutesLate }}>{"{minutes} min"}</Trans>
          </>
        ) : null}
      </Badge>
      {online && (
        <Badge variant="outline" className="text-muted-foreground gap-1">
          <MonitorIcon className="size-3" aria-hidden /> <Trans>{"Online"}</Trans>
        </Badge>
      )}
    </span>
  )
}

export const ALERT_LEVEL: Record<AlertLevel, { label: string; icon: LucideIcon; className: string }> = {
  serious: { label: "Needs follow-up", icon: CircleAlertIcon, className: CRITICAL },
  warning: { label: "Watch", icon: TriangleAlertIcon, className: WARNING },
}

export function AbsenceAlertBadge({ level, title }: { level: AlertLevel; title?: string }) {
  const config = ALERT_LEVEL[level]
  const Icon = config.icon
  return (
    <Badge variant="outline" className={cn("gap-1", config.className)} title={title}>
      <Icon className="size-3" aria-hidden />
      <Trans>{config.label}</Trans>
    </Badge>
  )
}
