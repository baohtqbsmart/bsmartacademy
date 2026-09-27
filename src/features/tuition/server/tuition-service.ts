import "server-only"

import type { z } from "zod"

import type { assignTuitionSchema, discountRuleSchema, planSchema } from "@/features/tuition/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

// ---------------------------------------------------------------------------
// Plans and discount rules (finance staff only; RLS returns nothing otherwise)
// ---------------------------------------------------------------------------

export async function listPlans(db: DbClient, options: { archived?: boolean } = {}) {
  let query = db
    .from("tuition_plans")
    .select(
      "id, code, name, amount, duration_months, payment_schedule, is_active, notes, deleted_at, course_id, course:courses(id, code, name)"
    )
    .order("code")
  query = options.archived ? query.not("deleted_at", "is", null) : query.is("deleted_at", null)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map((plan) => ({ ...plan, amount: Number(plan.amount) }))
}

export async function listDiscountRules(db: DbClient) {
  const { data, error } = await db
    .from("tuition_discount_rules")
    .select("id, plan_id, name, kind, value, is_active, plan:tuition_plans(code, name)")
    .order("name")
  if (error) throw fromPostgrestError(error)
  return data.map((rule) => ({ ...rule, value: Number(rule.value) }))
}

export async function savePlan(db: DbClient, input: z.output<typeof planSchema>) {
  const row = {
    code: input.code,
    name: input.name,
    course_id: input.courseId,
    amount: input.amount,
    duration_months: input.durationMonths,
    payment_schedule: input.paymentSchedule,
    is_active: input.isActive,
    notes: input.notes,
  }
  const { error } = input.planId
    ? await db.from("tuition_plans").update(row).eq("id", input.planId)
    : await db.from("tuition_plans").insert(row)
  if (error) throw fromPostgrestError(error)
}

export async function setPlanArchived(db: DbClient, planId: string, archived: boolean) {
  const { data, error } = await db
    .from("tuition_plans")
    .update({ deleted_at: archived ? new Date().toISOString() : null })
    .eq("id", planId)
    .select("id")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Plan not found.")
}

export async function saveDiscountRule(db: DbClient, input: z.output<typeof discountRuleSchema>) {
  const row = { plan_id: input.planId, name: input.name, kind: input.kind, value: input.value, is_active: input.isActive }
  const { error } = input.ruleId
    ? await db.from("tuition_discount_rules").update(row).eq("id", input.ruleId)
    : await db.from("tuition_discount_rules").insert(row)
  if (error) throw fromPostgrestError(error)
}

// ---------------------------------------------------------------------------
// Student tuition
// ---------------------------------------------------------------------------

export type TuitionStatus = "paid" | "partially_paid" | "unpaid" | "overdue" | "cancelled"

const BALANCE_COLUMNS =
  "id, student_id, student_name, student_code, plan_name, course_name, original_amount, discount_amount, final_amount, paid, remaining, next_due_date, payment_status, tuition_status, start_date, created_at"

function toBalance<T extends { original_amount: number; discount_amount: number; final_amount: number; paid: number; remaining: number }>(row: T) {
  return {
    ...row,
    original_amount: Number(row.original_amount),
    discount_amount: Number(row.discount_amount),
    final_amount: Number(row.final_amount),
    paid: Number(row.paid),
    remaining: Number(row.remaining),
  }
}

export async function listStudentTuitions(db: DbClient, filters: { status?: TuitionStatus; studentId?: string } = {}) {
  let query = db.from("student_tuition_balances").select(BALANCE_COLUMNS).order("created_at", { ascending: false })
  if (filters.status) query = query.eq("payment_status", filters.status)
  if (filters.studentId) query = query.eq("student_id", filters.studentId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data.map(toBalance)
}

export async function listTuitionDiscounts(db: DbClient, tuitionIds: string[]) {
  if (tuitionIds.length === 0) return []
  const { data, error } = await db
    .from("student_tuition_discounts")
    .select("student_tuition_id, label, amount")
    .in("student_tuition_id", tuitionIds)
  if (error) throw fromPostgrestError(error)
  return data.map((d) => ({ ...d, amount: Number(d.amount) }))
}

export async function assignTuition(db: DbClient, input: z.output<typeof assignTuitionSchema>) {
  const { data, error } = await db.rpc("assign_tuition", {
    target_student_id: input.studentId,
    target_plan_id: input.planId,
    first_due_date: input.firstDueDate,
    discount_rule_ids: input.discountRuleIds,
    manual_discount: input.manualDiscount,
    manual_discount_label: input.manualDiscountLabel,
  })
  if (error) throw fromPostgrestError(error)
  return data
}

export async function cancelTuition(db: DbClient, tuitionId: string, reason: string) {
  const { error } = await db.rpc("cancel_tuition", { target_tuition_id: tuitionId, reason })
  if (error) throw fromPostgrestError(error)
}
