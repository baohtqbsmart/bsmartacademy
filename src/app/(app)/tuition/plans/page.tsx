import { TagsIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { EmptyState } from "@/components/shared/empty-state"
import { ListFilters } from "@/components/shared/list-filters"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { PAYMENT_SCHEDULE_LABELS } from "@/config/labels"
import { routes } from "@/config/routes"
import { listActiveCourseOptions } from "@/features/courses/server/course-service"
import { archivePlanAction, restorePlanAction } from "@/features/tuition/actions"
import { DiscountRuleDialog, PlanDialog } from "@/features/tuition/components/tuition-dialogs"
import { listDiscountRules, listPlans } from "@/features/tuition/server/tuition-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatVnd } from "@/lib/money"
import { enumParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Tuition plans" }

function installments(schedule: string, months: number) {
  if (schedule === "one_time") return 1
  if (schedule === "monthly") return months
  return Math.ceil(months / 3)
}

export default async function TuitionPlansPage({ searchParams }: PageProps<"/tuition/plans">) {
  const user = await requireRouteAccess(routes.tuitionPlans)
  const canWrite = can(user.permissions, "tuition.write")
  const show = enumParam(await searchParams, "show", ["archived"] as const)

  const db = await createClient()
  const [plans, rules, courses] = await Promise.all([
    listPlans(db, { archived: show === "archived" }),
    listDiscountRules(db),
    canWrite ? listActiveCourseOptions(db) : [],
  ])
  const courseOptions = courses.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))
  const planOptions = plans.map((p) => ({ id: p.id, label: p.name }))

  return (
    <>
      <PageHeader
        title="Tuition plans"
        description="Prices per course with their duration and payment schedule."
        actions={canWrite && <PlanDialog courses={courseOptions} />}
      />
      <ListFilters
        basePath={routes.tuitionPlans}
        values={{ show }}
        filters={[{ param: "show", allLabel: "Current plans", options: [{ value: "archived", label: "Archived" }] }]}
      />
      <SimpleTable
        rows={plans}
        rowKey={(p) => p.id}
        empty={<EmptyState icon={TagsIcon} title="No tuition plans" />}
        columns={[
          { header: "Code", cell: (p) => <span className="font-mono text-xs">{p.code}</span> },
          {
            header: "Plan",
            cell: (p) => (
              <div className="grid">
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground text-xs">{p.course?.name}</span>
              </div>
            ),
          },
          { header: "Amount", cell: (p) => <span className="tabular-nums">{formatVnd(p.amount)}</span> },
          { header: "Duration", cell: (p) => `${p.duration_months} months` },
          {
            header: "Payment schedule",
            cell: (p) => `${PAYMENT_SCHEDULE_LABELS[p.payment_schedule]} · ${installments(p.payment_schedule, p.duration_months)} invoice(s)`,
          },
          {
            header: "Status",
            cell: (p) => (p.is_active ? <Badge>Available</Badge> : <Badge variant="outline">Not offered</Badge>),
          },
          ...(canWrite
            ? [
                {
                  header: "",
                  key: "actions",
                  className: "text-right",
                  cell: (p: (typeof plans)[number]) => (
                    <div className="flex justify-end gap-1">
                      <PlanDialog
                        courses={courseOptions}
                        initial={{
                          planId: p.id,
                          code: p.code,
                          name: p.name,
                          courseId: p.course_id,
                          amount: String(p.amount),
                          durationMonths: String(p.duration_months),
                          paymentSchedule: p.payment_schedule,
                          isActive: p.is_active,
                          notes: p.notes ?? "",
                        }}
                      />
                      <ConfirmActionButton
                        variant="ghost"
                        title={p.deleted_at ? "Restore plan?" : "Archive plan?"}
                        description="Tuition already assigned from this plan is not affected."
                        confirmLabel={p.deleted_at ? "Restore" : "Archive"}
                        successMessage={p.deleted_at ? "Plan restored." : "Plan archived."}
                        action={(p.deleted_at ? restorePlanAction : archivePlanAction).bind(null, { planId: p.id })}
                      >
                        {p.deleted_at ? "Restore" : "Archive"}
                      </ConfirmActionButton>
                    </div>
                  ),
                },
              ]
            : []),
        ]}
      />

      <section className="grid gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">Discount rules</h2>
            <p className="text-muted-foreground text-sm">Chosen per student when tuition is assigned.</p>
          </div>
          {canWrite && <DiscountRuleDialog plans={planOptions} />}
        </div>
        <SimpleTable
          rows={rules}
          rowKey={(r) => r.id}
          empty="No discount rules yet."
          columns={[
            { header: "Rule", cell: (r) => <span className="font-medium">{r.name}</span> },
            { header: "Discount", cell: (r) => (r.kind === "percent" ? `${r.value}%` : formatVnd(r.value)) },
            { header: "Applies to", cell: (r) => r.plan?.name ?? "Any plan" },
            { header: "Status", cell: (r) => (r.is_active ? <Badge>Active</Badge> : <Badge variant="outline">Inactive</Badge>) },
            ...(canWrite
              ? [
                  {
                    header: "",
                    key: "actions",
                    className: "text-right",
                    cell: (r: (typeof rules)[number]) => (
                      <DiscountRuleDialog
                        plans={planOptions}
                        initial={{
                          ruleId: r.id,
                          planId: r.plan_id ?? "",
                          name: r.name,
                          kind: r.kind,
                          value: String(r.value),
                          isActive: r.is_active,
                        }}
                      />
                    ),
                  },
                ]
              : []),
          ]}
        />
      </section>
    </>
  )
}
