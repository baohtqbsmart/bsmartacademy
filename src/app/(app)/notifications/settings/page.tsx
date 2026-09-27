import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { routes } from "@/config/routes"
import { PreferencesForm } from "@/features/communication/components/preferences-form"
import { NOTIFICATION_KINDS } from "@/features/communication/schemas"
import { getPreferences } from "@/features/communication/server/communication-service"
import { can } from "@/lib/auth/permissions"
import { requireUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Notification settings") }
}

export default async function NotificationSettingsPage() {
  const t = await getT()
  const user = await requireUser()
  const prefs = await getPreferences(await createClient())
  // Only the kinds that can reach this person.
  const family = can(user.permissions, "students.read", ["own", "children"])
  const kinds = NOTIFICATION_KINDS.filter((k) => {
    if (["new_assignment", "homework_due", "new_grade", "absence", "schedule_change"].includes(k)) return family
    if (k === "tuition_due") return can(user.permissions, "students.read", ["children"])
    if (k === "message") return can(user.permissions, "messages.write")
    return true
  })

  return (
    <>
      <Link href={routes.notifications} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("Notifications")}
      </Link>
      <PageHeader title={t("Notification settings")} description={t("Choose what appears in your notifications. Switched-off kinds are not recorded at all. Delivery is in the app only for now.")} />
      <div className="max-w-2xl">
        <PreferencesForm kinds={kinds} initial={Object.fromEntries(prefs)} />
      </div>
    </>
  )
}
