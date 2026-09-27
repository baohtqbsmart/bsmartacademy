import { CalendarIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { navigationFor } from "@/config/navigation"
import { routes } from "@/config/routes"
import { MemberHome } from "@/features/dashboard/components/member-home"
import { QuickActions, StudentHome } from "@/features/dashboard/components/student-home"
import { listPublicLessons, listPublishedArticles } from "@/features/site/server/content-service"
import { loadStudentDashboard } from "@/features/dashboard/server/student-dashboard"
import { getOwnStudentId } from "@/features/students/server/student-service"
import { intlLocale } from "@/i18n/config"
import { getLocale, getT } from "@/i18n/server"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Dashboard") }
}

export default async function DashboardPage() {
  const [t, locale, user] = await Promise.all([getT(), getLocale(), requireUser()])
  const db = await createClient()
  const today = new Intl.DateTimeFormat(intlLocale[locale], {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date())

  // Students see their learning; everyone else gets shortcuts into their work.
  const ownStudentId = user.roleCode === "student" ? await getOwnStudentId(db, user.id) : null
  const studentData = ownStudentId ? await loadStudentDashboard(db, ownStudentId) : null
  const shortcuts = navigationFor(user.permissions, user.roleCode)
    .flatMap((section) => section.items)
    .filter((item) => item.href !== routes.dashboard && item.href !== routes.profile && item.href !== routes.notifications)
    .slice(0, 8)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {user.fullName ? t("Hello, {name} 👋", { name: user.fullName }) : t("Welcome")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("Have a great day of learning!")}</p>
        </div>
        <span className="bg-card text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs capitalize">
          <CalendarIcon className="text-primary size-3.5" aria-hidden />
          {today}
        </span>
      </div>

      {!user.fullName && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle>{t("Complete your profile")}</CardTitle>
            <CardDescription>{t("Add your name so teachers and classmates recognise you.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm">
              <Link href={routes.profile}>{t("Edit profile")}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {user.roleCode === "member" ? (
        <MemberHome lessons={await listPublicLessons(db)} articles={await listPublishedArticles(db, 3)} />
      ) : studentData ? (
        <StudentHome data={studentData} />
      ) : user.roleCode === "student" ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("Your account is not linked to a student record yet.")}</CardTitle>
            <CardDescription>{t("Please contact the academy office.")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        shortcuts.length > 0 && (
          <QuickActions actions={shortcuts.map((item) => ({ label: item.title, href: item.href, icon: item.icon }))} />
        )
      )}
    </>
  )
}
