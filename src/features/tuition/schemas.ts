import { z } from "zod"

import { codeField, moneyField, optionalText, optionalUuid, requiredText } from "@/lib/validation"

export const PAYMENT_SCHEDULES = ["one_time", "monthly", "quarterly"] as const
export const PAYMENT_METHOD_VALUES = ["cash", "bank_transfer", "other"] as const
export const INVOICE_STATUS_FILTERS = [
  "outstanding",
  "overdue",
  "unpaid",
  "partially_paid",
  "paid",
  "void",
  "all",
] as const

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date.")

export const planSchema = z.object({
  planId: z.uuid().optional(),
  code: codeField("Plan code", 30),
  name: requiredText(150, "Enter a plan name."),
  courseId: z.uuid("Choose a course."),
  amount: moneyField("Amount"),
  durationMonths: z.coerce.number().int().min(1, "At least 1 month.").max(60, "At most 60 months."),
  paymentSchedule: z.enum(PAYMENT_SCHEDULES),
  isActive: z.boolean(),
  notes: optionalText(1000),
})

export const planIdSchema = z.object({ planId: z.uuid() })

export const discountRuleSchema = z
  .object({
    ruleId: z.uuid().optional(),
    planId: optionalUuid,
    name: requiredText(150, "Enter a name."),
    kind: z.enum(["percent", "fixed"]),
    value: z.coerce.number().positive("Enter a value above zero."),
    isActive: z.boolean(),
  })
  .refine((v) => v.kind !== "percent" || v.value <= 100, { message: "A percentage cannot exceed 100.", path: ["value"] })
  .refine((v) => v.kind !== "fixed" || Number.isInteger(v.value), { message: "Use whole đồng.", path: ["value"] })

export const assignTuitionSchema = z.object({
  studentId: z.uuid("Choose a student."),
  planId: z.uuid("Choose a plan."),
  firstDueDate: isoDate,
  discountRuleIds: z.array(z.uuid()).max(10),
  manualDiscount: moneyField("Extra discount", { min: 0 }),
  manualDiscountLabel: optionalText(150),
})

export const reasonSchema = requiredText(300, "Give a reason.")

export const cancelTuitionSchema = z.object({ tuitionId: z.uuid(), reason: reasonSchema })

export const invoiceSchema = z.object({
  studentId: z.uuid("Choose a student."),
  description: requiredText(300, "Describe the charge."),
  amount: moneyField("Amount"),
  dueDate: isoDate,
})

export const voidInvoiceSchema = z.object({ invoiceId: z.uuid(), reason: reasonSchema })

export const recordPaymentSchema = z.object({
  invoiceId: z.uuid(),
  amount: moneyField("Amount"),
  paidOn: isoDate,
  method: z.enum(PAYMENT_METHOD_VALUES),
  reference: optionalText(100),
  notes: optionalText(1000),
})

export const voidPaymentSchema = z.object({ paymentId: z.uuid(), reason: reasonSchema })

