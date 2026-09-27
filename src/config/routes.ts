export const routes = {
  home: "/",
  login: "/login",
  forgotPassword: "/forgot-password",
  register: "/register",
  authConfirm: "/auth/confirm",
  signOut: "/auth/sign-out",
  setPassword: "/auth/set-password",
  dashboard: "/dashboard",
  students: "/students",
  studentNew: "/students/new",
  studentDetail: "/students/[id]",
  studentEdit: "/students/[id]/edit",
  parents: "/parents",
  teachers: "/teachers",
  teacherNew: "/teachers/new",
  teacherDetail: "/teachers/[id]",
  teacherEdit: "/teachers/[id]/edit",
  classes: "/classes",
  classNew: "/classes/new",
  classDetail: "/classes/[id]",
  classEdit: "/classes/[id]/edit",
  classAttendance: "/classes/[id]/attendance",
  courses: "/courses",
  courseNew: "/courses/new",
  courseDetail: "/courses/[id]",
  courseEdit: "/courses/[id]/edit",
  subjects: "/subjects",
  subjectDetail: "/subjects/[id]",
  timetable: "/timetable",
  attendance: "/attendance",
  assignments: "/assignments",
  assignmentNew: "/assignments/new",
  assignmentDetail: "/assignments/[id]",
  assignmentEdit: "/assignments/[id]/edit",
  assignmentWork: "/assignments/[id]/work",
  submissionDetail: "/assignments/[id]/submissions/[submissionId]",
  questionBank: "/question-bank",
  questionNew: "/question-bank/new",
  questionDetail: "/question-bank/[id]",
  questionEdit: "/question-bank/[id]/edit",
  tests: "/tests",
  testNew: "/tests/new",
  testDetail: "/tests/[id]",
  testEdit: "/tests/[id]/edit",
  testTake: "/tests/[id]/take",
  testAttempt: "/tests/[id]/attempts/[attemptId]",
  english: "/english",
  vocabulary: "/english/vocabulary",
  wordNew: "/english/vocabulary/words/new",
  wordEdit: "/english/vocabulary/words/[id]/edit",
  wordSet: "/english/vocabulary/sets/[id]",
  wordSetPractice: "/english/vocabulary/sets/[id]/practice",
  lessons: "/english/lessons",
  lessonNew: "/english/lessons/new",
  lessonDetail: "/english/lessons/[id]",
  lessonEdit: "/english/lessons/[id]/edit",
  lessonSubmission: "/english/submissions/[id]",
  assessments: "/assessments",
  assessmentNew: "/assessments/new",
  assessmentDetail: "/assessments/[id]",
  assessmentEdit: "/assessments/[id]/edit",
  assessmentSubmission: "/assessments/submissions/[id]",
  assessmentHistory: "/assessments/history",
  assessmentRubrics: "/assessments/rubrics",
  feedbackComments: "/assessments/comments",
  online: "/online",
  onlineNew: "/online/new",
  onlineSession: "/online/[id]",
  onlineEdit: "/online/[id]/edit",
  designs: "/designs",
  designNew: "/designs/new",
  designEditor: "/designs/[id]",
  designPreview: "/designs/[id]/preview",
  designShared: "/designs/shared/[token]",
  library: "/library",
  libraryNew: "/library/new",
  libraryMaterial: "/library/[id]",
  libraryEdit: "/library/[id]/edit",
  analytics: "/analytics",
  analyticsStudent: "/analytics/students/[id]",
  analyticsClass: "/analytics/classes/[id]",
  family: "/family",
  announcements: "/announcements",
  notifications: "/notifications",
  notificationSettings: "/notifications/settings",
  messages: "/messages",
  messageThread: "/messages/[id]",
  adminDashboard: "/admin",
  reports: "/reports",
  report: "/reports/[report]",
  ai: "/ai",
  aiNew: "/ai/new",
  aiDraft: "/ai/[id]",
  tuition: "/tuition",
  tuitionPlans: "/tuition/plans",
  tuitionStudents: "/tuition/students",
  invoices: "/tuition/invoices",
  invoiceDetail: "/tuition/invoices/[id]",
  payments: "/tuition/payments",
  receipt: "/tuition/payments/[id]/receipt",
  tuitionReports: "/tuition/reports",
  users: "/admin/users",
  website: "/admin/website",
  audit: "/admin/audit",
  dictionary: "/dictionary",
  programs: "/programs",
  program: "/programs/[code]",
  about: "/about",
  contact: "/contact",
  resources: "/resources",
  resource: "/resources/[id]",
  publicLesson: "/lessons/[slug]",
  articles: "/articles",
  article: "/articles/[slug]",
  adminArticles: "/admin/articles",
  adminArticleNew: "/admin/articles/new",
  adminArticleEdit: "/admin/articles/[id]",
  profile: "/settings/profile",
} as const

export function studentPath(id: string, tab?: string) {
  return tab && tab !== "overview" ? `/students/${id}?tab=${tab}` : `/students/${id}`
}

export function studentEditPath(id: string) {
  return `/students/${id}/edit`
}

export const teacherPath = (id: string) => `/teachers/${id}`
export const teacherEditPath = (id: string) => `/teachers/${id}/edit`
export const classPath = (id: string) => `/classes/${id}`
export const classEditPath = (id: string) => `/classes/${id}/edit`
export const classAttendancePath = (id: string, date?: string) =>
  date ? `/classes/${id}/attendance?date=${date}` : `/classes/${id}/attendance`
export const coursePath = (id: string) => `/courses/${id}`
export const courseEditPath = (id: string) => `/courses/${id}/edit`
export const subjectPath = (id: string) => `/subjects/${id}`
export const assignmentPath = (id: string) => `/assignments/${id}`
export const assignmentEditPath = (id: string) => `/assignments/${id}/edit`
export const assignmentWorkPath = (id: string) => `/assignments/${id}/work`
export const submissionPath = (assignmentId: string, submissionId: string) =>
  `/assignments/${assignmentId}/submissions/${submissionId}`
export const questionPath = (id: string) => `/question-bank/${id}`
export const questionEditPath = (id: string) => `/question-bank/${id}/edit`
export const testPath = (id: string, view?: string) => (view ? `/tests/${id}?view=${view}` : `/tests/${id}`)
export const testEditPath = (id: string) => `/tests/${id}/edit`
export const testTakePath = (id: string) => `/tests/${id}/take`
export const testAttemptPath = (testId: string, attemptId: string) => `/tests/${testId}/attempts/${attemptId}`
export const wordEditPath = (id: string) => `/english/vocabulary/words/${id}/edit`
export const wordSetPath = (id: string) => `/english/vocabulary/sets/${id}`
export const wordSetPracticePath = (id: string, activity: string) => `/english/vocabulary/sets/${id}/practice?activity=${activity}`
export const lessonPath = (id: string) => `/english/lessons/${id}`
export const lessonEditPath = (id: string) => `/english/lessons/${id}/edit`
export const lessonSubmissionPath = (id: string) => `/english/submissions/${id}`
export const englishStudentPath = (studentId: string) => `/english?student=${studentId}`
export const assessmentPath = (id: string) => `/assessments/${id}`
export const assessmentEditPath = (id: string) => `/assessments/${id}/edit`
export const assessmentSubmissionPath = (id: string) => `/assessments/submissions/${id}`
export const assessmentHistoryPath = (studentId?: string) => (studentId ? `/assessments/history?student=${studentId}` : `/assessments/history`)
export const onlineSessionPath = (id: string) => `/online/${id}`
export const onlineEditPath = (id: string) => `/online/${id}/edit`
export const designPath = (id: string) => `/designs/${id}`
export const designPreviewPath = (id: string) => `/designs/${id}/preview`
export const designSharedPath = (token: string) => `/designs/shared/${token}`
export const libraryMaterialPath = (id: string) => `/library/${id}`
export const libraryEditPath = (id: string) => `/library/${id}/edit`
export const analyticsStudentPath = (id: string) => `/analytics/students/${id}`
export const analyticsClassPath = (id: string) => `/analytics/classes/${id}`
export const messageThreadPath = (id: string) => `/messages/${id}`
export const reportPath = (key: string) => `/reports/${key}`
export const aiDraftPath = (id: string) => `/ai/${id}`
export const invoicePath = (id: string) => `/tuition/invoices/${id}`
export const receiptPath = (id: string) => `/tuition/payments/${id}/receipt`
export const resourcePath = (id: string) => `/resources/${id}`
export const publicLessonPath = (slug: string) => `/lessons/${slug}`
export const articlePath = (slug: string) => `/articles/${slug}`
export const adminArticlePath = (id: string) => `/admin/articles/${id}`
export const programPath = (code: string) => `/programs/${encodeURIComponent(code)}`

/** Routes reachable without a session. Everything else requires sign-in. */
export const publicRoutes: readonly string[] = [
  routes.programs,
  routes.about,
  routes.contact,
  routes.resources,
  "/lessons",
  routes.articles,
  routes.login,
  routes.register,
  routes.forgotPassword,
  routes.authConfirm,
  routes.signOut,
]

export function isPublicRoute(pathname: string) {
  // The home page is the public website.
  if (pathname === routes.home) return true
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  )
}

/** Only allow same-origin relative redirects to prevent open-redirects. */
export function safeRedirectPath(value: unknown, fallback: string = routes.dashboard) {
  if (typeof value !== "string") return fallback
  // One leading slash, then no second slash or backslash; no whitespace or
  // control characters anywhere (browsers strip tabs/newlines, so "/\t/evil"
  // would become "//evil"), and no backslashes (some browsers read them as "/").
  if (!/^\/(?![/\\])/.test(value) || /[\s\\\u0000-\u001f\u007f]/.test(value)) {
    return fallback
  }
  return value
}
