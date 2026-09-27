import { MailIcon, MapPinIcon, MessageCircleIcon, MessagesSquareIcon, PhoneIcon, type LucideIcon } from "lucide-react"
import type { Metadata } from "next"

import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal"
import { routes } from "@/config/routes"
import { getSiteSettings } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { firstParam } from "@/lib/search-params"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    title: t("Contact"),
    description: t("Talk to BSmart Academy about courses, levels and enrolment."),
    alternates: { canonical: routes.contact },
  }
}

export default async function ContactPage({ searchParams }: PageProps<"/contact">) {
  const t = await getT()
  const settings = await getSiteSettings(await createClient())
  const course = firstParam(await searchParams, "course")?.slice(0, 40)

  const channels: { label: string; value: string; href: string; icon: LucideIcon; external?: boolean }[] = []
  if (settings?.contact_phone) channels.push({ label: t("Phone"), value: settings.contact_phone, href: `tel:${settings.contact_phone.replace(/[^\d+]/g, "")}`, icon: PhoneIcon })
  if (settings?.contact_email) channels.push({ label: t("Email"), value: settings.contact_email, href: `mailto:${settings.contact_email}`, icon: MailIcon })
  if (settings?.zalo_url) channels.push({ label: "Zalo", value: t("Chat with us on Zalo"), href: settings.zalo_url, icon: MessageCircleIcon, external: true })
  if (settings?.facebook_url) channels.push({ label: "Facebook", value: t("Message our Facebook page"), href: settings.facebook_url, icon: MessagesSquareIcon, external: true })

  return (
    <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-10 pb-20 sm:px-6">
      <Reveal className="grid gap-3 text-center">
        <p className="text-primary text-sm font-semibold tracking-[0.2em] uppercase">{t("Contact")}</p>
        <h1 className="text-4xl font-semibold sm:text-5xl">{t("We are happy to help")}</h1>
        <p className="text-muted-foreground text-lg">{t("Ask about courses, levels, timetables or enrolment.")}</p>
        {course && (
          <p className="bg-brand-cream text-primary mx-auto rounded-full px-4 py-1.5 text-sm font-medium dark:bg-[#2a2018]">
            {t("You are asking about course {course}", { course })}
          </p>
        )}
      </Reveal>

      {channels.length === 0 ? (
        <p className="text-muted-foreground rounded-2xl border border-dashed p-10 text-center">{t("Contact details are being updated. Please check back soon.")}</p>
      ) : (
        <Stagger inView className="grid gap-4 sm:grid-cols-2">
          {channels.map((channel) => (
            <StaggerItem key={channel.label}>
              <a
                href={channel.href}
                {...(channel.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="lift bg-card flex items-center gap-4 rounded-2xl border p-5"
              >
                <span className="bg-brand-cream text-primary flex size-12 shrink-0 items-center justify-center rounded-xl dark:bg-[#2a2018]">
                  <channel.icon className="size-6" aria-hidden />
                </span>
                <span className="grid min-w-0">
                  <span className="text-muted-foreground text-sm">{channel.label}</span>
                  <span className="truncate font-semibold">{channel.value}</span>
                </span>
              </a>
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {settings?.address && (
        <Reveal className="bg-card flex items-start gap-4 rounded-2xl border p-5">
          <MapPinIcon className="text-primary mt-0.5 size-6 shrink-0" aria-hidden />
          <span className="grid">
            <span className="text-muted-foreground text-sm">{t("Address")}</span>
            <span className="font-semibold">{settings.address}</span>
          </span>
        </Reveal>
      )}
    </div>
  )
}
