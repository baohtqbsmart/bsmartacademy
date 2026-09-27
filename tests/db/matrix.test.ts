import { beforeAll, describe, expect, it } from "vitest"

import { canAccessRoute, routeAccess } from "@/config/access"
import { navigationFor } from "@/config/navigation"
import { routes } from "@/config/routes"
import { assignableRoles, canManageUser } from "@/features/users/access"
import { PERMISSIONS, toGrants, type PermissionGrants, type PermissionScope } from "@/lib/auth/permissions"
import { ROLE_CODES, type RoleCode } from "@/lib/auth/roles"

import { as, createTestDb, userId, type TestDb } from "./harness"

let db: TestDb
const grantsByRole = {} as Record<RoleCode, PermissionGrants>

beforeAll(async () => {
  db = await createTestDb()
  for (const role of ROLE_CODES) {
    const { rows } = await db.query<{ permission_code: string; scope: PermissionScope }>(
      "select permission_code, scope from public.role_permissions where role_code = $1",
      [role]
    )
    grantsByRole[role] = toGrants(rows)
  }
})

describe("app constants match the database", () => {
  it("permission codes", async () => {
    const { rows } = await db.query<{ code: string }>("select code from public.permissions order by code")
    expect(rows.map((r) => r.code)).toEqual([...PERMISSIONS].sort())
  })

  it("role codes", async () => {
    const { rows } = await db.query<{ code: string }>("select code from public.roles order by code")
    expect(rows.map((r) => r.code)).toEqual([...ROLE_CODES].sort())
  })

  it("my_permissions() returns the caller's row of the matrix", async () => {
    const id = await userId(db, "gv.hung@bsmart.test")
    const rows = await as(db, id, async (tx) =>
      (await tx.query<{ permission_code: string; scope: PermissionScope }>("select * from public.my_permissions()")).rows
    )
    expect(toGrants(rows)).toEqual(grantsByRole.teacher)
  })
})

describe("permission matrix", () => {
  it("matches the documented matrix", () => {
    const summary = Object.fromEntries(
      ROLE_CODES.map((role) => [
        role,
        Object.fromEntries(
          Object.entries(grantsByRole[role])
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([permission, scopes]) => [permission, [...(scopes ?? [])].sort().join("|")])
        ),
      ])
    )
    expect(summary).toMatchInlineSnapshot(`
      {
        "admin": {
          "ai.use": "all",
          "analytics.read": "all",
          "announcements.read": "all",
          "announcements.write": "all",
          "assessments.read": "all",
          "assessments.write": "all",
          "assignments.read": "all",
          "assignments.write": "all",
          "attendance.read": "all",
          "attendance.write": "all",
          "audit.read": "all",
          "classes.read": "all",
          "classes.write": "all",
          "comments.write": "all",
          "courses.read": "all",
          "courses.write": "all",
          "designs.read": "all",
          "designs.write": "all",
          "dictionary.read": "all",
          "english.read": "all",
          "english.results": "all",
          "english.review": "all",
          "english.write": "all",
          "enrollments.read": "all",
          "enrollments.write": "all",
          "feedback.read": "all",
          "feedback.write": "all",
          "library.read": "all",
          "library.write": "all",
          "messages.read": "all",
          "online.read": "all",
          "online.write": "all",
          "parents.read": "all",
          "parents.write": "all",
          "payments.write": "all",
          "question_bank.read": "all",
          "question_bank.write": "all",
          "reports.read": "all",
          "site.write": "all",
          "students.read": "all",
          "students.write": "all",
          "teachers.read": "all",
          "teachers.write": "all",
          "tests.read": "all",
          "tests.write": "all",
          "tuition.read": "all",
          "tuition.write": "all",
          "users.manage": "all",
          "users.read": "all",
        },
        "member": {
          "comments.write": "all",
          "dictionary.read": "all",
        },
        "parent": {
          "analytics.read": "children",
          "announcements.read": "children",
          "assessments.read": "children",
          "assignments.read": "children",
          "attendance.read": "children",
          "classes.read": "children",
          "comments.write": "all",
          "courses.read": "all",
          "dictionary.read": "all",
          "english.read": "all",
          "english.results": "children",
          "enrollments.read": "children",
          "feedback.read": "children",
          "library.read": "children",
          "messages.read": "children",
          "messages.write": "children",
          "online.read": "children",
          "parents.read": "own",
          "students.read": "children",
          "teachers.read": "children",
          "tests.read": "children",
          "tuition.read": "children",
        },
        "student": {
          "analytics.read": "own",
          "announcements.read": "own",
          "assessments.read": "own",
          "assessments.submit": "own",
          "assignments.read": "own",
          "attendance.read": "own",
          "classes.read": "own",
          "comments.write": "all",
          "courses.read": "all",
          "dictionary.read": "all",
          "english.practice": "own",
          "english.read": "all",
          "english.results": "own",
          "enrollments.read": "own",
          "feedback.read": "own",
          "library.read": "own",
          "online.read": "own",
          "students.read": "own",
          "submissions.write": "own",
          "teachers.read": "own",
          "test_attempts.write": "own",
          "tests.read": "own",
          "tuition.read": "own",
        },
        "super_admin": {
          "ai.use": "all",
          "analytics.read": "all",
          "announcements.read": "all",
          "announcements.write": "all",
          "assessments.read": "all",
          "assessments.write": "all",
          "assignments.read": "all",
          "assignments.write": "all",
          "attendance.read": "all",
          "attendance.write": "all",
          "audit.read": "all",
          "classes.delete": "all",
          "classes.read": "all",
          "classes.write": "all",
          "comments.write": "all",
          "courses.delete": "all",
          "courses.read": "all",
          "courses.write": "all",
          "designs.read": "all",
          "designs.write": "all",
          "dictionary.read": "all",
          "english.read": "all",
          "english.results": "all",
          "english.review": "all",
          "english.write": "all",
          "enrollments.delete": "all",
          "enrollments.read": "all",
          "enrollments.write": "all",
          "feedback.read": "all",
          "feedback.write": "all",
          "library.read": "all",
          "library.write": "all",
          "messages.read": "all",
          "online.read": "all",
          "online.write": "all",
          "parents.delete": "all",
          "parents.read": "all",
          "parents.write": "all",
          "payments.write": "all",
          "question_bank.read": "all",
          "question_bank.write": "all",
          "reports.read": "all",
          "roles.manage": "all",
          "site.write": "all",
          "students.delete": "all",
          "students.read": "all",
          "students.write": "all",
          "teachers.delete": "all",
          "teachers.read": "all",
          "teachers.write": "all",
          "tests.read": "all",
          "tests.write": "all",
          "tuition.read": "all",
          "tuition.write": "all",
          "users.manage": "all",
          "users.read": "all",
        },
        "teacher": {
          "ai.use": "own",
          "analytics.read": "assigned",
          "announcements.read": "assigned",
          "announcements.write": "assigned",
          "assessments.read": "assigned",
          "assessments.write": "assigned",
          "assignments.read": "assigned",
          "assignments.write": "assigned",
          "attendance.read": "assigned",
          "attendance.write": "assigned",
          "classes.read": "assigned",
          "comments.write": "all",
          "courses.read": "all",
          "designs.read": "own",
          "designs.write": "own",
          "dictionary.read": "all",
          "english.read": "all",
          "english.results": "assigned",
          "english.review": "assigned",
          "english.write": "own",
          "enrollments.read": "assigned",
          "feedback.read": "assigned",
          "feedback.write": "assigned",
          "library.read": "assigned",
          "library.write": "own",
          "messages.read": "assigned",
          "messages.write": "assigned",
          "online.read": "assigned",
          "online.write": "assigned",
          "parents.read": "assigned",
          "question_bank.read": "all",
          "question_bank.write": "own",
          "reports.read": "assigned",
          "students.read": "assigned",
          "teachers.read": "own",
          "tests.read": "assigned",
          "tests.write": "assigned",
        },
      }
    `)
  })
})

describe("direct URL access per role", () => {
  // Read pages every signed-in role can open (RLS decides which rows they see).
  const readForAll = [
    // Every signed-in role, website members included, has the dictionary.
    routes.dictionary,
    routes.studentDetail,
    routes.teachers,
    routes.teacherDetail,
    routes.classes,
    routes.classDetail,
    routes.courses,
    routes.courseDetail,
    routes.timetable,
    // Attendance: RLS limits rows to own / children / taught classes.
    routes.attendance,
    routes.assignments,
    routes.assignmentDetail,
    routes.tests,
    routes.testDetail,
    routes.testAttempt,
    routes.english,
    routes.vocabulary,
    routes.wordSet,
    routes.lessons,
    routes.lessonDetail,
    routes.lessonSubmission,
    routes.assessments,
    routes.assessmentDetail,
    routes.assessmentSubmission,
    routes.assessmentHistory,
    routes.online,
    routes.onlineSession,
    routes.library,
    routes.libraryMaterial,
    routes.analytics,
    routes.analyticsStudent,
    routes.announcements,
  ]
  // Taking attendance: academy staff everywhere, teachers in their classes (DB-enforced).
  const takeAttendance = [routes.classAttendance]
  // Setting and grading assignments: academy staff, teachers in their classes (DB-enforced).
  const teachAssignments = [
    routes.assignmentNew,
    routes.assignmentEdit,
    routes.submissionDetail,
    routes.questionBank,
    routes.questionDetail,
    routes.questionNew,
    routes.questionEdit,
    routes.testNew,
    routes.testEdit,
    routes.wordNew,
    routes.wordEdit,
    routes.lessonNew,
    routes.lessonEdit,
    routes.assessmentNew,
    routes.assessmentEdit,
    routes.assessmentRubrics,
    routes.feedbackComments,
    routes.onlineNew,
    routes.onlineEdit,
    routes.designs,
    routes.designNew,
    routes.designEditor,
    routes.designPreview,
    routes.libraryNew,
    routes.libraryEdit,
    routes.analyticsClass,
    routes.messages,
    routes.messageThread,
    routes.reports,
    routes.report,
    routes.ai,
    routes.aiNew,
    routes.aiDraft,
  ]
  const adminPages = [
    ...readForAll,
    ...takeAttendance,
    ...teachAssignments,
    routes.students,
    routes.studentNew,
    routes.studentEdit,
    routes.parents,
    routes.teacherNew,
    routes.teacherEdit,
    routes.classNew,
    routes.classEdit,
    routes.courseNew,
    routes.courseEdit,
    routes.subjects,
    routes.subjectDetail,
    routes.users,
    routes.website,
    routes.adminArticles,
    routes.adminArticleNew,
    routes.adminArticleEdit,
    routes.audit,
    // Finance
    routes.tuition,
    routes.receipt,
    routes.tuitionPlans,
    routes.tuitionStudents,
    routes.invoices,
    routes.invoiceDetail,
    routes.payments,
    routes.tuitionReports,
    routes.adminDashboard,
  ]
  // Students and parents see their own / their children's tuition and receipts.
  const familyFinance = [routes.tuition, routes.receipt]
  const expected: Record<RoleCode, string[]> = {
    super_admin: adminPages,
    admin: adminPages,
    // Teachers: no financial pages at all unless granted individually.
    teacher: [...readForAll, ...takeAttendance, ...teachAssignments, routes.students, routes.parents],
    parent: [...readForAll, routes.students, ...familyFinance, routes.family, routes.messages, routes.messageThread],
    // Students open only their own profile (RLS 404s any other id).
    student: [...readForAll, ...familyFinance, routes.assignmentWork, routes.testTake, routes.wordSetPractice],
    // Website members: public lessons (outside the platform) and the dictionary only.
    member: [routes.dictionary],
  }
  // Pages reachable by URL but not listed in the sidebar.
  const notInSidebar = new Set<string>([
    ...Object.keys(routeAccess).filter((route) => route.includes("[id]") || route.endsWith("/new")),
    // Reached from the Writing & speaking page.
    routes.assessmentHistory,
    routes.assessmentRubrics,
    routes.feedbackComments,
    // One page per report, reached from the Reports page.
    routes.report,
  ])

  it("a teacher granted tuition.read can open the finance pages", () => {
    const granted = { ...grantsByRole.teacher, "tuition.read": ["all" as const] }
    expect(canAccessRoute(granted, routes.invoices)).toBe(true)
    expect(canAccessRoute(grantsByRole.teacher, routes.invoices)).toBe(false)
    expect(canAccessRoute(grantsByRole.teacher, `${routes.invoices}?status=outstanding`)).toBe(false)
  })

  it.each(ROLE_CODES)("%s can open exactly the expected protected pages", (role) => {
    const allowed = Object.keys(routeAccess).filter((route) => canAccessRoute(grantsByRole[role], route))
    expect(allowed.sort()).toEqual([...expected[role]].sort())
  })

  it.each(ROLE_CODES)("%s sidebar shows only pages they can open", (role) => {
    // "Outstanding fees" is the invoices page with a filter; compare paths.
    const hrefs = [
      ...new Set(navigationFor(grantsByRole[role]).flatMap((section) => section.items.map((item) => item.href.split("?")[0]))),
    ]
    const sidebarPages = expected[role].filter((route) => !notInSidebar.has(route))
    expect(hrefs.sort()).toEqual([...sidebarPages, routes.dashboard, routes.notifications, routes.profile].sort())
  })

  it("the student menu lists only pages students can open", () => {
    const hrefs = navigationFor(grantsByRole.student, "student").flatMap((section) => section.items.map((item) => item.href))
    for (const href of hrefs) expect(canAccessRoute(grantsByRole.student, href), href).toBe(true)
    expect(hrefs).toEqual(expect.arrayContaining([routes.dashboard, routes.classes, routes.assignments, routes.timetable, routes.library, routes.analytics, routes.tuition, routes.notifications, routes.profile]))
  })

  it("a user with no permissions (deactivated) can open no protected page", () => {
    expect(Object.keys(routeAccess).filter((route) => canAccessRoute({}, route))).toEqual([])
  })
})

describe("user-management UI rules agree with the database", () => {
  const accounts = {
    superAdmin: "superadmin@bsmart.test",
    admin: "admin@bsmart.test",
    teacher: "gv.hung@bsmart.test",
    parent: "ph.lan@bsmart.test",
    student: "hs.huy@bsmart.test",
  }

  it("canManageUser/assignableRoles predict set_user_role outcomes", async () => {
    const { rows: roles } = await db.query<{ code: string; name: string; rank: number }>(
      "select code, name, rank from public.roles"
    )
    const profiles = new Map<string, { id: string; roleCode: string }>()
    for (const email of Object.values(accounts)) {
      const { rows } = await db.query<{ id: string; role_code: string }>(
        "select id, role_code from public.profiles where email = $1",
        [email]
      )
      profiles.set(email, { id: rows[0].id, roleCode: rows[0].role_code })
    }

    const mismatches: string[] = []
    for (const actorEmail of [accounts.superAdmin, accounts.admin, accounts.teacher]) {
      const actor = profiles.get(actorEmail)!
      const actorGrants = grantsByRole[actor.roleCode as RoleCode]
      for (const [targetEmail, target] of profiles) {
        for (const role of roles) {
          const predicted =
            Boolean(actorGrants["users.manage"]) &&
            canManageUser(actor, target, roles) &&
            assignableRoles(actor.roleCode, roles).some((r) => r.code === role.code)
          const actual = await as(db, actor.id, (tx) =>
            tx.query("select public.set_user_role($1, $2)", [target.id, role.code])
          ).then(
            () => true,
            () => false
          )
          if (predicted !== actual) {
            mismatches.push(`${actorEmail} -> ${targetEmail} as ${role.code}: ui=${predicted} db=${actual}`)
          }
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})
