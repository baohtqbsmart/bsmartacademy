import { ArrowLeftIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { SubjectArt } from "@/components/brand/subject-art"
import { Reveal } from "@/components/motion/reveal"
import { FilterChips } from "@/components/shared/filter-chips"
import { programPath, routes } from "@/config/routes"
import { CourseCatalog } from "@/features/site/components/course-catalog"
import { listWebsiteCourses, listWebsiteSubjects } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { publicMediaUrl } from "@/lib/public-media"
import { createClient } from "@/lib/supabase/server"

async function load(code: string) {
  const db = await createClient()
  const [subjects, courses] = await Promise.all([listWebsiteSubjects(db), listWebsiteCourses(db)])
  const subject = subjects.find((s) => s.code === decodeURIComponent(code))
  return subject ? { subject, subjects, courses: courses.filter((c) => c.subject_id === subject.id) } : null
}

export async function generateMetadata({ params }: PageProps<"/programs/[code]">): Promise<Metadata> {
  const t = await getT()
  const data = await load((await params).code)
  if (!data) return { title: t("Page not found") }
  const image = publicMediaUrl(data.subject.image_path)
  return {
    title: data.subject.name,
    description: data.subject.description || t("Explore the courses at BSmart Academy: subjects, levels and how each course is taught."),
    alternates: { canonical: programPath(data.subject.code) },
    openGraph: { title: `${data.subject.name} – BSmart Academy`, ...(image ? { images: [image] } : {}) },
  }
}

export default async function ProgramPage({ params }: PageProps<"/programs/[code]">) {
  const t = await getT()
  const data = await load((await params).code)
  if (!data) notFound()
  const { subject, subjects, courses } = data

  return (
    <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-6 pb-20 sm:px-6">
      <Link href={routes.programs} className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden /> {t("All courses")}
      </Link>
      <Reveal className="grid items-center gap-8 lg:grid-cols-2">
        <div className="grid gap-4">
          {subject.audience && <p className="text-success text-sm font-semibold">{subject.audience}</p>}
          <h1 className="text-4xl font-semibold sm:text-5xl">{subject.name}</h1>
          {subject.description && <p className="text-muted-foreground text-lg leading-relaxed">{subject.description}</p>}
        </div>
        <SubjectArt icon={subject.icon} imageUrl={publicMediaUrl(subject.image_path)} className="aspect-[16/9] rounded-3xl shadow-lg" />
      </Reveal>

      {subjects.length > 1 && (
        <FilterChips
          label={t("Filter by subject")}
          chips={[
            { href: routes.programs, label: t("All"), active: false },
            ...subjects.map((s) => ({ href: programPath(s.code), label: s.name, active: s.id === subject.id, count: Number(s.course_count) })),
          ]}
        />
      )}

      <section className="grid gap-6" aria-labelledby="courses">
        <h2 id="courses" className="text-2xl font-semibold">
          {t("Courses")}
        </h2>
        <CourseCatalog courses={courses} subjects={subjects} />
      </section>
    </div>
  )
}
