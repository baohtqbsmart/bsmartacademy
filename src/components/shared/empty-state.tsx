import type { LucideIcon } from "lucide-react"

type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
      <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-full">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="grid gap-1">
        <p className="text-foreground font-medium">{title}</p>
        {description && <p className="text-muted-foreground max-w-md text-sm">{description}</p>}
      </div>
      {action}
    </div>
  )
}
