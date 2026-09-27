"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { invoicePath } from "@/config/routes"
import {
  assignTuitionSchema,
  cancelTuitionSchema,
  discountRuleSchema,
  invoiceSchema,
  planIdSchema,
  planSchema,
  recordPaymentSchema,
  voidInvoiceSchema,
  voidPaymentSchema,
} from "@/features/tuition/schemas"
import { createInvoice, voidInvoice } from "@/features/tuition/server/invoice-service"
import { voidPayment } from "@/features/tuition/server/payment-service"
import {
  assignTuition,
  cancelTuition,
  saveDiscountRule,
  savePlan,
  setPlanArchived,
} from "@/features/tuition/server/tuition-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { getPaymentProvider } from "@/lib/payments"
import { createClient } from "@/lib/supabase/server"

// Every action re-checks its permission; the database checks again and
// enforces balances, immutability and who recorded what.

export async function savePlanAction(input: unknown) {
  return runAction(planSchema, input, async (data) => {
    await requirePermission("tuition.write")
    await savePlan(await createClient(), data)
    refresh()
  })
}

export async function archivePlanAction(input: unknown) {
  return runAction(planIdSchema, input, async ({ planId }) => {
    await requirePermission("tuition.write")
    await setPlanArchived(await createClient(), planId, true)
    refresh()
  })
}

export async function restorePlanAction(input: unknown) {
  return runAction(planIdSchema, input, async ({ planId }) => {
    await requirePermission("tuition.write")
    await setPlanArchived(await createClient(), planId, false)
    refresh()
  })
}

export async function saveDiscountRuleAction(input: unknown) {
  return runAction(discountRuleSchema, input, async (data) => {
    await requirePermission("tuition.write")
    await saveDiscountRule(await createClient(), data)
    refresh()
  })
}

export async function assignTuitionAction(input: unknown) {
  return runAction(assignTuitionSchema, input, async (data) => {
    await requirePermission("tuition.write")
    await assignTuition(await createClient(), data)
    refresh()
  })
}

export async function cancelTuitionAction(input: unknown) {
  return runAction(cancelTuitionSchema, input, async ({ tuitionId, reason }) => {
    await requirePermission("tuition.write")
    await cancelTuition(await createClient(), tuitionId, reason)
    refresh()
  })
}

export async function createInvoiceAction(input: unknown) {
  return runAction(invoiceSchema, input, async (data) => {
    await requirePermission("tuition.write")
    const id = await createInvoice(await createClient(), data)
    redirect(invoicePath(id))
  })
}

export async function voidInvoiceAction(input: unknown) {
  return runAction(voidInvoiceSchema, input, async ({ invoiceId, reason }) => {
    await requirePermission("tuition.write")
    await voidInvoice(await createClient(), invoiceId, reason)
    refresh()
  })
}

export async function recordPaymentAction(input: unknown) {
  return runAction(recordPaymentSchema, input, async (data) => {
    await requirePermission("payments.write")
    // Staff-recorded payments go through the manual provider; a gateway would
    // confirm through its webhook instead (see lib/payments/types.ts).
    const paymentId = await getPaymentProvider("manual").record(await createClient(), data)
    refresh()
    return paymentId
  })
}

export async function voidPaymentAction(input: unknown) {
  return runAction(voidPaymentSchema, input, async ({ paymentId, reason }) => {
    await requirePermission("payments.write")
    await voidPayment(await createClient(), paymentId, reason)
    refresh()
  })
}
