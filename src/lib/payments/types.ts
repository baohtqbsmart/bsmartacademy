import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

export type PaymentMethod = Enums<"payment_method">

export type RecordPaymentInput = {
  invoiceId: string
  amount: number
  paidOn: string
  method: PaymentMethod
  reference: string | null
  notes: string | null
}

/**
 * A way of taking money. Every provider ends in the same place: a row written
 * by public.record_payment(), which enforces balances, sets the receipt
 * number and staff member, and is idempotent per (provider, provider_payment_id).
 *
 * - "manual" providers are used by staff at the desk: the payment is recorded
 *   immediately with the staff member's session.
 * - "gateway" providers (future: e.g. VNPay, MoMo, bank QR) create a checkout
 *   for the payer, then confirm asynchronously through a webhook Route Handler
 *   that verifies the signature and calls record_payment() with the gateway's
 *   event id as `external_payment_id` (safe to retry). The webhook must use a
 *   server-only service-role client and never trust amounts from the browser.
 */
export type PaymentProvider =
  | {
      id: string
      label: string
      kind: "manual"
      record(db: DbClient, input: RecordPaymentInput): Promise<string>
    }
  | {
      id: string
      label: string
      kind: "gateway"
      createCheckout(input: { invoiceId: string; amount: number; returnUrl: string }): Promise<{ redirectUrl: string }>
      verifyWebhook(request: Request): Promise<GatewayEvent | null>
    }

export type GatewayEvent = {
  providerPaymentId: string
  invoiceId: string
  amount: number
  paidOn: string
  reference: string | null
}
