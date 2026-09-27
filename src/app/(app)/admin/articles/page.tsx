import { NewspaperIcon, PlusIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { adminArticlePath, articlePath, routes } from "@/config/routes"
import { listArticlesForAdmin } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"
import { requireRouteAccess } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Articles") }
}

export default async function AdminArticlesPage() {
  const t = await getT()
  await requireRouteAccess(routes.adminArticles)
  const articles = await listArticlesForAdmin(await createClient())

  return (
    <>
      <PageHeader
        title={t("Articles")}
        description={t("Knowledge and tips shared on the public website.")}
        actions={
          <Button asChild>
            <Link href={routes.adminArticleNew}>
              <PlusIcon aria-hidden /> {t("New article")}
            </Link>
          </Button>
        }
      />
      <SimpleTable
        rows={articles}
        rowKey={(a) => a.id}
        empty={<EmptyState icon={NewspaperIcon} title={t("No articles yet")} description={t("Write the first one to share tips with learners and parents.")} />}
        columns={[
          {
            header: "Title",
            cell: (a) => (
              <div className="grid">
                <Link href={adminArticlePath(a.id)} className="font-medium hover:underline">
                  {a.title}
                </Link>
                <span className="text-muted-foreground font-mono text-xs">{articlePath(a.slug)}</span>
              </div>
            ),
          },
          {
            header: "Status",
            cell: (a) => <Badge variant={a.status === "published" ? "default" : "outline"}>{a.status === "published" ? t("Published") : t("Draft")}</Badge>,
          },
          { header: "Author", cell: (a) => a.author_name || "—" },
          { header: "Updated", cell: (a) => <span className="tabular-nums">{formatDateTime(a.updated_at)}</span> },
        ]}
      />
    </>
  )
}
