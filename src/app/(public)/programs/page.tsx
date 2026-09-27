import type { Metadata } from "next"

import { Reveal } from "@/components/motion/reveal"
import { FilterChips } from "@/components/shared/filter-chips"
import { programPath, routes } from "@/config/routes"
import { CourseCatalog } from "@/features/site/components/course-catalog"
import { SubjectCards } from "@/features/site/components/home-sections"
import { listWebsiteCourses, listWebsiteSubjects } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: t("Courses"),
    description: t("Explore the courses at BSmart Academy: subjects, levels and how each course is taught."),
    alternates: { canonical: routes.programs },
  }
}

export default async function ProgramsPage() {
  const t = await getT()
  const db = await createClient()
  const [subjects, courses] = await Promise.all([listWebsiteSubjects(db), listWebsiteCourses(db)])

  return (
    <div className="mx-auto grid max-w-7xl gap-12 px-4 pt-6 pb-20 sm:px-6">
      <Reveal className="grid max-w-3xl gap-3">
        <p className="text-primary text-sm font-semibold tracking-[0.2em] uppercase">{t("Courses")}</p>
        <h1 className="text-4xl font-semibold sm:text-5xl">{t("Explore the courses at BSmart Academy")}</h1>
        <p className="text-muted-foreground text-lg">{t("Choose a subject to see its courses, levels and who it is for.")}</p>
      </Reveal>

      <section className="grid gap-6" aria-labelledby="subjects">
        <h2 id="subjects" className="text-2xl font-semibold">
          {t("Subjects")}
        </h2>
        <SubjectCards subjects={subjects} />
      </section>

      <section className="grid gap-6" aria-labelledby="courses">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 id="courses" className="text-2xl font-semibold">
            {t("All courses")}
          </h2>
          {subjects.length > 1 && (
            <FilterChips
              label={t("Filter by subject")}
              chips={[
                { href: routes.programs, label: t("All"), active: true, count: courses.length },
                ...subjects.map((s) => ({ href: programPath(s.code), label: s.name, active: false, count: Number(s.course_count) })),
              ]}
            />
          )}
        </div>
        <CourseCatalog courses={courses} subjects={subjects} />
      </section>
    </div>
  )
}
