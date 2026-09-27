import { ExternalLinkIcon } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { HeroImageEditor, SiteSettingsForm, SubjectWebsiteCard, TeacherWebsiteCard, TestimonialList } from "@/features/site/components/site-admin"
import { listTeachersForWebsite } from "@/features/site/server/content-service"
import { getSiteSettings, listSubjectsForWebsite, listTestimonials } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { requireRouteAccess } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Website") }
}

export default async function WebsiteSettingsPage() {
  const t = await getT()
  await requireRouteAccess(routes.website)
  const db = await createClient()
  const [settings, subjects, testimonials, teachers] = await Promise.all([
    getSiteSettings(db),
    listSubjectsForWebsite(db),
    listTestimonials(db),
    listTeachersForWebsite(db),
  ])

  return (
    <>
      <PageHeader
        title={t("Website")}
        description={t("What visitors see on the public website. Changes appear straight away.")}
        actions={
          <Button asChild variant="outline">
            <Link href={routes.home} target="_blank">
              <ExternalLinkIcon aria-hidden /> {t("Open the website")}
            </Link>
          </Button>
        }
      />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("Contact details")}</CardTitle>
            <CardDescription>{t("Shown on the Contact page and in the footer. Empty fields are not shown.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SiteSettingsForm
              defaultValues={{
                contactEmail: settings?.contact_email ?? "",
                contactPhone: settings?.contact_phone ?? "",
                address: settings?.address ?? "",
                facebookUrl: settings?.facebook_url ?? "",
                zaloUrl: settings?.zalo_url ?? "",
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Home page picture")}</CardTitle>
            <CardDescription>{t("A photo of students learning, PNG, JPEG or WebP up to 5 MB. Without one, the illustration is shown.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <HeroImageEditor path={settings?.hero_image_path ?? null} />
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("Subjects on the website")}</h2>
          <p className="text-muted-foreground text-sm">
            {t("Subjects and courses come from the catalogue (Subjects & levels, Courses); here you choose how they look. Only active courses are listed publicly.")}
          </p>
        </div>
        {subjects.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("No subjects yet")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {subjects.map((subject) => (
              <SubjectWebsiteCard key={subject.id} subject={subject} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("Teachers on the website")}</h2>
          <p className="text-muted-foreground text-sm">{t("Choose who appears in “Our teachers” on the About page. Subjects and qualifications come from each teacher's profile.")}</p>
        </div>
        {teachers.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("No teachers to show")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {teachers.map((teacher) => (
              <TeacherWebsiteCard key={teacher.id} teacher={teacher} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("Testimonials")}</h2>
          <p className="text-muted-foreground text-sm">{t("Real words from students and parents. Only published ones appear on the home page.")}</p>
        </div>
        <TestimonialList items={testimonials} />
      </section>
    </>
  )
}
