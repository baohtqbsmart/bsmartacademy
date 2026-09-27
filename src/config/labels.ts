import type { Enums } from "@/types/database"

type BadgeVariant = "default" | "secondary" | "outline" | "destructive"
type Labelled = { label: string; variant: BadgeVariant }

export const STUDENT_STATUS: Record<Enums<"student_status">, Labelled> = {
  active: { label: "Active", variant: "default" },
  on_hold: { label: "On hold", variant: "secondary" },
  graduated: { label: "Graduated", variant: "outline" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
}

export const STAFF_STATUS: Record<Enums<"staff_status">, Labelled> = {
  active: { label: "Active", variant: "default" },
  on_leave: { label: "On leave", variant: "secondary" },
  inactive: { label: "Inactive", variant: "outline" },
}

export const CLASS_STATUS: Record<Enums<"class_status">, Labelled> = {
  planned: { label: "Planned", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  cancelled: { label: "Cancelled", variant: "destructive" },
}

export const GENDER_LABELS: Record<Enums<"gender">, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
}

export const RELATIONSHIP_LABELS: Record<Enums<"guardian_relationship">, string> = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
  grandparent: "Grandparent",
  other: "Other",
}

export const ENGLISH_FRAMEWORK_LABELS: Record<Enums<"english_framework">, string> = {
  cefr: "CEFR",
  pre_ielts: "Pre-IELTS",
  ielts: "IELTS",
  cambridge: "Cambridge",
}

export const ENROLLMENT_STATUS: Record<Enums<"enrollment_status">, Labelled> = {
  pending: { label: "Pending", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  completed: { label: "Completed", variant: "outline" },
  withdrawn: { label: "Withdrawn", variant: "destructive" },
}

export const COURSE_STATUS: Record<Enums<"course_status">, Labelled> = {
  draft: { label: "Draft", variant: "secondary" },
  active: { label: "Active", variant: "default" },
  inactive: { label: "Inactive", variant: "outline" },
}

export const DELIVERY_MODE_LABELS: Record<Enums<"delivery_mode">, string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Hybrid",
}

export const PAYMENT_METHOD_LABELS: Record<Enums<"payment_method">, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  other: "Other",
}

export const PAYMENT_SCHEDULE_LABELS: Record<Enums<"payment_schedule">, string> = {
  one_time: "One payment",
  monthly: "Monthly",
  quarterly: "Quarterly",
}

export const CLASS_MEMBER_ROLE_LABELS: Record<Enums<"class_member_role">, string> = {
  lead_teacher: "Lead",
  assistant_teacher: "Assistant",
}
