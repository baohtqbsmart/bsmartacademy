import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function StudentsLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading students">
      <div className="grid gap-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-9 w-36" />
        <Skeleton className="h-9 w-44" />
        <Skeleton className="h-9 w-48" />
      </div>
      <Card className="gap-0 p-0">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-b px-4 py-3 last:border-b-0">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="ml-auto h-4 w-24" />
          </div>
        ))}
      </Card>
    </div>
  )
}
