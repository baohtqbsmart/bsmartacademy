import { MegaphoneIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { Card, CardContent } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { NewAnnouncementDialog } from "@/features/communication/components/announcement-controls"
import { AnnouncementList } from "@/features/communication/components/announcement-list"
import { listAnnouncements } from "@/features/communication/server/communication-service"
import { can } from "@/lib/auth/permissions"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Announcements" }

export default async function AnnouncementsPage() {
  const user = await requireRouteAccess(routes.announcements)
  const db = await createClient()
  const isAdmin = can(user.permissions, "announcements.write", ["all"])
  const canWrite = can(user.permissions, "announcements.write")
  const [items, classes] = await Promise.all([
    // Authors and admins also see archived ones (to know what was sent).
    listAnnouncements(db, { includeArchived: canWrite }),
    canWrite
      ? db.from("classes").select("id, name").is("deleted_at", null).in("status", ["planned", "active"]).order("name").then((r) => r.data ?? [])
      : Promise.resolve([]),
  ])
  const visible = items.filter((a) => !a.archived_at || a.created_by === user.id || isAdmin)

  return (
    <>
      <PageHeader
        title="Announcements"
        description={canWrite ? (isAdmin ? "Announce to everyone, staff, parents, students or one class." : "Announce to the classes you teach.") : "News from the academy and your classes."}
        actions={canWrite && <NewAnnouncementDialog allAudiences={isAdmin} classes={classes} />}
      />
      {visible.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon={MegaphoneIcon} title="No announcements" />
          </CardContent>
        </Card>
      ) : (
        <AnnouncementList items={visible} canArchive={canWrite ? (a) => isAdmin || a.created_by === user.id : undefined} />
      )}
    </>
  )
}
