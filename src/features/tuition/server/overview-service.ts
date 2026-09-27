import "server-only"

import { listInvoices } from "@/features/tuition/server/invoice-service"
import { listPayments } from "@/features/tuition/server/payment-service"
import { listStudentTuitions, listTuitionDiscounts } from "@/features/tuition/server/tuition-service"
import type { DbClient } from "@/lib/supabase/types"

/**
 * Everything the TuitionOverview needs. Without `studentId` it returns every
 * row the caller may read: for a student their own, for a parent their
 * children's (RLS decides).
 */
export async function loadTuitionOverview(db: DbClient, studentId?: string) {
  const [tuitions, invoices, payments] = await Promise.all([
    listStudentTuitions(db, { studentId }),
    listInvoices(db, { studentId }),
    listPayments(db, { studentId }),
  ])
  const discounts = await listTuitionDiscounts(
    db,
    tuitions.map((t) => t.id)
  )
  return { tuitions, invoices, payments, discounts }
}
