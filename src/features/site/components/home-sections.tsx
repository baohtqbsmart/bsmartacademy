import {
  ArrowRightIcon,
  BrainCircuitIcon,
  CheckIcon,
  GraduationCapIcon,
  LaptopIcon,
  QuoteIcon,
  RouteIcon,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"

import { SUBJECT_ICON_COMPONENTS, SubjectArt, subjectIcon } from "@/components/brand/subject-art"
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal"
import { Button } from "@/components/ui/button"
import { programPath, routes } from "@/config/routes"
import type { WebsiteSubject } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { publicMediaUrl } from "@/lib/public-media"

export const USPS: { title: string; text: string; icon: LucideIcon }[] = [
  { title: "Personalised learning path", text: "Matched to each learner's level and goals.", icon: RouteIcon },
  { title: "High-quality teachers", text: "Experienced, caring and well trained.", icon: GraduationCapIcon },
  { title: "Flexible online learning", text: "Learn anytime, anywhere.", icon: LaptopIcon },
  { title: "Smart learning system", text: "Assignments, feedback and progress in one place.", icon: BrainCircuitIcon },
]

export async function UspStrip() {
  const t = await getT()
  return (
    <section aria-label={t("Why learners choose us")} className="mx-auto -mt-6 max-w-7xl px-4 sm:px-6">
      <Stagger inView className="bg-card grid gap-px overflow-hidden rounded-2xl border shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        {USPS.map((usp) => (
          <StaggerItem key={usp.title} className="bg-card flex items-start gap-3 p-5">
            <span className="bg-brand-cream text-primary flex size-11 shrink-0 items-center justify-center rounded-xl">
              <usp.icon className="size-5" aria-hidden />
            </span>
            <span className="grid gap-0.5">
              <span className="font-semibold">{t(usp.title)}</span>
              <span className="text-muted-foreground text-sm">{t(usp.text)}</span>
            </span>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

export async function SubjectCards({ subjects }: { subjects: WebsiteSubject[] }) {
  const t = await getT()
  if (subjects.length === 0) {
    return <p className="text-muted-foreground rounded-xl border border-dashed p-8 text-center">{t("Our programmes will be announced soon.")}</p>
  }
  return (
    <Stagger inView className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {subjects.map((subject) => {
        const Icon = SUBJECT_ICON_COMPONENTS[subjectIcon(subject.icon)]
        return (
          <StaggerItem key={subject.id}>
            <Link href={programPath(subject.code)} className="lift group bg-card flex h-full flex-col overflow-hidden rounded-2xl border">
              <SubjectArt icon={subject.icon} imageUrl={publicMediaUrl(subject.image_path)} className="aspect-[16/10]" />
              <div className="relative flex flex-1 flex-col gap-2 p-5 pt-8">
                <span className="bg-card text-primary absolute -top-6 left-5 flex size-12 items-center justify-center rounded-xl border shadow-sm">
                  <Icon className="size-6" aria-hidden />
                </span>
                <h3 className="font-heading text-xl font-semibold">{subject.name}</h3>
                {subject.audience && <p className="text-success text-sm font-medium">{subject.audience}</p>}
                {subject.description && <p className="text-muted-foreground line-clamp-3 text-sm">{subject.description}</p>}
                <span className="text-primary mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold">
                  {t("Learn more")}
                  <ArrowRightIcon className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
                </span>
              </div>
            </Link>
          </StaggerItem>
        )
      })}
    </Stagger>
  )
}

const WHY = ["A structured programme", "Experienced teachers", "A smart learning system", "Learn anytime, anywhere"]

export async function WhySection() {
  const t = await getT()
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <Reveal className="grid overflow-hidden rounded-3xl lg:grid-cols-2">
        <div className="bg-primary text-primary-foreground grid content-center gap-6 p-8 sm:p-12">
          <h2 className="text-3xl font-semibold sm:text-4xl">{t("Why choose BSmart Academy?")}</h2>
          <p className="text-primary-foreground/85 max-w-md leading-relaxed">
            {t("We do more than teach English: we equip you with the skills to step confidently into the world.")}
          </p>
          <ul className="grid gap-3">
            {WHY.map((point) => (
              <li key={point} className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center rounded-full bg-[var(--brand-beige)] text-[var(--brand-brown)]">
                  <CheckIcon className="size-3.5" aria-hidden />
                </span>
                {t(point)}
              </li>
            ))}
          </ul>
          <div>
            <Button asChild variant="outline" className="border-primary-foreground/40 text-primary-foreground hover:bg-primary-foreground/10 bg-transparent">
              <Link href={routes.about}>
                {t("About us")} <ArrowRightIcon aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
        <div className="bg-brand-cream relative hidden min-h-80 items-center justify-center p-10 lg:flex dark:bg-[#2a2018]">
          <StudyDesk />
          <p aria-hidden className="font-heading text-primary/70 absolute top-8 right-10 rotate-[-6deg] text-2xl italic">
            Small steps,
            <br />
            big changes
          </p>
        </div>
      </Reveal>
    </section>
  )
}

export async function Testimonials({ items }: { items: { id: string; author_name: string; author_role: string; quote: string }[] }) {
  const t = await getT()
  if (items.length === 0) return null
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6">
      <Reveal>
        <h2 className="text-3xl font-semibold sm:text-4xl">{t("What students and parents say")}</h2>
      </Reveal>
      <Stagger inView className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3">
        {items.map((item) => (
          <StaggerItem key={item.id} className="w-[85%] shrink-0 snap-start sm:w-auto">
            <figure className="bg-card grid h-full gap-4 rounded-2xl border p-6 shadow-sm">
              <QuoteIcon className="text-brand-beige size-8" aria-hidden />
              <blockquote className="leading-relaxed">“{item.quote}”</blockquote>
              <figcaption className="mt-auto grid">
                <span className="font-semibold">{item.author_name}</span>
                {item.author_role && <span className="text-muted-foreground text-sm">{item.author_role}</span>}
              </figcaption>
            </figure>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  )
}

export async function CallToAction() {
  const t = await getT()
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6">
      <Reveal className="bg-brand-navy relative grid gap-6 overflow-hidden rounded-3xl p-8 text-center text-white sm:p-14 dark:bg-[#1c2740]">
        <div aria-hidden className="absolute -top-20 -right-20 size-64 rounded-full bg-[var(--brand-beige)]/20 blur-3xl" />
        <h2 className="text-3xl font-semibold sm:text-4xl">{t("Start your learning journey today")}</h2>
        <p className="mx-auto max-w-xl text-white/80">{t("Find the right course, or talk to us and we will help you choose.")}</p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="h-12 bg-[var(--brand-beige)] px-6 text-[#2a1d12] hover:bg-[var(--brand-beige)]/90">
            <Link href={routes.programs}>{t("Explore courses")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 border-white/40 bg-transparent px-6 text-white hover:bg-white/10">
            <Link href={routes.contact}>{t("Contact us")}</Link>
          </Button>
        </div>
      </Reveal>
    </section>
  )
}

/** Decorative: a laptop and a stack of books (why-us panel). */
function StudyDesk() {
  return (
    <svg viewBox="0 0 360 260" className="w-full max-w-md" aria-hidden>
      <rect x="20" y="214" width="320" height="12" rx="6" fill="#7b3f00" />
      <rect x="40" y="170" width="120" height="22" rx="4" fill="#1e2a44" />
      <rect x="48" y="148" width="108" height="22" rx="4" fill="#d4a574" />
      <rect x="36" y="192" width="130" height="22" rx="4" fill="#7b3f00" />
      <text x="100" y="185" textAnchor="middle" fontFamily="Georgia, serif" fontSize="13" fill="#f5e6d3">English</text>
      <text x="102" y="163" textAnchor="middle" fontFamily="Georgia, serif" fontSize="12" fill="#2a1d12">Grammar</text>
      <path d="M190 214 l14 -92 h124 l14 92z" fill="#d7dce6" />
      <path d="M202 206 l12 -76 h108 l12 76z" fill="#1e2a44" />
      <rect x="226" y="146" width="64" height="7" rx="3.5" fill="#f5e6d3" opacity="0.9" />
      <rect x="220" y="162" width="88" height="5" rx="2.5" fill="#f5e6d3" opacity="0.5" />
      <rect x="220" y="174" width="60" height="5" rx="2.5" fill="#f5e6d3" opacity="0.5" />
      <circle cx="304" cy="150" r="7" fill="#2e9a50" />
      <path d="M300 70 q20 -30 40 0 q-20 30 -40 0z" fill="#2e9a50" opacity="0.5" />
    </svg>
  )
}
