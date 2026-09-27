import { ChevronRightIcon, LockIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { reportPath, routes } from "@/config/routes"
import { canRunReport, REPORT_KEYS, reportPrivacy, REPORTS } from "@/features/reports/catalog"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Reports" }

export default async function ReportsPage() {
  const user = await requireRouteAccess(routes.reports)
  const available = REPORT_KEYS.filter((k) => canRunReport(user.permissions, k))
  const academyWide = can(user.permissions, "reports.read", ["all"])

  return (
    <>
      <PageHeader
        title="Reports"
        description={academyWide ? "Academy-wide reports. Filter, print or export to CSV." : "Reports on the classes you teach. Filter, print or export to CSV."}
      />
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {available.map((key) => (
          <li key={key}>
            <Link href={reportPath(key)} className="block h-full">
              <Card className="hover:bg-muted/40 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between gap-2 text-base">
                    {REPORTS[key].title}
                    <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden />
                  </CardTitle>
                  <CardDescription>{REPORTS[key].description}</CardDescription>
                </CardHeader>
                {reportPrivacy(key) && (
                  <CardContent className="text-muted-foreground flex items-start gap-1.5 text-xs">
                    <LockIcon className="mt-0.5 size-3 shrink-0" aria-hidden /> {reportPrivacy(key)}
                  </CardContent>
                )}
              </Card>
            </Link>
          </li>
        ))}
      </ul>
      {available.length < REPORT_KEYS.length && (
        <p className="text-muted-foreground text-xs">Tuition and staff reports are available to administrators and finance staff only.</p>
      )}
    </>
  )
}
