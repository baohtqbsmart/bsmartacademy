import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes, studentPath } from "@/config/routes"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { can } from "@/lib/auth/permissions"
import { roleLabel } from "@/lib/auth/roles"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const user = await requireUser()
  const needsProfile = !user.fullName
  // Students reach their own record from here (they have no student list).
  const ownStudentId = can(user.permissions, "students.read", ["own"])
    ? await getOwnStudentId(await createClient(), user.id)
    : null

  return (
    <>
      <PageHeader
        title={user.fullName ? `Welcome, ${user.fullName}` : "Welcome"}
        description="Your BSmart Academy workspace."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Your account</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            Role <Badge variant="secondary">{roleLabel(user.roleCode)}</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {can(user.permissions, "reports.read", ["all"]) && (
              <Button asChild size="sm">
                <Link href={routes.adminDashboard}>Admin dashboard</Link>
              </Button>
            )}
            {ownStudentId && (
              <Button asChild size="sm">
                <Link href={studentPath(ownStudentId)}>My student profile</Link>
              </Button>
            )}
            <Button asChild variant={needsProfile ? "default" : "outline"} size="sm">
              <Link href={routes.profile}>
                {needsProfile ? "Complete your profile" : "Edit profile"}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
