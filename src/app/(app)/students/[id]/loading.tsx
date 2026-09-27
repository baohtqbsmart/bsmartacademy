import { Skeleton } from "@/components/ui/skeleton"

export default function StudentProfileLoading() {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Loading student">
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="grid gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  )
}
