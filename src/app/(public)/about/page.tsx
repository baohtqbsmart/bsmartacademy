import { BookOpenCheckIcon, ChartLineIcon, HeartHandshakeIcon, MessageSquareTextIcon, SparklesIcon, UsersIcon, type LucideIcon } from "lucide-react"
import type { Metadata } from "next"

import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal"
import { routes } from "@/config/routes"
import { UserAvatar } from "@/components/shared/user-avatar"
import { Badge } from "@/components/ui/badge"
import { CallToAction, USPS } from "@/features/site/components/home-sections"
import { listPublicTeachers } from "@/features/site/server/content-service"
import { publicMediaUrl } from "@/lib/public-media"
import { createClient } from "@/lib/supabase/server"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: t("About us"),
    description: t("We do more than teach English: we equip you with the skills to step confidently into the world."),
    alternates: { canonical: routes.about },
  }
}

const STEPS: { title: string; text: string; icon: LucideIcon }[] = [
  { title: "Find your course", text: "Browse subjects and levels, then talk to us about the right class.", icon: BookOpenCheckIcon },
  { title: "Learn with your class", text: "Live lessons in class or online, with materials and homework in one place.", icon: UsersIcon },
  { title: "Get real feedback", text: "Teachers mark writing and speaking with clear criteria and comments.", icon: MessageSquareTextIcon },
  { title: "See your progress", text: "Scores, attendance and skills over time, for students and parents.", icon: ChartLineIcon },
]

export default async function AboutPage() {
  const t = await getT()
  const teachers = await listPublicTeachers(await createClient())
  return (
    <div className="grid gap-20 pb-20">
      <section className="mx-auto grid max-w-4xl gap-5 px-4 pt-10 text-center sm:px-6">
        <Reveal className="grid gap-5">
          <p className="text-primary text-sm font-semibold tracking-[0.2em] uppercase">{t("About us")}</p>
          <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">{t("A modern online academy, built around each learner")}</h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            {t("We do more than teach English: we equip you with the skills to step confidently into the world.")}{" "}
            {t("BSmart Academy combines caring teachers with a learning system where lessons, work, feedback and progress live together.")}
          </p>
        </Reveal>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-semibold">{t("What we believe in")}</h2>
        </Reveal>
        <Stagger inView className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USPS.map((usp) => (
            <StaggerItem key={usp.title} className="bg-card grid content-start gap-3 rounded-2xl border p-6">
              <span className="bg-brand-cream text-primary flex size-12 items-center justify-center rounded-xl">
                <usp.icon className="size-6" aria-hidden />
              </span>
              <h3 className="font-heading text-lg font-semibold">{t(usp.title)}</h3>
              <p className="text-muted-foreground text-sm">{t(usp.text)}</p>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {teachers.length > 0 && (
        <section className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6" aria-labelledby="teachers">
          <Reveal className="grid gap-2">
            <h2 id="teachers" className="text-3xl font-semibold">
              {t("Our teachers")}
            </h2>
            <p className="text-muted-foreground">{t("The people who will teach you.")}</p>
          </Reveal>
          <Stagger inView className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {teachers.map((teacher) => (
              <StaggerItem key={teacher.id} className="bg-card grid content-start gap-4 rounded-2xl border p-6">
                <div className="flex items-center gap-4">
                  <UserAvatar name={teacher.full_name} avatarUrl={publicMediaUrl(teacher.photo_path)} className="size-16 text-lg" />
                  <div className="grid gap-1">
                    <h3 className="font-heading text-lg font-semibold">{teacher.full_name}</h3>
                    <div className="flex flex-wrap gap-1">
                      {teacher.subjects.map((subject) => (
                        <Badge key={subject} variant="secondary">
                          {subject}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                {teacher.bio && <p className="text-muted-foreground text-sm leading-relaxed">{teacher.bio}</p>}
                {teacher.qualifications.length > 0 && (
                  <ul className="grid gap-1 text-sm">
                    {teacher.qualifications.map((q) => (
                      <li key={q} className="flex gap-2">
                        <span aria-hidden className="text-primary">•</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                )}
              </StaggerItem>
            ))}
          </Stagger>
        </section>
      )}

      <section className="bg-brand-cream/60 dark:bg-card/40 py-16">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6">
          <Reveal className="grid gap-2">
            <h2 className="text-3xl font-semibold">{t("How learning works at BSmart")}</h2>
            <p className="text-muted-foreground">{t("From your first visit to your first certificate, every step is clear.")}</p>
          </Reveal>
          <Stagger inView className="grid gap-5 md:grid-cols-4">
            {STEPS.map((step, index) => (
              <StaggerItem key={step.title} className="relative grid content-start gap-3">
                <span className="text-primary/20 font-heading text-6xl leading-none font-semibold">{index + 1}</span>
                <span className="text-primary flex items-center gap-2 font-semibold">
                  <step.icon className="size-5" aria-hidden />
                  {t(step.title)}
                </span>
                <p className="text-muted-foreground text-sm">{t(step.text)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      <section className="mx-auto grid max-w-4xl gap-4 px-4 text-center sm:px-6">
        <Reveal className="grid justify-items-center gap-4">
          <span className="bg-brand-cream text-primary flex size-14 items-center justify-center rounded-full">
            <HeartHandshakeIcon className="size-7" aria-hidden />
          </span>
          <h2 className="text-3xl font-semibold">{t("Families are part of the journey")}</h2>
          <p className="text-muted-foreground text-lg">
            {t("Parents follow grades, attendance, homework, timetable and tuition, and can message their child's teachers.")}
          </p>
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <SparklesIcon className="text-primary size-4" aria-hidden />
            {t("Teachers are supported by an AI assistant; nothing reaches students without a teacher's review.")}
          </p>
        </Reveal>
      </section>

      <CallToAction />
    </div>
  )
}
