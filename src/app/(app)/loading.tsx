import { Skeleton } from "@/components/ui/skeleton"
import { getT } from "@/i18n/server"

export default async function Loading() {
  const t = await getT()
  return (
    <div className="grid gap-6" aria-busy="true" aria-label={t("Loading")}>
      <div className="grid gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <Skeleton className="h-40 w-full max-w-xl" />
    </div>
  )
}
