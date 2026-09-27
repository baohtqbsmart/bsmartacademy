import { ArrowLeftIcon, DownloadIcon, InfoIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { reportPath, routes } from "@/config/routes"
import { canRunReport, isReportKey, reportPrivacy, REPORTS } from "@/features/reports/catalog"
import { PrintButton, ReportChart } from "@/features/reports/components/report-chart"
import { ReportFilters, ReportTable } from "@/features/reports/components/report-parts"
import { filterParams, parseReportFilters } from "@/features/reports/filters"
import { loadFilterOptions, runReport } from "@/features/reports/server/report-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatDate, formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata({ params }: PageProps<"/reports/[report]">): Promise<Metadata> {
  const { report } = await params
  return { title: isReportKey(report) ? REPORTS[report].title : "Report" }
}

export default async function ReportPage({ params, searchParams }: PageProps<"/reports/[report]">) {
  const tr = await getT()
  const user = await requireRouteAccess(routes.report)
  const { report } = await params
  // Unknown reports and reports this role may not run look the same: 404.
  if (!isReportKey(report) || !canRunReport(user.permissions, report)) notFound()

  const today = todayInAcademy()
  const filters = parseReportFilters(report, await searchParams, today)
  const db = await createClient()
  const [result, options] = await Promise.all([runReport(db, report, filters), loadFilterOptions(db)])
  const def = REPORTS[report]
  const query = filterParams(filters).toString()

  return (
    <>
      <Link href={routes.reports} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm print:hidden">
        <ArrowLeftIcon className="size-4" aria-hidden /> {tr("Reports")}
      </Link>
      <PageHeader
        title={tr(def.title)}
        description={tr("{date} – {date2} · {description}", { date: formatDate(filters.from), date2: formatDate(filters.to), description: def.description })}
        actions={
          <div className="flex gap-2 print:hidden">
            <PrintButton />
            <Button asChild>
              <a href={`${reportPath(report)}/export?${query}`} download>
                <DownloadIcon aria-hidden /> {tr("Export CSV")}
              </a>
            </Button>
          </div>
        }
      />
      <ReportFilters action={reportPath(report)} filters={def.filters} values={filters} options={options} today={today} />

      {result.totals.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {result.totals.map((t) => (
            <div key={t.label} className="rounded-lg border p-3">
              <dt className="text-muted-foreground text-xs">{tr(t.label)}</dt>
              <dd className="text-xl font-semibold tabular-nums">{t.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {result.chart && (
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle className="text-base">{tr(result.chart.title)}</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportChart kind={result.chart.kind} data={result.chart.data} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {tr("{length} row{value}", { length: result.rows.length, value: result.rows.length === 1 ? "" : "s" })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ReportTable columns={result.columns} rows={result.rows} />
        </CardContent>
      </Card>

      <div className="text-muted-foreground grid gap-1 text-xs">
        {reportPrivacy(report) && (
          <p className="flex items-start gap-1.5">
            <InfoIcon className="mt-0.5 size-3 shrink-0" aria-hidden /> {reportPrivacy(report)}
          </p>
        )}
        {result.notes.map((n) => (
          <p key={n}>{n}</p>
        ))}
        <p>
          {tr("Generated {dateTime} by {value} from live data you are allowed to see.", { dateTime: formatDateTime(new Date().toISOString()), value: user.fullName || user.email })}
        </p>
      </div>
    </>
  )
}
