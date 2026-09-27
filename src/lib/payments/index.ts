import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { PaymentProvider } from "@/lib/payments/types"

/** Staff record cash, bank transfers and other payments received at the desk. */
const manualProvider: PaymentProvider = {
  id: "manual",
  label: "Recorded by staff",
  kind: "manual",
  async record(db, input) {
    const { data, error } = await db.rpc("record_payment", {
      target_invoice_id: input.invoiceId,
      payment_amount: input.amount,
      payment_date: input.paidOn,
      payment_method: input.method,
      reference: input.reference,
      payment_notes: input.notes,
      payment_provider: "manual",
    })
    if (error) throw fromPostgrestError(error)
    return data
  },
}

/**
 * Registered providers. Add a gateway here (and a webhook route) when one is
 * integrated; no real banking API is connected yet.
 */
const providers = { manual: manualProvider } satisfies Record<string, PaymentProvider>

export type ProviderId = keyof typeof providers

export function getPaymentProvider<T extends ProviderId>(id: T): (typeof providers)[T] {
  return providers[id]
}
