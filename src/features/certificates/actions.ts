"use server"

import { refresh } from "next/cache"

import { issueCertificateSchema, revokeCertificateSchema } from "@/features/certificates/schemas"
import { issueCertificate, revokeCertificate } from "@/features/certificates/server/certificate-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function issueCertificateAction(input: unknown) {
  return runAction(issueCertificateSchema, input, async (data) => {
    await requirePermission("certificates.write")
    const id = await issueCertificate(await createClient(), data)
    refresh()
    return id
  })
}

export async function revokeCertificateAction(input: unknown) {
  return runAction(revokeCertificateSchema, input, async ({ id, reason }) => {
    await requirePermission("certificates.write")
    await revokeCertificate(await createClient(), id, reason)
    refresh()
  })
}
