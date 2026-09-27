import { CalendarRangeIcon, ClockIcon, LayersIcon, MessageCircleIcon } from "lucide-react"
import Link from "next/link"

import { SubjectArt } from "@/components/brand/subject-art"
import { Stagger, StaggerItem } from "@/components/motion/reveal"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import type { listWebsiteCourses, WebsiteSubject } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { publicMediaUrl } from "@/lib/public-media"

type Course = Awaited<ReturnType<typeof listWebsiteCourses>>[number]

/** Public course cards (active courses only; enrolment goes through the academy). */
export async function CourseCatalog({ courses, subjects }: { courses: Course[]; subjects: WebsiteSubject[] }) {
  const t = await getT()
  const bySubject = new Map(subjects.map((s) => [s.id, s]))
  if (courses.length === 0) {
    return (
      <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed p-10 text-center">
        <p className="font-heading text-xl">{t("New courses are being prepared")}</p>
        <p className="text-muted-foreground max-w-md text-sm">{t("Leave us your details and we will tell you as soon as enrolment opens.")}</p>
        <Button asChild>
          <Link href={routes.contact}>{t("Contact us")}</Link>
        </Button>
      </div>
    )
  }
  return (
    <Stagger inView className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {courses.map((course) => {
        const subject = bySubject.get(course.subject_id)
        return (
          <StaggerItem key={course.id}>
            <article className="lift group bg-card flex h-full flex-col overflow-hidden rounded-2xl border">
              <SubjectArt icon={subject?.icon} imageUrl={publicMediaUrl(subject?.image_path)} className="aspect-[16/9]" />
              <div className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{course.subject_name}</Badge>
                  {course.level_name && <Badge variant="outline">{course.level_name}</Badge>}
                </div>
                <h3 className="font-heading text-xl leading-snug font-semibold">{course.name}</h3>
                {course.description && <p className="text-muted-foreground line-clamp-3 text-sm">{course.description}</p>}
                <ul className="text-muted-foreground mt-auto grid gap-1.5 pt-2 text-sm">
                  {subject?.audience && (
                    <li className="flex items-center gap-2">
                      <LayersIcon className="text-primary size-4" aria-hidden /> {subject.audience}
                    </li>
                  )}
                  {course.session_count && (
                    <li className="flex items-center gap-2">
                      <CalendarRangeIcon className="text-primary size-4" aria-hidden /> {t("{value} lessons", { value: course.session_count })}
                    </li>
                  )}
                  {course.session_minutes && (
                    <li className="flex items-center gap-2">
                      <ClockIcon className="text-primary size-4" aria-hidden /> {t("{minutes} min per lesson", { minutes: course.session_minutes })}
                    </li>
                  )}
                </ul>
                <Button asChild variant="outline" className="border-primary/30 text-primary hover:bg-primary/5 mt-2">
                  <Link href={`${routes.contact}?course=${encodeURIComponent(course.code)}`}>
                    <MessageCircleIcon aria-hidden /> {t("Ask about this course")}
                  </Link>
                </Button>
              </div>
            </article>
          </StaggerItem>
        )
      })}
    </Stagger>
  )
}
