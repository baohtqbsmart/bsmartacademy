import "server-only"

import type { z } from "zod"

import type { issueCertificateSchema } from "@/features/certificates/schemas"
import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"

const COLUMNS =
  "id, certificate_no, verify_code, student_id, class_id, student_name, course_name, class_name, completion_percent, note, issued_on, issued_by_name, revoked_at, revoke_reason"

/** Certificates the caller may see (RLS: the student, their parents, staff). */
export async function listCertificates(db: DbClient, filters: { studentId?: string; classId?: string } = {}) {
  let query = db.from("certificates").select(COLUMNS).order("issued_on", { ascending: false }).order("certificate_no", { ascending: false })
  if (filters.studentId) query = query.eq("student_id", filters.studentId)
  if (filters.classId) query = query.eq("class_id", filters.classId)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)
  return data
}

export type CertificateItem = Awaited<ReturnType<typeof listCertificates>>[number]

export async function getCertificate(db: DbClient, id: string) {
  const { data, error } = await db.from("certificates").select(COLUMNS).eq("id", id).maybeSingle()
  if (error) throw fromPostgrestError(error)
  return data
}

export async function issueCertificate(db: DbClient, input: z.output<typeof issueCertificateSchema>) {
  const { data, error } = await db
    .from("certificates")
    .insert({
      class_id: input.classId,
      student_id: input.studentId,
      completion_percent: input.completionPercent,
      note: input.note,
    })
    .select("id")
    .single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function revokeCertificate(db: DbClient, id: string, reason: string) {
  const { error } = await db.from("certificates").update({ revoked_at: new Date().toISOString(), revoke_reason: reason }).eq("id", id)
  if (error) throw fromPostgrestError(error)
}

/** Public check of a printed code (anyone). */
export async function verifyCertificate(db: DbClient, code: string) {
  const { data, error } = await db.rpc("verify_certificate", {
    code: code.slice(0, 64),
  })
  if (error) throw fromPostgrestError(error)
  return data[0] ?? null
}

/** Students of a class who can receive a certificate (enrolled or finished). */
export async function listCertifiableStudents(db: DbClient, classId: string) {
  const { data, error } = await db
    .from("enrollments")
    .select("status, student:students(id, student_code, full_name)")
    .eq("class_id", classId)
    .in("status", ["active", "completed"])
  if (error) throw fromPostgrestError(error)
  return data.flatMap((e) => (e.student ? [{ ...e.student, enrollmentStatus: e.status }] : [])).sort((a, b) => a.full_name.localeCompare(b.full_name, "vi"))
}
