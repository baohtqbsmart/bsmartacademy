import { routes } from "@/config/routes"
import { can, type Permission, type PermissionGrants, type PermissionScope } from "@/lib/auth/permissions"

export type AccessRule = {
  permission: Permission
  /** Required scopes; omit to accept any scope of the permission. */
  scopes?: readonly PermissionScope[]
}

/**
 * Who may open each protected page. Pages enforce this with
 * requireRouteAccess(); the sidebar uses it to decide what to show. RLS still
 * decides which rows each user sees on the page.
 */
export const routeAccess = {
  [routes.website]: { permission: "site.write" },
  [routes.students]: { permission: "students.read", scopes: ["all", "assigned", "children"] },
  [routes.studentNew]: { permission: "students.write" },
  // Any scope: students open their own profile; RLS returns 404 for anyone else's.
  [routes.studentDetail]: { permission: "students.read" },
  [routes.studentEdit]: { permission: "students.write" },
  [routes.parents]: { permission: "parents.read", scopes: ["all", "assigned"] },
  [routes.teachers]: { permission: "teachers.read" },
  [routes.teacherNew]: { permission: "teachers.write" },
  [routes.teacherDetail]: { permission: "teachers.read" },
  [routes.teacherEdit]: { permission: "teachers.write" },
  [routes.classes]: { permission: "classes.read" },
  [routes.classNew]: { permission: "classes.write" },
  [routes.classDetail]: { permission: "classes.read" },
  [routes.classEdit]: { permission: "classes.write" },
  [routes.courses]: { permission: "courses.read" },
  [routes.courseNew]: { permission: "courses.write" },
  [routes.courseDetail]: { permission: "courses.read" },
  [routes.courseEdit]: { permission: "courses.write" },
  // Subjects and levels are catalogue administration.
  [routes.subjects]: { permission: "courses.write" },
  [routes.subjectDetail]: { permission: "courses.write" },
  [routes.timetable]: { permission: "classes.read" },
  // Attendance reports / history: RLS limits rows to own, children or taught classes.
  [routes.attendance]: { permission: "attendance.read" },
  // Taking attendance; the database also checks the teacher teaches the class.
  [routes.classAttendance]: { permission: "attendance.write" },
  // Assignments: RLS shows editors every state, others released work only.
  [routes.assignments]: { permission: "assignments.read" },
  [routes.assignmentDetail]: { permission: "assignments.read" },
  [routes.assignmentNew]: { permission: "assignments.write" },
  [routes.assignmentEdit]: { permission: "assignments.write" },
  [routes.submissionDetail]: { permission: "assignments.write" },
  // Doing the work: students only.
  [routes.assignmentWork]: { permission: "submissions.write" },
  // Question bank: staff only (students never see questions outside a started test).
  [routes.questionBank]: { permission: "question_bank.read" },
  [routes.questionDetail]: { permission: "question_bank.read" },
  [routes.questionNew]: { permission: "question_bank.write" },
  [routes.questionEdit]: { permission: "question_bank.write" },
  // Tests: RLS scopes rows; attempt pages apply the review policy in the database.
  [routes.tests]: { permission: "tests.read" },
  [routes.testDetail]: { permission: "tests.read" },
  [routes.testAttempt]: { permission: "tests.read" },
  [routes.testNew]: { permission: "tests.write" },
  [routes.testEdit]: { permission: "tests.write" },
  [routes.testTake]: { permission: "test_attempts.write" },
  // English learning: the library is open to every signed-in role; results
  // are scoped by RLS (own / children / taught students / all).
  [routes.english]: { permission: "english.read" },
  [routes.vocabulary]: { permission: "english.read" },
  [routes.wordSet]: { permission: "english.read" },
  [routes.lessons]: { permission: "english.read" },
  [routes.lessonDetail]: { permission: "english.read" },
  [routes.lessonSubmission]: { permission: "english.results" },
  [routes.wordNew]: { permission: "english.write" },
  [routes.wordEdit]: { permission: "english.write" },
  [routes.lessonNew]: { permission: "english.write" },
  [routes.lessonEdit]: { permission: "english.write" },
  [routes.wordSetPractice]: { permission: "english.practice" },
  // Writing & speaking assessment: RLS scopes rows; grades show once returned.
  [routes.assessments]: { permission: "assessments.read" },
  [routes.assessmentDetail]: { permission: "assessments.read" },
  [routes.assessmentSubmission]: { permission: "assessments.read" },
  [routes.assessmentHistory]: { permission: "assessments.read" },
  [routes.assessmentNew]: { permission: "assessments.write" },
  [routes.assessmentEdit]: { permission: "assessments.write" },
  [routes.assessmentRubrics]: { permission: "assessments.write" },
  [routes.feedbackComments]: { permission: "assessments.write" },
  // Online Teaching Center: RLS shows each role its classes' sessions.
  [routes.online]: { permission: "online.read" },
  [routes.onlineSession]: { permission: "online.read" },
  [routes.onlineNew]: { permission: "online.write" },
  [routes.onlineEdit]: { permission: "online.write" },
  // Lesson designer: RLS shows teachers their own designs, admins all.
  // Shared links (routes.designShared) open for every signed-in user.
  [routes.designs]: { permission: "designs.read" },
  [routes.designPreview]: { permission: "designs.read" },
  [routes.designNew]: { permission: "designs.write" },
  [routes.designEditor]: { permission: "designs.write" },
  // Material library: RLS shows students only what is assigned or shared to them.
  [routes.library]: { permission: "library.read" },
  [routes.libraryMaterial]: { permission: "library.read" },
  [routes.libraryNew]: { permission: "library.write" },
  [routes.libraryEdit]: { permission: "library.write" },
  // Progress analytics: the database functions return only results the caller may read.
  [routes.analytics]: { permission: "analytics.read" },
  [routes.analyticsStudent]: { permission: "analytics.read" },
  // Class view: staff only (aggregates, no individual scores).
  [routes.analyticsClass]: { permission: "analytics.read", scopes: ["all", "assigned"] },
  // Parent portal: parents only; RLS limits every section to their own children.
  [routes.family]: { permission: "students.read", scopes: ["children"] },
  // Announcements: RLS shows each audience its own.
  [routes.announcements]: { permission: "announcements.read" },
  // Messages: the two participants (and administrators, read-only).
  [routes.messages]: { permission: "messages.read" },
  [routes.messageThread]: { permission: "messages.read" },
  // Admin dashboard: academy-wide figures, administrators only.
  [routes.adminDashboard]: { permission: "reports.read", scopes: ["all"] },
  // Reports: RLS narrows teachers to their classes; tuition and teacher reports
  // need academy-wide rights (checked per report, see features/reports/catalog).
  [routes.reports]: { permission: "reports.read" },
  [routes.report]: { permission: "reports.read" },
  // AI assistant: teachers and admins; drafts are private (RLS), never shown to students.
  [routes.ai]: { permission: "ai.use" },
  [routes.aiNew]: { permission: "ai.use" },
  [routes.aiDraft]: { permission: "ai.use" },
  // Finance. Teachers hold no tuition permission unless granted individually.
  // Students/parents: the tuition overview and receipts (RLS limits rows).
  [routes.tuition]: { permission: "tuition.read" },
  [routes.receipt]: { permission: "tuition.read" },
  [routes.tuitionPlans]: { permission: "tuition.read", scopes: ["all"] },
  [routes.tuitionStudents]: { permission: "tuition.read", scopes: ["all"] },
  [routes.invoices]: { permission: "tuition.read", scopes: ["all"] },
  [routes.invoiceDetail]: { permission: "tuition.read", scopes: ["all"] },
  [routes.payments]: { permission: "tuition.read", scopes: ["all"] },
  [routes.tuitionReports]: { permission: "tuition.read", scopes: ["all"] },
  [routes.users]: { permission: "users.read" },
} as const satisfies Record<string, AccessRule>

export type ProtectedRoute = keyof typeof routeAccess

export function canAccessRoute(grants: PermissionGrants, route: string) {
  // Rules are keyed by path; "/tuition/invoices?status=overdue" uses the invoices rule.
  const path = route.split("?")[0]
  const rule = (routeAccess as Record<string, AccessRule>)[path]
  // Routes without a rule are open to every signed-in user.
  return !rule || can(grants, rule.permission, rule.scopes)
}
