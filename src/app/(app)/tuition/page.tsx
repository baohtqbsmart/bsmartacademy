import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { invoicePath, routes } from "@/config/routes"
import { PaymentStatusBadge } from "@/features/tuition/components/payment-status-badge"
import { MonthlyRevenueChart } from "@/features/tuition/components/revenue-charts"
import { StatTiles } from "@/components/shared/stat-tiles"
import { TuitionOverview } from "@/features/tuition/components/tuition-overview"
import { listInvoices } from "@/features/tuition/server/invoice-service"
import { loadTuitionOverview } from "@/features/tuition/server/overview-service"
import { loadTuitionReport } from "@/features/tuition/server/report-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { todayInAcademy } from "@/lib/dates"
import { formatDate } from "@/lib/format"
import { formatVnd } from "@/lib/money"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Tuition") }
}

export default async function TuitionPage({ searchParams }: PageProps<"/tuition">) {
  const t = await getT()
  const user = await requireRouteAccess(routes.tuition)
  const db = await createClient()

  // Students and parents: their own / their children's tuition only (RLS).
  if (!can(user.permissions, "tuition.read", ["all"])) {
    const overview = await loadTuitionOverview(db)
    const isParent = can(user.permissions, "tuition.read", ["children"])
    return (
      <>
        <PageHeader
          title={t("Tuition")}
          description={isParent ? t("Your children's tuition, invoices and receipts.") : t("Your tuition, invoices and receipts.")}
        />
        <TuitionOverview {...overview} showStudent={isParent} />
      </>
    )
  }

  const currentYear = Number(todayInAcademy().slice(0, 4))
  const requested = Number(firstParam(await searchParams, "year"))
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= currentYear + 1 ? requested : currentYear

  const [report, overdue] = await Promise.all([loadTuitionReport(db, year), listInvoices(db, { status: "overdue" })])
  const { summary } = report
  const worstOverdue = [...overdue].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5)

  return (
    <>
      <PageHeader
        title={t("Tuition")}
        description={t("Revenue expected from invoices due, money collected, and what is still owed.")}
        actions={
          <Button variant="outline" asChild>
            <Link href={`${routes.tuitionReports}?year=${year}`}>{t("Full report")}</Link>
          </Button>
        }
      />
      <ListFilters
        basePath={routes.tuition}
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
          { label: `Expected revenue ${year}`, value: summary.expected, hint: "Invoices due this year" },
          { label: `Collected ${year}`, value: summary.collected, hint: "Payments received this year" },
          { label: "Outstanding", value: summary.outstanding, hint: "All unpaid balances today" },
          { label: "Overdue", value: summary.overdue, tone: "critical", hint: "Past due date" },
          {
            label: "Students with unpaid fees",
            value: summary.unpaidStudents,
            kind: "count",
            hint: `${summary.overdueStudents} overdue`,
          },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("Expected vs collected, {year}", { year })}</CardTitle>
          <CardDescription>{t("By month: invoices falling due vs payments received.")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <MonthlyRevenueChart data={report.monthly} />
          <details>
            <summary className="text-muted-foreground cursor-pointer text-sm">{t("Show as table")}</summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="py-1 font-normal">{t("Month")}</th>
                  <th className="py-1 text-right font-normal">{t("Expected")}</th>
                  <th className="py-1 text-right font-normal">{t("Collected")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {report.monthly.map((m) => (
                  <tr key={m.month} className="border-t">
                    <td className="py-1">{t(m.label)}</td>
                    <td className="py-1 text-right">{formatVnd(m.expected)}</td>
                    <td className="py-1 text-right">{formatVnd(m.collected)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </CardContent>
      </Card>
      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("Most overdue")}</h2>
          <Button variant="link" asChild>
            <Link href={`${routes.invoices}?status=overdue`}>{t("All overdue invoices")}</Link>
          </Button>
        </div>
        <SimpleTable
          rows={worstOverdue}
          rowKey={(i) => i.id}
          empty={t("Nothing is overdue.")}
          columns={[
            {
              header: "Invoice",
              cell: (i) => (
                <Link href={invoicePath(i.id)} className="font-mono text-xs hover:underline">
                  {i.invoice_number}
                </Link>
              ),
            },
            { header: "Student", cell: (i) => i.student_name ?? "—" },
            { header: "Due", cell: (i) => formatDate(i.due_date) },
            { header: "Remaining", cell: (i) => <span className="tabular-nums">{formatVnd(i.remaining)}</span> },
            { header: "Status", cell: (i) => <PaymentStatusBadge status={i.payment_status} /> },
          ]}
        />
      </section>
    </>
  )
}
