import { BanIcon, CircleAlertIcon, CircleCheckIcon, CircleDashedIcon, CircleDotIcon, type LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Status = "paid" | "partially_paid" | "unpaid" | "overdue" | "void" | "cancelled" | "voided" | "completed"

const STATUS: Record<Status, { label: string; icon: LucideIcon; className: string }> = {
  paid: { label: "Paid", icon: CircleCheckIcon, className: "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]" },
  completed: { label: "Completed", icon: CircleCheckIcon, className: "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]" },
  partially_paid: { label: "Partially paid", icon: CircleDotIcon, className: "border-transparent bg-[#fab219]/20 text-foreground" },
  unpaid: { label: "Unpaid", icon: CircleDashedIcon, className: "text-foreground" },
  overdue: { label: "Overdue", icon: CircleAlertIcon, className: "border-transparent bg-[#d03b3b]/12 text-[#b02a2a] dark:text-[#ef7b7b]" },
  void: { label: "Void", icon: BanIcon, className: "text-muted-foreground" },
  voided: { label: "Voided", icon: BanIcon, className: "text-muted-foreground" },
  cancelled: { label: "Cancelled", icon: BanIcon, className: "text-muted-foreground" },
}

/** Status is always icon + label, never colour alone (status palette: good/warning/critical). */
export function PaymentStatusBadge({ status }: { status: string }) {
  const config = STATUS[status as Status] ?? STATUS.unpaid
  const Icon = config.icon
  return (
    <Badge variant="outline" className={cn("gap-1", config.className)}>
      <Icon className="size-3" aria-hidden />
      {config.label}
    </Badge>
  )
}
