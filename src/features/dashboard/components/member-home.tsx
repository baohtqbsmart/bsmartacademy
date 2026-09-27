import { BookMarkedIcon, GraduationCapIcon, MessageSquareIcon, NotebookTextIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { QuickActions } from "@/features/dashboard/components/student-home"
import { ArticleCards, LessonCards } from "@/features/site/components/resource-cards"
import type { ArticleListItem, PublicLessonItem } from "@/features/site/server/content-service"
import { getT } from "@/i18n/server"

/** Home for website members: what their free account offers, and how to enrol. */
export async function MemberHome({ lessons, articles }: { lessons: PublicLessonItem[]; articles: ArticleListItem[] }) {
  const t = await getT()
  return (
    <div className="grid gap-8">
      <QuickActions
        actions={[
          { label: "Free lessons", href: routes.resources, icon: NotebookTextIcon },
          { label: "Dictionary", href: routes.dictionary, icon: BookMarkedIcon },
          { label: "Articles", href: `${routes.resources}?tab=articles`, icon: MessageSquareIcon },
          { label: "Courses", href: routes.programs, icon: GraduationCapIcon },
        ]}
      />

      <section className="grid gap-4">
        <h2 className="text-xl font-semibold">{t("Free lessons")}</h2>
        <LessonCards lessons={lessons.slice(0, 3)} />
      </section>

      {articles.length > 0 && (
        <section className="grid gap-4">
          <h2 className="text-xl font-semibold">{t("New articles")}</h2>
          <ArticleCards articles={articles} />
        </section>
      )}

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>{t("Want the full programme?")}</CardTitle>
          <CardDescription>
            {t("Enrolled students get classes, assignments and tests, feedback from teachers, progress tracking and all materials.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={routes.programs}>{t("Explore courses")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={routes.contact}>{t("Contact us to enrol")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
