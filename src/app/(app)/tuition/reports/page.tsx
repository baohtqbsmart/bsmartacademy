import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PAYMENT_METHOD_LABELS } from "@/config/labels"
import { routes } from "@/config/routes"
import { MethodChart, MonthlyRevenueChart } from "@/features/tuition/components/revenue-charts"
import { StatTiles } from "@/components/shared/stat-tiles"
import { loadTuitionReport } from "@/features/tuition/server/report-service"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatVnd } from "@/lib/money"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Tuition reports") }
}

const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—")

export default async function TuitionReportsPage({ searchParams }: PageProps<"/tuition/reports">) {
  const t = await getT()
  await requireRouteAccess(routes.tuitionReports)
  const currentYear = Number(todayInAcademy().slice(0, 4))
  const requested = Number(firstParam(await searchParams, "year"))
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= currentYear + 1 ? requested : currentYear

  const report = await loadTuitionReport(await createClient(), year)
  const { summary } = report
  const money = (value: number) => <span className="tabular-nums">{formatVnd(value)}</span>

  return (
    <>
      <PageHeader title={t("Tuition reports")} description={t("Billing and collection for {year}.", { year })} />
      <ListFilters
        basePath={routes.tuitionReports}
        values={{ year: year === currentYear ? undefined : String(year) }}
        filters={[
          {
            param: "year",
            allLabel: "Year",
            defaultValue: String(currentYear),
            options: [currentYear + 1, currentYear, currentYear - 1, currentYear - 2].map((y) => ({ value: String(y), label: String(y) })),
          },
        ]}
      />
      <StatTiles
        tiles={[
          { label: "Expected", value: summary.expected },
          { label: "Collected", value: summary.collected, hint: `${percent(summary.collected, summary.expected)} of expected` },
          { label: "Outstanding today", value: summary.outstanding },
          { label: "Overdue today", value: summary.overdue, tone: "critical" },
          { label: "Students owing", value: summary.unpaidStudents, kind: "count" },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("Monthly billing and collection")}</CardTitle>
          <CardDescription>{t("Invoices falling due vs payments received each month.")}</CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyRevenueChart data={report.monthly} />
        </CardContent>
      </Card>
      <SimpleTable
        rows={report.monthly}
        rowKey={(m) => m.month}
        empty={t("No data.")}
        columns={[
          { header: "Month", cell: (m) => `${m.label}/${year}` },
          { header: "Expected", cell: (m) => money(m.expected) },
          { header: "Collected", cell: (m) => money(m.collected) },
          { header: "Collected / expected", cell: (m) => percent(m.collected, m.expected) },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("Collected by payment method")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <MethodChart data={report.methods.map((m) => ({ label: PAYMENT_METHOD_LABELS[m.method], amount: m.amount }))} />
            <table className="w-full text-sm">
              <tbody className="tabular-nums">
                {report.methods.map((m) => (
                  <tr key={m.method} className="border-t">
                    <td className="py-1">{t(PAYMENT_METHOD_LABELS[m.method])}</td>
                    <td className="py-1 text-right">{t("{count} payments", { count: m.count })}</td>
                    <td className="py-1 text-right">{formatVnd(m.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("By course")}</CardTitle>
            <CardDescription>{t("All assigned tuition (not only this year), cancelled excluded.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 font-normal">{t("Course")}</th>
                  <th className="py-1 text-right font-normal">{t("Students")}</th>
                  <th className="py-1 text-right font-normal">{t("Billed")}</th>
                  <th className="py-1 text-right font-normal">{t("Paid")}</th>
                  <th className="py-1 text-right font-normal">{t("Remaining")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.courses.map((c) => (
                  <tr key={c.course} className="border-t">
                    <td className="py-1">{c.course}</td>
                    <td className="py-1 text-right">{c.students}</td>
                    <td className="py-1 text-right">{formatVnd(c.billed)}</td>
                    <td className="py-1 text-right">{formatVnd(c.paid)}</td>
                    <td className="py-1 text-right">{formatVnd(c.remaining)}</td>
                  </tr>
                ))}
                {report.courses.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-muted-foreground py-4 text-center">
                      {t("No tuition assigned yet.")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
