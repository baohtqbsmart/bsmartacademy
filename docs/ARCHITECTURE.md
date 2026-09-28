# BSmart Academy – Architecture

This document is the reference for how the platform is built. Read it before
adding a module. It is intentionally prescriptive: one way to do each thing.

## 1. System overview

BSmart Academy serves five kinds of users from one application:

| Role          | Primary needs                                                          |
| ------------- | ---------------------------------------------------------------------- |
| `super_admin` | Full access, including the permission matrix and hard deletes          |
| `admin`       | Operations: students, teachers, classes, courses, tuition, reports     |
| `teacher`     | Assigned classes: their students, attendance, lessons, grading         |
| `student`     | Own profile, classes, assignments and grades                           |
| `parent`      | Their own children only                                                |

The planned modules group into bounded domains:

| Domain        | Modules                                                                    |
| ------------- | -------------------------------------------------------------------------- |
| People        | Students, Parents, Teachers, (Users & roles)                                |
| Academics     | Courses, Classes, Attendance, Lesson Planning, Lesson Designer             |
| Assessment    | Question Bank, Tests & Quizzes, Assignments, Student Progress              |
| Learning      | Learning Materials, English Learning, Online Teaching                      |
| Finance       | Tuition (fees, invoices, payments)                                         |
| Communication | Notifications                                                              |
| Insight       | Reports, AI Teaching Assistant                                             |

## 2. Technical architecture

```
Browser ──► Next.js (App Router, React Server Components)
              │  src/proxy.ts           session refresh + optimistic auth redirect
              │  Server Components      read data (services, RLS-scoped)
              │  Server Actions         mutations (validate → authorize → service)
              │  Route Handlers         webhooks, auth email callbacks, file export
              ▼
          Supabase
              ├─ Auth         email/password, invites, password recovery
              ├─ PostgreSQL   schema via SQL migrations, RLS on every table
              └─ Storage      private buckets, RLS on storage.objects
```

Principles:

- **Server first.** Pages are Server Components that fetch data directly. Client
  Components are leaves used for interactivity (forms, menus, charts).
- **Mutations are Server Actions** returning `ActionResult`. No internal REST API.
  Route Handlers are only for things that must be URLs (webhooks, email links, downloads).
- **The database is the last line of defence.** Every table has RLS. App-level
  checks give good UX and clear errors; RLS guarantees correctness even when
  app code is wrong.
- **No ORM.** The typed Supabase client (`Database` type generated from the
  schema) is the query layer; complex reads become SQL views or RPC functions.

## 3. Folder structure

```
bsmart-academy/
├─ docs/ARCHITECTURE.md
├─ supabase/
│  ├─ config.toml                 local stack config (signup disabled: invite-only)
│  └─ migrations/                 ordered SQL migrations (schema, RLS, storage)
└─ src/
   ├─ proxy.ts                    Next 16 request proxy (formerly middleware)
   ├─ app/                        routing only: thin pages, layouts, boundaries
   │  ├─ (auth)/                  public auth screens (centered card layout)
   │  ├─ (app)/                   authenticated shell (sidebar + header)
   │  │  ├─ dashboard/
   │  │  └─ settings/profile/
   │  ├─ auth/confirm/route.ts    email link landing (invite, recovery)
   │  └─ auth/sign-out/route.ts   forced sign-out for inactive accounts
   ├─ features/<module>/          one folder per business module
   │  ├─ schemas.ts               Zod schemas (shared by client + server)
   │  ├─ actions.ts               "use server" mutations
   │  ├─ server/*-service.ts      data access, server-only
   │  └─ components/              module UI
   ├─ components/
   │  ├─ ui/                      shadcn/ui primitives (generated, lightly patched)
   │  ├─ layout/                  app shell: sidebar, header, page header
   │  └─ shared/                  cross-module building blocks
   ├─ config/                     routes, navigation, site metadata
   ├─ hooks/                      client hooks
   ├─ lib/                        infrastructure (no business logic)
   │  ├─ supabase/                client/server/proxy clients, DbClient type
   │  ├─ auth/                    roles, permissions, session (requireRouteAccess / requirePermission)
   │  ├─ action.ts                runAction wrapper for Server Actions
   │  ├─ action-result.ts         ActionResult type + RHF error helper
   │  ├─ errors.ts                AppError + Postgres/Auth error mapping
   │  ├─ env.ts                   validated environment
   │  └─ storage.ts               buckets, path conventions, signed URLs
   └─ types/database.ts           generated Supabase types
```

Dependency direction: `app → features → lib`. `components/ui` and `lib` never
import from `features`. Features do not import each other's `server/` code;
shared needs move to `lib` or become a SQL view/function.

## 4. Module anatomy

A new module (for example `students`) is added like this:

1. `supabase/migrations/<timestamp>_students.sql`: tables, indexes, RLS, triggers.
2. `npm run db:types` to regenerate `src/types/database.ts`.
3. `src/features/students/schemas.ts`: Zod input schemas.
4. `src/features/students/server/student-service.ts`: `import "server-only"`;
   functions take a `DbClient` and throw `AppError`.
5. `src/features/students/actions.ts`: `runAction(schema, input, handler)`;
   handler calls `requirePermission("students.write")`, then the service, then `refresh()` /
   `revalidatePath`.
6. `src/features/students/components/`: forms (RHF + zodResolver) and tables.
7. `src/app/(app)/students/page.tsx`: thin page: `requireRouteAccess(routes.students)`, call service, render.
8. Add the permissions and RLS policies in the migration, the access rule in `src/config/access.ts`, and a `NavItem` in `src/config/navigation.ts`.

`features/profile` is the reference implementation of this pattern.

## 5. Reusable UI components

| Layer               | Components                                                                         |
| ------------------- | ---------------------------------------------------------------------------------- |
| `components/ui`     | shadcn/ui: button, card, input, label, textarea, select, form, table, dialog, sheet, dropdown-menu, avatar, badge, alert, separator, skeleton, tooltip, sonner, sidebar, chart |
| `components/layout` | `AppSidebar`, `UserMenu`, `ThemeToggle`, `PageHeader`                                |
| `components/shared` | `FormAlert`, `SubmitButton`, `UserAvatar`, `ErrorState`                              |

Planned shared components, added when the first module needs them: `DataTable`
(server-paginated, sortable), `EmptyState`, `ConfirmDialog`, `DateRangePicker`,
`FileDropzone`, `StatCard`, chart wrappers around `components/ui/chart` (Recharts).

## 6. Service layer

- Services live in `features/<module>/server/`, begin with `import "server-only"`,
  and accept a `DbClient` as their first argument (easy to test, explicit about
  which client, and therefore which RLS context, is used).
- Services translate database errors with `fromPostgrestError` and throw
  `AppError`. They never return `{ data, error }` tuples to callers.
- Services contain queries and domain rules; they do **not** read cookies,
  redirect, or revalidate. That is the job of actions/pages.

## 7. Database access architecture

- **Schema changes only via migrations** in `supabase/migrations` (`npm run db:new <name>`).
  Never edit a migration that has been applied to production; add a new one.
- **Types** are generated (`npm run db:types`) and committed. Generation needs a
  running database (local stack via Docker, or a linked project); until one is
  available `src/types/database.ts` is maintained by hand in the generator's format.
- **Migrations** (in order):
  1. `foundation`: `roles`, `permissions`, `role_permissions` (the matrix), `profiles`,
     authorization helpers, user-management RPCs, avatars bucket.
  2. `people`: `students`, `parents`, `teachers`, `student_parents`.
  3. `academics`: `subjects`, `levels`, `courses`, `classes`, `class_members`, `enrollments`.
  4. `access_policies`: relationship helpers and RLS for every table in 2–3.
  5. `student_management`: `english_levels` reference data, student contact/level/photo
     columns and generated codes, the `student_directory` view, enrolment RPCs,
     `student_feedback`, and the `student-photos` bucket.
  6. `academic_management`: teacher subjects/qualifications, course status/duration and
     `course_units`, class delivery and `class_schedule_slots`, timetable-conflict and
     lifecycle triggers, `assign_class_teacher` / `move_course_unit`, the
     `timetable_entries` view, and column-level protection of internal notes.
  7. `user_permission_grants`: per-user permission grants on top of roles.
  8. `tuition`: plans, discount rules, student tuition, invoices, payments,
     balance views and the money RPCs.
  9. `attendance`: registers (`attendance_sessions`), `attendance_records`,
     `save_attendance` and the report functions.
  10. `assignments`: assignments, questions and answer keys, attachments, submissions
     (attempts), files, grades, history events, the `assignment-files` bucket and the
     student/teacher RPCs.
  11. `question_bank_tests`: bank questions and keys, tests with copied questions and keys,
     attempts and answers, database-side grading, review policy and analytics functions.
  12. `english_learning`: word bank and sets, practice and spaced repetition, lessons for six
     skills with exercises (copied bank questions), submissions with rubric feedback, skill performance.
  13. `assessments`: writing and speaking tasks with rubric copies, submissions (text, document,
     recording), grades, annotations, reusable comments, history events.
  14. `online_teaching`: online sessions with meeting links (Google Meet, Zoom, Teams), materials,
     linked homework, teaching notes, the join log, `join_online_session` and online-day attendance.
  15. `lesson_designer`: design templates, designs (one validated JSON document each, versioned),
     design uploads, share links (`set_design_sharing`, `shared_design`).
  16. `material_library`: library folders, materials (one file each with catalogue data, scope and visibility),
     class assignments, student shares, favourites and the `library/` storage rules.
  17. `progress_analytics`: read-only, security-invoker `progress_results`, `homework_completion` and
     `vocabulary_mastery` over the existing modules.
  18. `communication`: announcements, notifications (+ preferences, system triggers, `sync_my_notifications`),
     teacher–parent message threads and messages.
  19. `reports`: the `reports.read` permission (reports read existing data through RLS).
  20. `ai_assistant`: AI drafts (draft → approved/discarded, original output kept), AI request log with
     per-teacher limits (`begin_ai_request`/`finish_ai_request`).
  21. `audit_hardening`: rate limits on messages, new conversations and teachers' announcements.
  22. `performance_indexes`: indexes on foreign keys used by policies, joins and reports, and on
     "latest by author" lookups used by the rate limits. No behaviour change.
- **Data model:**

  ```
  auth.users 1─1 profiles *─1 roles 1─* role_permissions *─1 permissions
  profiles 1─0..1 students | parents | teachers        (profile_id, unique, nullable)
  students *─* parents   via student_parents (relationship, one primary contact)
  subjects 1─* levels ; subjects 1─* courses *─0..1 levels (composite FK keeps level in subject)
  courses 1─* classes
  classes *─* teachers   via class_members (lead_teacher | assistant_teacher, one lead)
  classes *─* students   via enrollments   (pending | active | completed | withdrawn)
  ```

  "Users" are Supabase `auth.users`; `profiles` holds the application data. Person
  records are separate from accounts because young students and some parents
  have no login.
- **Clients** (`src/lib/supabase`):
  - `server.ts`: per-request, cookie-bound, runs as the signed-in user (RLS).
  - `client.ts`: browser, same user context; used for direct Storage uploads and
    (later) Realtime subscriptions.
  - `proxy.ts`: used only by `src/proxy.ts` to refresh sessions.
  - A service-role client is intentionally **not** created yet. When needed
    (admin user provisioning, background jobs) it goes in
    `lib/supabase/admin.ts` with `import "server-only"`, reads a non-public
    `SUPABASE_SECRET_KEY`, and is only used after an explicit `requirePermission(...)`.
- **Conventions:** snake_case tables and columns, `uuid` primary keys (natural
  text keys for `roles`/`permissions`), `created_at`/`updated_at` maintained by
  `private.set_updated_at()`, an index on every FK used for lookups, enum types
  for closed sets, CHECK constraints for codes and dates, unique business codes
  (`student_code`, `teacher_code`, `code`).
- **Soft deletion:** people and catalogue tables (`students`, `parents`,
  `teachers`, `subjects`, `levels`, `courses`, `classes`) have `deleted_at`.
  Archived rows are visible only to roles holding `<module>.write`; hard deletes
  require `<module>.delete` (super admin only). Real-life state is separate
  (`students.status = 'withdrawn'`, `enrollments.status`), and accounts are
  deactivated with `profiles.is_active`. Link tables are hard-deleted.
- **Helpers** that must not be reachable through the Data API live in the
  `private` schema (not exposed by PostgREST).
- **Complex reads** (reports, dashboards) become SQL views or `security invoker`
  functions so they stay RLS-aware and are typed by the generator.

## 8. Authentication architecture

- Supabase Auth with email + password. **Self sign-up is disabled**: staff create
  accounts by invitation. The invitee's role is set in `app_metadata.role`
  (only settable with the service key), and the `handle_new_user` trigger copies it into
  `profiles.role_code` (default `student`, the least-privileged role). After that,
  roles change only through `set_user_role()`.
- Supported flows: sign in, sign out, persistent sessions (refresh tokens in
  cookies), forgot/reset password, invitation acceptance, protected routes.
- Sessions are stored in HTTP-only cookies via `@supabase/ssr`. `src/proxy.ts`
  refreshes them on every request using `getClaims()` (verifies the JWT).
- Email links (invite, recovery) land on `/auth/confirm`, which supports both the
  token-hash template and the PKCE `code` flow, then sends invited/recovering users to
  `/auth/set-password`.
- `getCurrentUser()` (React `cache`d per request) returns the verified user
  **joined with their profile**. Deactivated accounts are signed out via
  `/auth/sign-out?reason=inactive`.

## 9. Authorization architecture

RBAC is **data**: `role_permissions` grants each role a permission
(`<module>.<action>`) at a **scope**:

| Scope      | Rows it grants                                                   |
| ---------- | ---------------------------------------------------------------- |
| `all`      | every live row                                                   |
| `assigned` | rows linked to classes the user teaches (via `class_members`)    |
| `own`      | the user's own record and their own classes                      |
| `children` | rows linked to the user's children (via `student_parents`)       |

Current matrix (`tests/db/matrix.test.ts` snapshots it):

| Permission            | super_admin | admin | teacher  | student | parent   |
| --------------------- | ----------- | ----- | -------- | ------- | -------- |
| users.read / .manage  | all         | all   |          |         |          |
| roles.manage          | all         |       |          |         |          |
| students.read         | all         | all   | assigned | own     | children |
| parents.read          | all         | all   | assigned |         | own      |
| teachers.read         | all         | all   | own      | own¹    | children |
| courses.read          | all         | all   | all      | all     | all      |
| classes.read          | all         | all   | assigned | own     | children |
| enrollments.read      | all         | all   | assigned | own     | children |
| feedback.read         | all         | all   | assigned | own     | children |
| feedback.write        | all         | all   | assigned |         |          |
| tuition.read          | all         | all   |          | own     | children |
| tuition.write         | all         | all   |          |         |          |
| payments.write        | all         | all   |          |         |          |
| attendance.read       | all         | all   | assigned | own     | children |
| attendance.write      | all         | all   | assigned |         |          |
| assignments.read      | all         | all   | assigned | own     | children |
| assignments.write     | all         | all   | assigned |         |          |
| submissions.write     |             |       |          | own     |          |
| question_bank.read    | all         | all   | all      |         |          |
| question_bank.write   | all         | all   | own      |         |          |
| tests.read            | all         | all   | assigned | own     | children |
| tests.write           | all         | all   | assigned |         |          |
| test_attempts.write   |             |       |          | own     |          |
| english.read          | all         | all   | all      | all     | all      |
| english.write         | all         | all   | own      |         |          |
| english.practice      |             |       |          | own     |          |
| english.results       | all         | all   | assigned | own     | children |
| english.review        | all         | all   | assigned |         |          |
| assessments.read      | all         | all   | assigned | own     | children |
| assessments.write     | all         | all   | assigned |         |          |
| assessments.submit    |             |       |          | own     |          |
| online.read           | all         | all   | assigned | own     | children |
| online.write          | all         | all   | assigned |         |          |
| designs.read          | all         | all   | own      |         |          |
| designs.write         | all         | all   | own      |         |          |
| library.read          | all         | all   | assigned | own     | children |
| library.write         | all         | all   | own      |         |          |
| analytics.read        | all         | all   | assigned | own     | children |
| announcements.read    | all         | all   | assigned | own     | children |
| announcements.write   | all         | all   | assigned |         |          |
| messages.read         | all         | all   | assigned |         | children |
| messages.write        |             |       | assigned |         | children |
| reports.read          | all         | all   | assigned |         |          |
| ai.use                | all         | all   | own      |         |          |
| *.write (each module) | all         | all   |          |         |          |
| *.delete (hard)       | all         |       |          |         |          |

Roles are the baseline; **individual grants** (`user_permissions`) add a
permission to one account (e.g. finance access for one teacher). Effective
permissions = role ∪ grants, used by `has_permission()` and `my_permissions()`.
A grant can only be made by someone who may manage that account and who holds
the permission themselves.

¹ a student sees the teachers of their own classes. Withdrawn enrolments and
archived classes/students never grant access. Admins can manage only accounts
ranked below them (`roles.rank`), cannot grant `admin`/`super_admin`, and nobody can
change their own role.

Planned modules get their permissions in their own migration, e.g.
`tuition.*` (super_admin/admin: all; parent: children), `reports.read`
(super_admin/admin), `assignments.*`, `grades.*`, `materials.*`, `lessons.*`
(teacher: assigned; student: own; parent: children, read only).

Enforcement has three layers, each necessary:

1. **Proxy (optimistic):** unauthenticated requests to non-public routes are
   redirected to `/login?next=...`. No permission checks here (no DB access).
2. **Application** (`lib/auth/session.ts`), using the permissions loaded once per
   request from `my_permissions()`:
   - pages call `requireRouteAccess(route)`, which checks the rule in
     `config/access.ts` and renders **404** on failure, so direct URLs neither
     work nor reveal the page;
   - Server Actions call `requirePermission(permission)`, which returns a typed
     FORBIDDEN error;
   - the sidebar is derived from the same `config/access.ts` rules.
3. **Database (authoritative):** RLS on every table and the avatars bucket.
   Policies call `private.has_permission(code, scope)` plus relationship helpers
   (`private.teaches_student`, `private.is_parent_of`, `private.is_class_student`, …),
   so changing the matrix changes what Postgres returns. Column grants stop
   users editing `profiles.role_code`/`is_active`/`email`; role changes go through
   `set_user_role()` / `set_user_active()`, which enforce the rank rules.

## 10. Error handling

| Where                   | Mechanism                                                                        |
| ----------------------- | -------------------------------------------------------------------------------- |
| Services                | throw `AppError(code, userMessage)`; map DB/Auth errors via `lib/errors.ts`      |
| Server Actions          | `runAction` returns `ActionResult`; unexpected errors logged, generic message    |
| Forms                   | `applyActionError` puts field errors on inputs, form error in `FormAlert`/toast  |
| Server Component render | thrown errors hit `error.tsx` boundaries (`(app)/error.tsx`, `app/error.tsx`)    |
| Missing records         | `notFound()` → `app/not-found.tsx`                                               |
| Config                  | `getPublicEnv()` fails fast with the list of missing variables                   |

User-facing messages never contain raw database or stack information.

## 11. Validation strategy

- **Zod is the single source of truth** for input shapes. Each module's
  `schemas.ts` is imported by the client form (`zodResolver`) and the Server
  Action (`runAction`) so rules cannot drift.
- Client validation is for UX only; the server always re-validates.
- Normalisation (trim, lowercase email) happens in the schema, so services
  receive clean data.
- The database enforces invariants too (NOT NULL, CHECK, FK, UNIQUE, enums).
  Violations are mapped to readable errors by `fromPostgrestError`.

## 12. File storage strategy

- All buckets are **private**. Files are displayed through short-lived signed URLs
  (`createSignedUrl`, 1 hour).
- Object paths start with the owning entity id (`<user_id>/avatar`,
  later `<class_id>/<material_id>/<filename>`) so RLS on `storage.objects` can
  authorize by folder.
- Bucket limits (size, MIME types) are set in SQL and mirrored in `lib/storage.ts`
  for early client-side feedback.
- **Uploads go directly from the browser to Storage** (no file bytes through
  Server Actions), then a Server Action records the path in the database.
- Planned buckets: `learning-materials` (class-scoped), `submissions`
  (student-scoped, teacher-readable), `lesson-assets`, `exports` (generated reports).

## 13. AI integration architecture

The AI Teaching Assistant is built (section 29) on this plan; items still marked
*future* below (retrieval with pgvector, streaming chat) are not implemented yet:

- `src/lib/ai/`: a thin provider module (server-only) wrapping the model SDK,
  with the API key in a non-public env var. All AI calls run on the server.
- `src/features/ai-assistant/`: use-case functions (generate lesson plan draft,
  generate quiz questions into the Question Bank, feedback on English writing,
  summarise student progress). Each has a Zod schema for **structured output**, so
  AI results are validated like any other input before being saved.
- **Human in the loop:** AI output is saved as a *draft* that a teacher reviews
  and publishes; nothing AI-generated reaches students unreviewed.
- *Future* — **context retrieval:** course materials are embedded with `pgvector` in the same
  Postgres database, and RLS-scoped queries ensure the assistant only sees data
  the requesting user may see.
- *Future* — **streaming** responses via a Route Handler for chat-style UX; batch jobs
  (e.g. generating a question set) via background processing with status rows.
- **Governance:** an `ai_requests` table logs user, feature, token usage and cost
  for per-role rate limits and auditing; prompts live in versioned files, not inline strings.

## 14. Testing

| Suite                         | What it proves                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------ |
| `tests/db/rls.test.ts`        | Real migrations + seed on PGlite (Postgres in WASM). Per role: which rows are visible, which writes are refused, privilege escalation, user-management RPC rules, integrity constraints, storage policies. |
| `tests/db/matrix.test.ts`     | App constants match the DB; permission matrix snapshot; which protected URLs each role can open; UI rank rules predict `set_user_role` outcomes. |
| `tests/app/page-guards.test.ts` | Every page under `(app)` is either open to all signed-in users or calls `requireRouteAccess` for its own route. |
| `tests/db/students.test.ts`, `academics.test.ts`, `tuition.test.ts`, `attendance.test.ts`, `assignments.test.ts`, `test-engine.test.ts`, `english.test.ts`, `assessments.test.ts` | Per-module RLS (who sees which rows, per seeded account), RPC rules and integrity constraints. |
| `src/**/*.test.ts`            | Unit tests (redirect safety, permission helpers, error mapping, money, attendance rates and warnings). |

`tests/db/supabase-shim.sql` emulates the Supabase objects the migrations use
(API roles and default grants, `auth.users`/`auth.uid()`, `storage.objects`).
It is an emulation: before production, also run the migrations and a sign-in
smoke test against a real Supabase project or the local Docker stack.

## 15. Student Management module

| Piece | Where |
| ----- | ----- |
| List (search, filters, sort, pagination) | `app/(app)/students/page.tsx`. State lives in the URL (`features/students/list-query.ts`); queries run against the `student_directory` view (security invoker, so RLS applies; accent-insensitive `search_text`) |
| Profile + tabs | `app/(app)/students/[id]/page.tsx`, tabs in `features/students/profile-tabs.ts` (`?tab=`); only the active tab's data is loaded |
| Add / edit | `students/new`, `students/[id]/edit`, `StudentForm` (RHF + `studentSchema`); student IDs are generated by the database (`HS0001`, …) |
| Archive / restore | soft delete (`deleted_at`); archived students are hidden from teachers and parents |
| Parents | link/unlink on the profile (`student_parents`, one primary contact) |
| Enrolment and class assignment | `enroll_student`, `set_enrollment_status`, `transfer_enrollment` RPCs: atomic, capacity-checked; re-enrolling a withdrawn student reuses the record |
| English level | `english_levels`: CEFR Pre-A1–C2, Pre-IELTS, IELTS 3.0–9.0, Cambridge Starters→CPE, each with a CEFR equivalent; students have a current and a target level |
| Teacher feedback | `student_feedback`; author set by trigger from the session; teachers write for students they teach, students/parents read their own |
| Photo | `student-photos` bucket, `<student_id>/photo`, readable wherever the student is visible |

Tabs for modules that do not exist yet (Grades, Materials) show an explicit "not available yet" state and no data.

## 16. Teachers, classes, courses, subjects and timetable

| Area | Notes |
| ---- | ----- |
| Teachers | `/teachers`, profile with subjects (`teacher_subjects`), qualifications, classes and teaching schedule |
| Subjects & levels | `/subjects` (catalogue admin, `courses.write`); ordered levels per subject |
| Courses | draft → active → inactive; `course_units` is the reusable, ordered structure shared by all classes of a course (reordered atomically by `move_course_unit`) |
| Classes | subject/level come from the course (not duplicated); delivery in person / online / hybrid; teachers via `assign_class_teacher` (one lead; making a new lead demotes the old one); students via the enrolment RPCs (add, remove = withdraw, transfer) |
| Timetable | weekly `class_schedule_slots`; `/timetable` shows a real calendar week (a class appears only between its start and end dates) through the `timetable_entries` security-invoker view: teachers see their classes, students their own, parents their children's (labelled per child), admins all (filterable by teacher) |

Integrity rules enforced in Postgres (each covered by `tests/db/academics.test.ts`):

- no teacher and no room is double-booked across planned/running classes with
  overlapping dates (checked after slot, assignment and class date/room/status
  changes; serialised with an advisory lock; online classes never clash on rooms);
- only active teachers can be assigned; teachers, courses, subjects and levels
  still in use cannot be archived or deactivated;
- new classes need an active course; students can only be enrolled in planned or
  running classes; online/hybrid classes need an `https://` meeting link.

**Column-level privacy.** RLS filters rows, not columns. `students.notes`,
`teachers.notes` and `parents.notes` are therefore withheld from the API role
entirely and served by `student_notes()` (admins and the student's teachers) and
`teacher_notes()` (teacher editors). Select explicit columns from these tables;
`select *` is refused for API users.

## 17. Tuition

| Piece | Where |
| ----- | ----- |
| Plans & discount rules | `/tuition/plans`: price per course, duration, schedule (one payment / monthly / quarterly), percent or fixed discount rules (any plan or one plan) |
| Student tuition | `/tuition/students`, student profile "Tuition" tab. `assign_tuition()` snapshots the price, applies discounts (never below zero) and issues installment invoices (equal parts rounded to 1,000 ₫, remainder on the last) in one transaction |
| Invoices / outstanding fees | `/tuition/invoices` (`?status=outstanding`, `overdue`, …), `/tuition/invoices/[id]` |
| Payments & history | recorded against an invoice (`record_payment()`), `/tuition/payments`; printable receipt `/tuition/payments/[id]/receipt` with the amount in Vietnamese words |
| Dashboard & reports | `/tuition` (staff), `/tuition/reports`; aggregation in `features/tuition/summary.ts` (unit-tested) |
| Family view | `/tuition` for students and parents: their own / children's tuition, invoices and receipts |

**Money rules (database-enforced):** amounts are whole đồng (`numeric(14,0)`);
paid/remaining/status are derived in `invoice_balances` and
`student_tuition_balances`, never stored; "overdue" uses the academy date
(`Asia/Ho_Chi_Minh`); payments cannot exceed the remaining balance (invoice row
locked); student, receipt number and recording staff member are set by the
server; tuition, invoices and payments cannot be updated or deleted through the
API; mistakes are voided with a reason (`void_payment`, `void_invoice` only when
no payments, `cancel_tuition` voids unpaid invoices).

**Access:** finance staff (`tuition.read` all) see everything; students their
own; parents their children's (archived students excluded); teachers nothing
unless granted individually. The price list is staff-only.

**Payment gateway readiness:** `lib/payments` defines a `PaymentProvider`
interface. Today only the `manual` provider exists (staff at the desk). A gateway
adds a provider with `createCheckout` + `verifyWebhook` and a webhook Route
Handler that calls `record_payment()` with `payment_provider` and the gateway's
event id as `external_payment_id`; the unique `(provider, provider_payment_id)`
makes retries idempotent. No banking API is connected.

## 18. Attendance

| Piece | Where |
| ----- | ----- |
| Take attendance | Class page → "Take attendance" → `/classes/[id]/attendance?date=`: pick a date, every student enrolled that day is listed; mark Present / Late (minutes) / Absent / Excused, "Online" for hybrid classes, a note per student and for the session; save. Saving again corrects the same register |
| Registers | `attendance_sessions`: one per class and date (who took it, notes). Academy staff can delete a register taken on the wrong date |
| Dashboard & reports | `/attendance`: date range, class and teacher filters; attendance rate, registers taken, absences, late arrivals, students to follow up; weekly rate chart (with table); report by student / class / teacher |
| Student & parent view | `/attendance` shows their own / their children's figures, warnings and history; the student profile "Attendance" tab shows the last 90 days |
| Warnings | `attendance_alerts()` returns each student's current run of absences and absences in the last 30 days (active classes only); `features/attendance/summary.ts` turns them into "Watch" (2 in a row or 3 in 30 days) or "Needs follow-up" (3 in a row or 5 in 30 days). Excused absences neither count nor break a run |

**Rate:** (present + late) ÷ (present + late + absent); excused sessions are left out.

**Rules enforced in Postgres** (each covered by `tests/db/attendance.test.ts`):

- one record per student, class and date: `attendance_records_one_per_student_class_date`
  (unique), and one register per class and date; `class_id`/`session_date` are copied from
  the register and tied to it by a composite foreign key;
- only students enrolled in the class on that date (and not archived) can be marked;
- registers only for active/completed, non-archived classes, within the class dates, never in the future;
- in-person classes record in-person attendance, online classes online, hybrid either;
  absent/excused have no mode; only late has minutes late;
- the author (`recorded_by`) is set from the session; a record's student and register never change;
  records are corrected, never deleted individually.

**Access:** teachers read and write attendance only in classes they currently teach,
and only for students they can see (withdrawn and archived students drop out);
students read their own (including classes they have left); parents their
children's; admins everything. Reports are `security invoker` SQL functions
(`attendance_summary`, `attendance_trend`, `attendance_alerts`), so they only ever
aggregate rows the caller may read.

## 19. Assignments

| Piece | Where |
| ----- | ----- |
| List | `/assignments`: staff filter by class, status and type and see how many are handed in / to grade; students and parents see their (children's) work with status and returned grades. The student profile "Assignments" tab shows the same per student |
| Create / edit | `/assignments/new`, `/assignments/[id]/edit`: title, class (course and level come from the class), type (homework, worksheet, vocabulary, grammar, reading, listening, speaking, writing, project, quiz, test), skill, description, instructions, due date, time limit, maximum score, late work accepted, file required. Always saved as a draft |
| Lifecycle | On the assignment page: publish now, schedule (publish at a time), unschedule, close, reopen, archive, restore, delete a never-published draft |
| Questions & answer key | Multiple choice, short answer (accepted answers), long answer (model answer). Keys live in `assignment_answer_keys`, readable by the class's editors only. Questions freeze once a student starts |
| Attachments | Teacher files on the assignment (max 10) |
| Student workflow | Assignment page → Start → `/assignments/[id]/work`: read instructions, answer, upload files (max 5), save draft, submit (confirmation dialog) → back on the assignment page with a confirmation (time + reference) |
| Teacher workflow | Assignment page → submissions roster → `/assignments/[id]/submissions/[submissionId]`: answers with the key and auto-marks, files, history; score + feedback; "save without returning" or "save and return"; "Return all graded" on the assignment page; allow / withdraw resubmission |

**States.** Assignment: draft → scheduled → published → closed → archived (`prepare_assignment()`
enforces the allowed moves; a scheduled assignment is visible once `publish_at` has passed,
no background job needed). Work: in progress → submitted (flagged late after the due
date) → graded → returned. Students and parents see "submitted" until the grade is returned.

**Rules enforced in Postgres** (covered by `tests/db/assignments.test.ts`, mutation-tested):

- only the assignment's class teachers (or admins) create, publish and grade it; students only
  see released work of classes they attend; parents their children's;
- a submission is locked once handed in: students can only change `answers`/`response_text`
  (column grant) of their own attempt while it is in progress; status, lateness, attempt and
  grades are set by `start_submission` / `submit_submission` / `grade_submission`;
- a new attempt needs the teacher's `set_resubmission`; every attempt is kept, with a
  `submission_events` history (started, submitted, graded, returned, resubmission allowed);
- grades (and the "graded" history entries, which carry the score) are hidden from students
  and parents until returned; scores stay within 0..max; the maximum cannot drop below
  existing grades;
- timed attempts cannot be changed after `deadline_at` (they can still be handed in); late
  work is flagged, or refused when late work is not accepted; closed assignments take no work.

**File validation** (four layers):

1. browser: extension-based type, size ≤ 20 MB, file count (`lib/uploads.ts`);
2. Storage: private `assignment-files` bucket with a size limit and MIME allow-list; RLS
   allows uploads only to `assignments/<id>/` for editors and `submissions/<id>/` for the
   student while the attempt is open, and only with an accepted extension;
3. server: the uploaded bytes are read back and their signature must match the type
   (`matchesSignature`: PDF, Office ZIP + app folder, images, audio, MP4, UTF-8 text);
   mismatches are deleted;
4. database: `validate_upload()` checks the type/extension pair, the folder and random
   file name, the size limit, that the object exists, and that the size/type agree with
   what Storage recorded; file counts are limited; files freeze with the submission.

The accepted types live in `public.upload_file_types`; the test suite fails if the bucket
or `UPLOAD_RULES` drift from it.

## 20. Question bank and tests

| Piece | Where |
| ----- | ----- |
| Question bank | `/question-bank`: search (prompt, topic, tags) and filter by subject, type, skill, CEFR level, difficulty, tag, author, archived. Create / edit, duplicate, archive / restore, audio or picture per question. Shared by all teachers; each edits their own questions (admins any) |
| Question types | multiple choice, multiple response, true/false, matching, fill in the blank (`___` in the prompt, alternatives per blank), short answer, essay, listening (audio + options or written answer), speaking (uploaded recording), sentence transformation, error correction |
| Metadata | subject, skill, CEFR level, topic, difficulty, type, correct answer, explanation, score (points), tags; version and "copied from" |
| Test builder | `/tests/new`, `/tests/[id]`: pick questions from the bank (copied with their keys), reorder, change points; settings: opening/closing time, time limit, attempts, randomised questions and options, total score, when students see answers; publish / close / reopen / archive |
| Taking a test | `/tests/[id]` → Start → `/tests/[id]/take`: answers autosave per question, countdown with automatic hand-in, submit with confirmation → attempt page with confirmation |
| Results | `/tests/[id]?view=results` (every attempt of every student, hand in expired attempts), `/tests/[id]/attempts/[attemptId]` (answers, marks; teachers mark open questions or override marks) |
| Analytics | `/tests/[id]?view=analytics`: students attempted, average / median / highest / lowest of best attempts, attempts waiting for marking, score distribution chart (with table), per-question average, full marks, left blank, to mark |

**Grading.** `private.grade_response()` marks multiple choice, multiple response
(partial credit, wrong picks cancel right ones), true/false, matching (per pair),
fill in the blank (per blank, alternatives, optional case sensitivity) and listening
with options. Short answer, transformation and error correction earn full marks when
they match a listed answer (ignoring case, spacing and a final full stop) and otherwise
go to the teacher, like essays, speaking and written listening answers. Raw points are
scaled to the test's total score; an attempt is "graded" once nothing waits for a teacher.

**Security** (enforced in Postgres, covered by `tests/db/test-engine.test.ts`, mutation-tested):

- answer keys live in separate tables readable only by staff (bank) or the test's editors;
  grading runs in security-definer SQL, so keys never pass through a student's session;
- students see a test's questions only after starting an attempt; parents only after a child has;
- marks, feedback and explanations in `test_answers` are withheld from the API by column
  privileges; `attempt_details()` returns them (and correct answers) to students and
  parents only when the review policy allows: never / after the student's last attempt /
  after the test closes, so earlier attempts cannot leak answers for later ones;
- answers are accepted only for the student's own open attempt, for questions in that
  attempt, in the question's format, until the deadline (time limit or closing time);
  attempts are created, handed in and scored only by the functions; expired attempts
  are handed in on the next start, by the teacher, or when the test closes;
- tests copy their questions: bank edits never change a published test or its results;
  a test's questions change only while it is a draft; scoring and randomisation freeze
  once anyone has started; attempts can only go up;
- spoken answers are uploaded to `test-attempts/<attempt>/`, checked like assignment files
  (type, size, content signature) and must be audio.

## 21. English learning

| Piece | Where |
| ----- | ----- |
| Dashboard | `/english`: students see their skill profile (chart + table), words learning / learnt / due for review, work waiting for feedback, recent activity and lessons to try next (weakest skill first); parents the same per child; teachers a review queue and a students × skills table (filter by class), with each student's dashboard one click away |
| Vocabulary | `/english/vocabulary`: word bank (word, IPA, part of speech, Vietnamese meaning, English definition, example, audio, picture, collocations, synonyms, antonyms, CEFR level, topic) and word sets; `/sets/[id]` shows the words and each student's box |
| Vocabulary practice | `/sets/[id]/practice?activity=`: flashcards, matching, multiple choice, fill in the blank (from the example), spelling (listen and type), pronunciation (listen, record yourself on the device, compare, self-assess). Words without uploaded audio are read by the browser's English voice |
| Lessons | `/english/lessons` by skill. Grammar: explanation, form, usage, examples, common mistakes, exercises + key. Reading: passage, glossed words, questions + key. Listening: audio, transcript, questions + key. Speaking / pronunciation: prompt, audio or video recording (recorded in the browser or uploaded), teacher feedback. Writing: prompt, word limits, rubric, submission, feedback, model answer |
| Review | `/english/submissions/[id]`: the work (text / audio / video), rubric scores per criterion (the score is their sum) or one score, feedback |

**Tracking by skill.** `english_skill_performance()` (security invoker) averages, per student and skill:
vocabulary practice rounds, lesson exercise attempts, reviewed speaking/writing/pronunciation
work, and returned assignment grades whose skill is an English skill.

**Spaced repetition.** Each practice round moves words between five boxes (right: up a box,
review in 1/2/4/7/14 days; wrong: back to box 1, review tomorrow). Boxes 4–5 count as learnt.

**What is trusted where.** Vocabulary answers are on the word cards, so practice rounds are
built and checked in the browser and only the results are recorded (validated: the words must
belong to the published set, and only students record). Lesson exercises are graded in SQL
against keys students cannot read (the same `grade_response()` as tests); after handing in,
a student sees the correct answers for that attempt. Transcripts and model answers are shown
once the student has done the lesson. Recordings live in `english/<student_id>/`, readable by
the student, their parents and their teachers only, and are checked like every other upload.
Content (words, sets, lessons) belongs to its author; admins edit everything.

## 22. Writing and speaking assessment

Class-based, teacher-marked assessment (the English lessons in section 21 stay the
self-study library).

| Piece | Where |
| ----- | ----- |
| Tasks | `/assessments`, `/assessments/new`: writing (task, level, instructions, word limits, write online and/or upload PDF/Word/text) or speaking (prompt, audio and/or video, recording length); due date, late work, attempts; rubric copied from a template |
| Rubrics | `/assessments/rubrics`: built-in General writing (Content, Organization, Vocabulary, Grammar), IELTS-style Writing (Task Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy, bands 0–9), Speaking (Fluency, Pronunciation, Vocabulary, Grammar, Interaction, Content); teachers add their own |
| Student | Task page → write (live word count) or upload / record → hand in (confirmation) → feedback on the submission page when returned; resubmission when attempts remain or the teacher allows it |
| Grading | `/assessments/submissions/[id]`: select words to highlight them with a category, comment and suggested correction; time-stamped comments on recordings; general comments; reusable comments (insert, or save a new one); a score per criterion with the live total / band; feedback; save privately or return; allow resubmission |
| Comment library | `/assessments/comments`: shared (built-in) and private reusable comments |
| History | `/assessments/history`: every attempt with its result, and each criterion's average (weakest first), separately for writing and speaking |

**Scoring.** Points: the sum of the criteria (half points allowed). IELTS-style: whole bands
per criterion, overall = average rounded to the nearest half band, halves up (6.25 → 6.5,
6.75 → 7), always labelled "IELTS-style practice marking … not an official IELTS score".

**Rules in Postgres** (`tests/db/assessments.test.ts`, mutation-tested): only the class's
teachers (and admins) set, see and grade the work; grades and annotations are hidden from
students and parents until returned; scores must fit each criterion; the rubric freezes once
work is handed in; attempts, resubmission permission, due dates and closing are enforced in
`submit_assessment`; highlights must lie inside the submitted text, never overlap, and their
quoted text is taken from the submission; uploaded files are type/size/signature-checked and
readable per file (a teacher of one class never reaches the student's work for another).

**AI-assisted feedback (policy for later).** Nothing is AI-generated today. Every annotation
has a `source`; the API always stores `teacher` (a forged value is overwritten), and grades
have no AI path at all: `grade_assessment()` records the teacher and is the only way to
write a score. When an AI helper is added it must write annotations with
`source = 'ai_assisted'` (server side), the UI labels them **AI-assisted feedback** with the
notice in `features/assessments/scoring.ts`, and AI output must never be written to
`assessment_grades` or presented as an examination score.

## 23. Online Teaching Center

BSmart does not host video. Lessons run in **Google Meet, Zoom or Microsoft Teams**; BSmart
schedules them, holds the link and everything around the lesson.

| Piece | Where |
| ----- | ----- |
| Sessions | `/online`: Upcoming, Past and a month Calendar (`?view=`, `&month=`, staff filter by class) |
| Scheduling | `/online/new`, `/online/[id]/edit`: class → teacher (the class's teachers) → date, start and end (Vietnam time) → platform and meeting link (the platform is recognised from a pasted link; "Open Google Meet / Zoom / Teams" helpers), meeting ID, passcode, agenda, recording link |
| Session page | `/online/[id]`: Start lesson (opens the meeting and marks it live), End, Reopen, Cancel with a reason, Restore; materials (links and uploaded files, each shown or hidden to students); homework (link a class assignment or create one); staff-only teaching notes; the join log and a link to the class register for that date |
| Students | Upcoming list with **Join lesson** (opens 15 minutes before the start, until the end or while live); materials, recording and homework on the session page |
| Attendance | The normal class register (`/classes/[id]/attendance?date=`). On a day with an online session an in-person class is treated as hybrid and attendance defaults to online, both in the UI and in `prepare_attendance_record()` |

**Rules in Postgres** (`tests/db/online.test.ts`, mutation-tested): only the class's teachers
(and admins) schedule and change sessions; the teacher must teach the class; sessions fall
within the class dates, last at most 8 hours and a teacher is never double-booked; the
status follows scheduled → live → ended (cancel/restore/reopen as allowed); meeting links
must match the chosen platform (the same patterns as `src/lib/meetings`); students and parents
see their (children's) classes only, never hidden materials or teaching notes; homework must
belong to the same class; files are checked like every upload and stored under
`online-sessions/<session_id>/`. `join_online_session()` is the only way a join is logged:
students only, their own class, not cancelled, within the join window.

**Automatic meetings (prepared, not connected).** `src/lib/meetings/index.ts` defines the
`MeetingIntegration` interface (create, update, cancel) and `getIntegration(provider)`, which
returns `null` today, so teachers paste links. The database already has `link_source`
(`manual` | `api`) and `external_meeting_id` (unique per platform). Connecting a provider means:
an OAuth app per platform (Google Calendar API with conferenceData for Meet, Zoom Server-to-Server
OAuth, Microsoft Graph `onlineMeetings`); secrets server-side only; `saveSession()` calls
`createMeeting()` and stores the link with `link_source = 'api'`; edits and cancellations call
`updateMeeting()` / `cancelMeeting()`; optional provider webhooks (meeting started/ended,
participant joined, recording ready) update the status, the join log and `recording_url`.

## 24. Lesson designer

A page editor for teachers (a simplified Canva/PowerPoint): presentation slides, worksheets,
flashcards, vocabulary cards, grammar activities, quizzes and exit tickets.

| Piece | Where |
| ----- | ----- |
| Designs | `/designs`: own designs (admins: everyone's) with first-page thumbnails, filter by type, search |
| New | `/designs/new`: blank (type + page size: slide 16:9, A4 portrait/landscape, card 3:2, square) or one of nine templates — Vocabulary, Grammar, Reading, Listening, Speaking, Writing, IELTS-style, Cambridge-style, Review |
| Editor | `/designs/[id]`: tools Text, Image, Shape, Table, Icon, Audio, Video, Question, Button; drag, resize (Shift keeps proportions), snapping to the page and other items (Alt turns it off), duplicate, delete, layer order, pages (add, duplicate, delete, reorder by drag or buttons), undo/redo (100 steps; a drag or a burst of typing is one step), in-place text editing, autosave |
| Preview | Full-screen presenter in the editor and at `/designs/[id]/preview`: buttons (next/previous/go to page/open link/reveal), hidden items appear on Reveal (answers, flashcard backs), practice questions can be checked (nothing is recorded or graded) |
| Share | A link `/designs/shared/<token>` for any signed-in BSmart user (not public); stop or reset it at any time |
| Export | PDF (all pages) and PNG (current page), made in the browser with html-to-image and jsPDF; optional teacher copy with answers. Pages are pictures, so PDF text is not selectable; audio and video are placeholders. **PowerPoint and Word are shown as not supported**: no reliable conversion exists yet, so none is offered |

**Model.** `src/features/designer/model.ts` defines the document (pages of positioned
elements in page pixels) as a Zod schema; `private.design_content_problem()` applies the same
rules in Postgres (tests/db/designer.test.ts runs every case through both). Rules include:
known element types only, colours as `#rrggbb`, links `https://` only (no `javascript:`),
buttons pointing at existing pages, valid questions, table shapes, 60 pages × 150 elements,
1 MB of content, and pictures/audio/video that are uploads of *this* design of the right kind.

**Rules in Postgres** (mutation-tested, 10 of 10 caught): teachers see and change only their own
designs, admins all; owner, template and share token are not client-writable (column grants;
sharing only through `set_design_sharing()`); each save names the version it started from, so
two tabs cannot silently overwrite each other; uploads are images, audio or video only, checked
like every upload, stored in `designs/<design_id>/`, and cannot be removed while a page uses
them; files of an unshared design are readable by its readers only.

**Verified in a browser** (Edge via Playwright, the editor with an in-memory design, no
database): every tool, drag/resize, undo/redo, duplicate/delete/layers, pages, inline text,
preview with reveal and question checking, PDF and PNG downloads (file signatures, page count,
2× resolution), a failed save reported without losing work, and the phone layout (390 px: no
horizontal scroll, page fits the width, settings in a bottom sheet, tap to select). Saving,
uploads and sharing against a real Supabase project have not been exercised.

## 25. Material library

One central library of teaching files: PDF, Word (.docx), PowerPoint (.pptx), images, audio and
video, up to 20 MB each (the bucket limit).

| Piece | Where |
| ----- | ----- |
| Library | `/library`: tabs All / My materials / Academy library / Favourites / Archived (students and parents: Shared with me / Favourites); search (title, description, topic, tag); filters (subject, level, skill, file type); sort (newest, oldest, title, size); folder tree for staff; 24 per page |
| Upload | `/library/new`: file (drag and drop), title, description, subject, level, skill, topic, tags, folder, who can see it; admins choose "My materials" or "Academy library" |
| Material | `/library/[id]`: preview (PDF, images, audio, video in the browser; Word/PowerPoint are download-only so no file is sent to an outside viewer), download (a fresh 5-minute link), favourite, details, access (assigned classes and students), share panel, move to folder, archive/restore, delete |
| Edit | `/library/[id]/edit`: catalogue data, folder and visibility; the file itself is fixed |

**Access model.** `scope` personal (the author manages it) or academy (administrators manage it).
`visibility` private (its manager and administrators) or staff (every teacher can find it and
assign it to their own classes — reuse across classes). Students see a material only when it is
assigned to a class they attend (`library_material_classes`, any number of classes) or shared
with them (`library_material_students`); parents see what their children see. Archived materials
vanish for everyone but their managers, and cannot be assigned. A teacher who sees a colleague's
private material only because it is assigned to a class they co-teach cannot pass it on.

**Rules in Postgres** (`tests/db/library.test.ts`, mutation-tested, 12 of 12 caught): file types
(`private.is_library_file_type`, checked against `src/features/library/catalog.ts`); a record may
only point at the uploader's own, just-uploaded object of the declared type and size
(`validate_upload`); the server also checks each file's first bytes; the owner, scope and file are
not client-writable (column grants); teachers assign only to classes and students they teach;
folders stay within one library, at most five levels, no cycles. Storage objects under
`library/<uploader>/` are readable only by people who can read the record, and are served from
the storage domain through short-lived signed links.

## 26. Student progress analytics

| Piece | Where |
| ----- | ----- |
| Landing | `/analytics` ("Progress"): students go to their own page; parents choose a child; teachers see their classes and students; admins see academy-wide figures (averages of students only), a classes table and a student search |
| Student | `/analytics/students/[id]`: score cards (all scored work, tests, attendance, homework, teacher-assessed work, vocabulary, other subjects), each labelled with its kind of number and compared with the previous period of the same length; English skill dashboard (progress bars for Listening, Reading, Speaking, Writing, Grammar, Vocabulary, Pronunciation; radar chart when at least three skills have results); progress over time (overall or per skill); results by source; every underlying result with its raw score and who marked it |
| Class | `/analytics/classes/[id]` (staff): class averages, spread of student averages, skills, trend and per-piece averages — no names or individual scores |

**Data.** `progress_results()` (security invoker, so RLS decides whose results a caller gets)
returns one row per *published* result: returned assignment grades (latest attempt; quiz/test
assignment types reported as such), graded test attempts (best per test), English exercises
(every attempt), reviewed English work, returned writing & speaking grades (latest attempt) and
vocabulary practice sessions. Unreturned grades are excluded for everyone, teachers and admins
included, so every viewer sees the same numbers. IELTS-style bands come back as bands with no
percentage. Archived students are left out. `homework_completion()` counts assignments (not
quizzes/tests) due in the range for students enrolled on the due date: handed in, late, missing,
not yet due. `vocabulary_mastery()` counts words per spaced-repetition box.

**Honest numbers** (`src/features/analytics/metrics.ts`, unit-tested): percentage = raw ÷ max;
average = plain mean of percentages shown with its count, flagged below 3 results; bands are
never converted or mixed; empty periods are gaps, not zeros (weekly up to ~4 months, monthly
beyond); comparisons are in percentage points against the previous period of equal length;
group figures average students first and are withheld below 3 students; levels shown are those
recorded by staff, never calculated. Every page carries a "How to read these numbers" glossary
(raw score, percentage, average, level, teacher assessment, bands).

**Tests:** `tests/db/analytics.test.ts` (who sees whose results, unreturned grades, bands, best
attempt, archived students, date and class filters; mutation-tested) and
`src/features/analytics/metrics.test.ts`. The charts and cards were rendered in Edge with sample
results (gaps, radar skills, withheld groups, band rows); the pages have not been run against a
real Supabase project.

## 27. Parent portal and communication

| Piece | Where |
| ----- | ----- |
| Parent portal | `/family` ("My family", parents only): per child — profile, current classes and weekly schedule with upcoming online lessons, attendance (30 days), homework due (missing / to do / handed in), returned assignment results, marked tests, teacher feedback, progress headline, tuition and payment history, announcements. Read-only; links to the detailed pages |
| Announcements | `/announcements`: admins address everyone, staff, parents, students or a class; teachers only the classes they teach; pinning, expiry, archive |
| Notifications | Bell in the header (unread count) and `/notifications`; `/notifications/settings` switches kinds off (system notices always on). In-app only — no e-mail/SMS/Zalo provider is connected |
| Messages | `/messages`, `/messages/[id]`: a teacher and a parent about one child |

**Parents' access** is the RLS already in every module (`children` scopes): they read their
own children's rows and nothing else, cannot write grades or attendance, and never see
unreturned grades or teacher-only tables. `tests/db/communication.test.ts` checks this
directly: 13 tables with a row about another family's child return nothing, 9 teacher-only
tables return nothing, grade and attendance changes are refused, unreturned grades stay hidden.

**Notifications** are created only by the database (clients may only mark them read or delete
them; links must be single-slash internal paths). Triggers: new assignment published, grade
returned / test marked / writing & speaking feedback returned / English work reviewed, absence,
online lesson scheduled/moved/cancelled, timetable change (one per class per minute), new
announcement (its audience only), new message, enrolment (system). Time-based ones —
homework due within 24 hours and not handed in, assignments released on a schedule, tuition due
within 7 days or overdue (parents) — are created by `sync_my_notifications()` for the caller when
the header loads, so no background job is needed. Every event has a dedupe key: nobody is
notified twice about the same thing. A switched-off kind is never created.

**Messages** are allowed only while the teacher teaches the child (active or pending enrolment)
and the parent is the child's parent; either may start. Messages are immutable and stamped with
the sender; the other participant is notified. Administrators can read conversations
(safeguarding) but not write; the pages say so. When the child leaves the class the conversation
stays readable but closed. Mutation-tested (16 of 16 meaningful mutants caught; forcing the sender
is redundant with the column grant).

## 28. Admin dashboard and reports

| Piece | Where |
| ----- | ----- |
| Admin dashboard | `/admin` (administrators): summary cards for students, teachers, classes, courses, attendance (30 days), assignments (published, awaiting marking, homework handed in), academic performance (average of students, 90 days) and — only with `tuition.read` all — tuition (outstanding, overdue, collected this month); weekly attendance chart and spread of student averages. Every figure is queried when the page opens |
| Reports | `/reports` and `/reports/[report]`: student, class, teacher, attendance, assignment, test, tuition and academic progress reports; filters date range, class, teacher, course, level (course level) and student where they apply; Print (print stylesheet hides navigation, filters and buttons; charts are redrawn at A4 width); Export CSV (`/reports/[report]/export`) |

**Who sees what.** `reports.read`: administrators `all`, teachers `assigned`; students and
parents none. Every report reads through RLS, so a teacher's reports contain only their classes
and students. The tuition report additionally needs `tuition.read` all and the teacher report
`reports.read` all (`src/features/reports/catalog.ts`, checked on the page and in the CSV route;
an unavailable report is a 404). Reports never select contact details, addresses, dates of birth
or notes; class averages follow the analytics rules (students first, withheld below 3). CSV
responses are `no-store`, UTF-8 with BOM (Excel), and neutralise spreadsheet formulas.

**Tests:** `src/features/reports/catalog.test.ts` (CSV quoting and formula neutralising, which
roles may run which report, filter parsing) and `tests/db/reports.test.ts` (teachers see no
financial rows and only their classes' data; families have no report access). The table, charts,
filter form and print layout were checked in Edge with sample rows (this found and fixed charts
being cut off when printed). The reports' queries have not been run against a real Supabase
project.

## 29. AI Teaching Assistant

**Workflow:** teacher input (task, topic, CEFR level, student age, skill, objective, duration,
notes) → the AI writes a draft → the teacher reviews and edits it (`/ai/[id]`) → approves it
(the plan is frozen) → saves it to the platform as a **private** lesson design and/or a
**draft** homework assignment → publishes those later through the normal pages. The AI never
publishes: no code path from a draft sets anything visible to students.

**Tasks:** lesson, worksheet, vocabulary, grammar exercises, reading questions, listening
questions, speaking prompts, writing prompt, differentiated activities, homework. Every result
has learning objectives, warm-up, presentation, practice, production and homework, plus the
parts the task needs (vocabulary, exercises with answer keys, reading text, listening script,
speaking prompts, writing task, support/core/challenge activities).

| Layer | Where |
| ----- | ----- |
| Provider abstraction | `src/lib/ai`: `AiProvider` (structured JSON in, validated by the caller), `AnthropicProvider` (Messages API, forced tool call), `getAiProvider()` from env, `withRetry()` (backoff, Retry-After, time budget), `AiError` codes with teacher-readable messages |
| Configuration | Server env only: `AI_PROVIDER` (`anthropic` \| `none`), `AI_API_KEY`, `AI_MODEL` (default `claude-sonnet-5`), `AI_TIMEOUT_MS`. No key → the pages say the assistant is not set up; nothing is called |
| Prompts | `src/features/ai/prompts.ts`: system rules (age/level-appropriate, child-safe, original texts, no links or personal data, correct keys, timing adds up) and the teacher's input passed as delimited JSON data, never as instructions |
| Validation | `src/features/ai/content.ts`: one Zod schema validates the AI output, every edit and every save (lengths, required stages, answer keys matching options, gaps marked, true/false answers); the provider's JSON Schema is generated from it. `planProblems()` checks task requirements and timing |
| Generation | `generateLessonPlan()`: an invalid answer gets exactly one corrective retry with the problems listed; then `invalid_output`. Empty answers, cut-off answers (`max_tokens`), timeouts, 429/529/5xx/401/400 each map to their own error; provider error bodies are never shown to users |
| Storage | `ai_drafts` (owner-only RLS; admins may read; `original_content`, provider and model are immutable; approved drafts frozen; saving to the platform only after approval) and `ai_requests` (usage per call; 1 at a time, 20 per hour, 100 per day per teacher) |

**Tests:** `src/features/ai/ai.test.ts` (schema and task checks, prompt injection framing,
repair and give-up paths, provider HTTP/timeout/empty/truncated mapping with a mocked fetch,
retry/backoff, env configuration, conversion to a valid lesson design and draft homework) and
`tests/db/ai.test.ts` (privacy, immutability, lifecycle, limits; mutation-tested). The editor
was checked in Edge. **No real AI call has been made** — there is no API key in this
environment; the provider is tested against recorded response shapes only.

## 30. Security hardening

See [AUDIT-2026-09.md](AUDIT-2026-09.md) for the production-readiness audit: what was checked, the
fixes (redirect validation, security headers and CSP in `next.config.ts`, password policy, rate
limits, same-site sign-out) and the remaining risks. Regression tests from the audit:
`tests/db/idor.test.ts`, `tests/app/action-guards.test.ts`, `tests/db/rate-limits.test.ts`.

## 31. Interface language (Vietnamese / English)

Vietnamese is the default interface language; English is the second language, chosen per
browser in **Settings → My profile → Language** (and on the sign-in page). The choice is the
`locale` cookie, set by the public `setLocaleAction`.

- **English text is the key.** Code keeps writing English; `src/i18n/messages/vi*.ts` maps it
  to Vietnamese. A missing entry falls back to English, so English needs no dictionary.
- **Where to translate:** Server Components, Server Actions and route handlers use
  `const t = await getT()` (`@/i18n/server`); Client Components use `const t = useT()`
  (`@/i18n/client`); components rendered on both sides use `<Trans>{"…"}</Trans>`.
  Placeholders use `{name}`: `t("Signed in as {email}.", { email })`.
- **Translated centrally:** `runAction` translates every error and field message it returns;
  `FormMessage` and `FormAlert` translate client-side validation; `ChartContainer` translates
  series labels; notification texts written by database triggers are translated by
  `features/communication/notification-text.ts`.
- **Never translate data.** Names, titles, vocabulary and answers entered by people are shown
  as entered — wrap only UI text (labels, messages, label maps), never database fields.
- **Messages with numbers or quoted file names** can be matched without placeholders: the key
  `"{q0}" is larger than {#0} MB.` translates `"a.pdf" is larger than 20 MB.` (see `lookup`).
- Dates and money are already formatted the Vietnamese way (`vi-VN`) in both languages.

**Tests:** `tests/app/i18n.test.ts` fails when a string passed to `t()` or `<Trans>` has no
Vietnamese entry, or when a translation uses a placeholder the English text does not provide.

## 32. Public website and brand design

- **Pages** (`src/app/(public)`, no sign-in): home `/`, courses `/programs` and `/programs/[code]`,
  `/about`, `/contact`. They are listed in `publicRoutes`, indexed (`robots.ts`, `sitemap.ts`)
  and everything behind sign-in stays `noindex`.
- **Data, not copy:** the catalogue comes from `website_subjects()` / `website_courses()`
  (security definer, presentation fields of live subjects and active courses only). Contact
  details and the hero picture are `site_settings` (one row, readable by anyone); testimonials are
  `testimonials` (only published rows are public). Nothing is hard-coded; empty sections hide.
- **Editing:** Administration → Website (`/admin/website`, permission `site.write`): contact
  details, hero picture, each subject's audience/icon/picture/visibility
  (`set_subject_website`) and testimonials. Pictures go to the public `site-media` bucket.
- **Logo:** used exactly as supplied (`public/brand`); the header lockup places the unchanged
  mark and wordmark side by side. No filters or recolouring; dark surfaces use the cream tile.
- **Look:** Playfair Display for headings, Inter for text; brown primary, cream surfaces, navy
  accents (sidebar), green for learning progress. Default pictures are brand SVG illustrations
  (`components/brand`) until real photos are uploaded.
- **Motion** (`motion` library, `components/motion`): page fade/slide (`(app)/template.tsx`),
  sticky shrinking header, staggered hero and cards, scroll reveal (once), progress bars that
  fill, animated active states in the sidebar and phone tab bar. `MotionConfig
  reducedMotion="user"` and a CSS `prefers-reduced-motion` rule turn it all off on request.
- **Students** get a task-first menu (`learnerNavigation`), a home screen built from their own
  data (`features/dashboard`), course cards on `/classes`, status tabs on `/assignments`, and
  a bottom tab bar on phones.

**Tests:** `tests/db/site.test.ts` (visitors read only the catalogue functions, settings and
published testimonials; only `site.write` edits), `tests/db/idor.test.ts` (anonymous callers
read no table except `site_settings`), `src/config/routes.test.ts` (public routes).

## 33. Public learning content, articles and sharing

- **Access levels** (`public_access`: members / preview / public) on English lessons and library
  materials. *members* is the default (signed-in users, as before). *preview*: visitors see the
  beginning of a lesson (about 700 characters of the body, two examples, no form/usage/mistakes)
  or only the description of a material. *public*: the whole lesson / the material's file.
- **Where the rule lives:** visitors call `public_lessons()`, `public_lesson(slug)`,
  `public_materials()`, `public_material(id)` (security definer). Locked parts are never selected,
  so they cannot leak through the page. Storage lets `anon` sign URLs only for objects that
  `private.is_public_object()` approves (media of published open lessons, files of public
  materials). `anon` can execute no other private function (tested).
- **Publishing:** only `site.write` (administrators) — the "On the website" card on a lesson or
  material page (`set_lesson_public`, `set_material_public`). Lessons get a web address
  (`/lessons/<slug>`, unique, lower-case with dashes; `slugify` handles Vietnamese).
- **Articles** (`articles`, `/articles/<slug>`, Administration → Articles): drafts are visible
  to site editors only; publishing stamps `published_at`. Bodies are plain text rendered by
  `Prose` (paragraphs, `##` headings, `-` lists) — no HTML is parsed.
- **Teachers** appear in "Our teachers" (About) when an administrator turns them on in Website:
  name, subjects, qualifications, photo and a public introduction — never contact details.
- **Pages:** `/resources` (tabs: sample lessons, free materials, articles), `/lessons/[slug]`,
  `/resources/[id]`, `/articles/[slug]`; each has canonical/Open Graph metadata (default image
  `public/brand/og-default.png`), share buttons (Facebook, the phone share sheet for
  Zalo/Messenger, copy link) and, where content is locked, `UnlockCta`: sign in to continue
  (then the full version inside the platform) or enrol to unlock.

**Tests:** `tests/db/public-content.test.ts`.

## 34. Website members, comments, dictionary and the audit log

- **Sign-up** (`/register`, public `signUpAction`): Supabase Auth with e-mail confirmation
  (`supabase/templates/confirmation.html` → `/auth/confirm`). The person's own data can only set
  `user_metadata` (the name); the role comes from `raw_app_meta_data`, which only staff and SQL
  write, so **new accounts are `member`** (`handle_new_user`). Staff-created students, parents
  and teachers keep the role they are given; a member is promoted in Users & roles. Whether an
  e-mail already exists is never revealed.
- **Member** (rank 5): `dictionary.read` and `comments.write` only. Members read preview lessons
  in full (`public_lesson` returns the full text to any signed-in caller), comment, use the
  dictionary, and see free materials read-only (`NoCopy`, PDF toolbar hidden, no download
  links — a deterrent, not DRM). They get their own menu, home and phone tabs.
- **Remember me:** unchecked → `bsmart_session_only` cookie; the server client and the proxy
  then write auth cookies without Max-Age/Expires (`applySessionPolicy`), so they end with the
  browser session.
- **Dictionary** (`/dictionary`): `dictionary_search()` over published words of the word bank.
- **Comments** (`content_comments`) under public lessons and articles: only on pages that are
  public right now (`private.is_public_target`), author and name set by the database, 10 per
  hour per person, moderators (`site.write`) hide/show, authors delete their own, nobody edits
  someone else's text.
- **Audit log** (`audit_log`, Administration → Audit log, `audit.read`): append-only, written by
  triggers — role and activation changes, permission grants, payments and voids, invoice voids,
  archiving/restoring students, teachers and classes, website visibility, articles, website
  settings. Nobody (administrators included) can insert, edit or delete entries directly.

**Tests:** `tests/db/members.test.ts`, `src/lib/supabase/session-cookies.test.ts`.

## 35. Learning path, completion, streaks and certificates

- **Course → Module → Lesson:** modules are the existing `course_units`; `unit_lessons` links
  lessons to a module in order (Course page → book icon on a module, `courses.write`). A class's
  assignments and tests carry an optional `unit_id` (Module selector on their pages); the
  `check_unit_of_class` trigger only accepts a module of the class's own course.
- **Completion** (`features/progress`): the learning path of a class is the course's published
  module lessons plus the class's released (published/closed) assignments and tests; work not
  in a module goes under "Other work". Done means real work — an assignment handed in
  (submitted/graded/returned), a test attempt finished, a lesson practised or submitted. It is
  shown on the class page (students and parents), course cards and the student home; staff see
  every student's % in the class's student table. With nothing to do yet, cards fall back to
  the course-calendar %.
- **Learning streak:** `learning_days(student, since)` (security invoker, so RLS applies) lists
  the academy-time days with activity: hand-ins, test attempts, lesson practice and
  submissions, writing/speaking submissions, vocabulary practice and attendance (present/late).
  `summarizeStreak` gives the current streak (still alive if the student learnt yesterday), the
  best streak in the last 180 days and the last 14 days.
- **Certificates** (`certificates`, `certificates.write` = administrators): issued from a class
  page to an enrolled (active/completed) student, once per class unless revoked. The database
  fills the number (`BSA-YYYY-00001`), a random verification code, the names and the issuer;
  rows can only be revoked (with a reason), never edited or deleted, and both actions are in
  the audit log. Students, parents and teachers see the certificates of students they can see
  (`/certificates`); the certificate page prints as one A4 landscape page with the logo
  unchanged. Anyone can check a printed code at `/verify/[code]` (`verify_certificate`, not
  indexed by search engines); the table itself is closed to anonymous visitors.

**Tests:** `tests/db/progress.test.ts`, `src/features/progress/streak.test.ts`.
