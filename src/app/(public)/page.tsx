import { ArrowRightIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { Reveal } from "@/components/motion/reveal"
import { routes } from "@/config/routes"
import { Hero } from "@/features/site/components/hero"
import { CallToAction, SubjectCards, Testimonials, UspStrip, WhySection } from "@/features/site/components/home-sections"
import { getSiteSettings, listPublishedTestimonials, listWebsiteSubjects } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { publicMediaUrl } from "@/lib/public-media"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: { absolute: `BSmart Academy – ${t("Learn English, build your future")}` },
    description: t("BSmart Academy accompanies you on the journey to master knowledge and develop your skills."),
  }
}

export default async function HomePage() {
  const t = await getT()
  const db = await createClient()
  const [settings, subjects, testimonials] = await Promise.all([getSiteSettings(db), listWebsiteSubjects(db), listPublishedTestimonials(db)])

  return (
    <div className="grid gap-20 pb-20 sm:gap-24">
      <div>
        <Hero imageUrl={publicMediaUrl(settings?.hero_image_path)} />
        <UspStrip />
      </div>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6">
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid gap-2">
            <h2 className="text-3xl font-semibold sm:text-4xl">{t("Explore the courses at BSmart Academy")}</h2>
            <p className="text-muted-foreground">{t("Programmes for every level, taught by our own teachers.")}</p>
          </div>
          <Link href={routes.programs} className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline">
            {t("See all courses")} <ArrowRightIcon className="size-4" aria-hidden />
          </Link>
        </Reveal>
        <SubjectCards subjects={subjects} />
      </section>

      <WhySection />
      <Testimonials items={testimonials} />
      <CallToAction />
    </div>
  )
}
