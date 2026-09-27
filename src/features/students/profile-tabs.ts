/** Student profile tabs (each reads its module's data through RLS). */
export const STUDENT_TABS = [
  { value: "overview", label: "Overview" },
  { value: "progress", label: "Academic Progress" },
  { value: "attendance", label: "Attendance" },
  { value: "assignments", label: "Assignments" },
  { value: "tests", label: "Tests" },
  { value: "grades", label: "Grades" },
  { value: "tuition", label: "Tuition" },
  { value: "materials", label: "Materials" },
  { value: "feedback", label: "Teacher Feedback" },
] as const

export type StudentTab = (typeof STUDENT_TABS)[number]["value"]

export function parseStudentTab(value: unknown): StudentTab {
  const match = STUDENT_TABS.find((tab) => tab.value === value)
  return match?.value ?? "overview"
}
