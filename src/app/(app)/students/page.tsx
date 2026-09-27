import { PlusIcon, SearchXIcon, UsersIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Pagination } from "@/components/shared/pagination"
import { SimpleTable } from "@/components/shared/simple-table"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { STUDENT_STATUS } from "@/config/labels"
import { routes, studentPath } from "@/config/routes"
import { listOpenClasses } from "@/features/classes/server/class-service"
import { SortableHeader } from "@/features/students/components/sortable-header"
import { StudentListToolbar } from "@/features/students/components/student-list-toolbar"
import {
  STUDENT_PAGE_SIZE,
  hasActiveFilters,
  parseStudentListQuery,
  studentListHref,
} from "@/features/students/list-query"
import { listEnglishLevels, listStudentDirectory } from "@/features/students/server/student-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDate } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Students" }

export default async function StudentsPage({ searchParams }: PageProps<"/students">) {
  const user = await requireRouteAccess(routes.students)
  const query = parseStudentListQuery(await searchParams)
  const canWrite = can(user.permissions, "students.write")
  const db = await createClient()

  const [{ rows, total }, levels, classes] = await Promise.all([
    listStudentDirectory(db, query, { includeArchived: canWrite }),
    listEnglishLevels(db),
    listOpenClasses(db),
  ])

  // A page number past the end (e.g. after filtering) goes back to page 1.
  if (rows.length === 0 && query.page > 1) redirect(studentListHref(query, { page: 1 }))

  const levelNames = new Map(levels.map((level) => [level.code, level.name]))
  const description = can(user.permissions, "students.read", ["all"])
    ? "All students at the academy."
    : can(user.permissions, "students.read", ["assigned"])
      ? "Students in the classes you teach."
      : "Your children."

  const filtered = hasActiveFilters(query)
  const empty = filtered ? (
    <EmptyState
      icon={SearchXIcon}
      title="No students match your search"
      description="Try a different name or remove some filters."
      action={
        <Button variant="outline" size="sm" asChild>
          <Link href={routes.students}>Clear filters</Link>
        </Button>
      }
    />
  ) : (
    <EmptyState
      icon={UsersIcon}
      title="No students yet"
      description={
        canWrite
          ? "Add the first student to start building the directory."
          : "Students will appear here once they are enrolled in a class you can see."
      }
      action={
        canWrite && (
          <Button size="sm" asChild>
            <Link href={routes.studentNew}>
              <PlusIcon aria-hidden /> Add student
            </Link>
          </Button>
        )
      }
    />
  )

  return (
    <>
      <PageHeader
        title="Students"
        description={description}
        actions={
          canWrite && (
            <Button asChild>
              <Link href={routes.studentNew}>
                <PlusIcon aria-hidden /> Add student
              </Link>
            </Button>
          )
        }
      />
      <StudentListToolbar
        query={query}
        levels={levels}
        classes={classes.map(({ id, name }) => ({ id, name }))}
        canSeeArchived={canWrite}
      />
      <SimpleTable
        rows={rows}
        rowKey={(student) => student.id}
        empty={empty}
        footer={
          total > 0 && (
            <Pagination
              page={query.page}
              pageSize={STUDENT_PAGE_SIZE}
              total={total}
              hrefForPage={(page) => studentListHref(query, { page })}
            />
          )
        }
        columns={[
          {
            key: "code",
            header: <SortableHeader label="Student ID" sort="code" query={query} />,
            cell: (s) => <span className="font-mono text-xs">{s.student_code}</span>,
          },
          {
            key: "name",
            header: <SortableHeader label="Name" sort="name" query={query} />,
            cell: (s) => (
              <Link href={studentPath(s.id)} className="flex items-center gap-2 font-medium hover:underline">
                <UserAvatar name={s.full_name} avatarUrl={null} className="size-7 text-xs" />
                <span>{s.full_name}</span>
                {s.deleted_at && <Badge variant="outline">Archived</Badge>}
              </Link>
            ),
          },
          { header: "Current class", cell: (s) => s.current_class_names ?? "—" },
          {
            header: "English level",
            cell: (s) => (s.english_level_code ? levelNames.get(s.english_level_code) ?? s.english_level_code : "—"),
          },
          { header: "Parent", cell: (s) => s.primary_parent_name ?? "—" },
          {
            key: "joined",
            header: <SortableHeader label="Enrollment date" sort="joined" query={query} />,
            cell: (s) => formatDate(s.joined_on),
          },
          {
            header: "Status",
            cell: (s) => (
              <Badge variant={STUDENT_STATUS[s.status].variant}>{STUDENT_STATUS[s.status].label}</Badge>
            ),
          },
        ]}
      />
    </>
  )
}
