import { MessageSquareTextIcon } from "lucide-react"
import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { EmptyState } from "@/components/shared/empty-state"
import { SimpleTable } from "@/components/shared/simple-table"
import { Badge } from "@/components/ui/badge"
import { routes } from "@/config/routes"
import { CommentDialog, DeleteCommentButton } from "@/features/assessments/components/task-controls"
import { listComments } from "@/features/assessments/server/assessment-service"
import { CATEGORY_LABELS, KIND_LABELS } from "@/features/assessments/scoring"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Comment library") }
}

export default async function CommentsPage() {
  const t = await getT()
  const user = await requireRouteAccess(routes.feedbackComments)
  const comments = await listComments(await createClient())

  return (
    <>
      <PageHeader
        title={t("Comment library")}
        description={t("Reusable feedback comments. Shared ones are visible to every teacher; yours can be private.")}
        actions={<CommentDialog />}
      />
      <SimpleTable
        rows={comments}
        rowKey={(c) => c.id}
        empty={<EmptyState icon={MessageSquareTextIcon} title={t("No comments yet")} />}
        columns={[
          { header: "Comment", cell: (c) => <span className="whitespace-normal">{c.body}</span> },
          { header: "Category", cell: (c) => <Badge variant="outline">{t(CATEGORY_LABELS[c.category])}</Badge> },
          { header: "For", cell: (c) => (c.kind ? KIND_LABELS[c.kind] : "Both") },
          { header: "Visibility", cell: (c) => (c.shared ? "Shared" : "Only me") },
          { header: "Author", cell: (c) => (c.created_by === user.id ? "You" : c.created_by_name || "BSmart") },
          {
            header: "",
            key: "manage",
            cell: (c) =>
              c.created_by === user.id ? (
                <span className="flex gap-1">
                  <CommentDialog initial={{ commentId: c.id, kind: c.kind ?? "", category: c.category, body: c.body, shared: c.shared }} />
                  <DeleteCommentButton commentId={c.id} />
                </span>
              ) : null,
          },
        ]}
      />
    </>
  )
}
