import "server-only"

import { fromPostgrestError } from "@/lib/errors"
import type { DbClient } from "@/lib/supabase/types"
import type { Enums } from "@/types/database"

// Rules (permission, capacity, re-enrolment, atomic transfer) live in the SQL
// functions; these wrappers only translate errors.

export async function enrollStudent(
  db: DbClient,
  input: { studentId: string; classId: string; status: "pending" | "active"; startOn: string }
) {
  const { error } = await db.rpc("enroll_student", {
    target_student_id: input.studentId,
    target_class_id: input.classId,
    initial_status: input.status,
    start_on: input.startOn,
  })
  if (error) throw fromPostgrestError(error)
}

export async function setEnrollmentStatus(
  db: DbClient,
  enrollmentId: string,
  status: Enums<"enrollment_status">
) {
  const { error } = await db.rpc("set_enrollment_status", {
    target_enrollment_id: enrollmentId,
    new_status: status,
  })
  if (error) throw fromPostgrestError(error)
}

export async function transferEnrollment(db: DbClient, enrollmentId: string, classId: string) {
  const { error } = await db.rpc("transfer_enrollment", {
    target_enrollment_id: enrollmentId,
    new_class_id: classId,
  })
  if (error) throw fromPostgrestError(error)
}
