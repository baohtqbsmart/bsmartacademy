import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react"
import Link from "next/link"

import { BrandLogo } from "@/components/layout/brand"
import { routes } from "@/config/routes"
import { PUBLIC_LINKS } from "@/features/site/links"
import type { SiteSettings } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"

export async function PublicFooter({ settings }: { settings: SiteSettings | null }) {
  const t = await getT()
  const year = new Date().getFullYear()
  return (
    <footer className="bg-brand-navy text-[#e6e1d8] dark:bg-[#0f141f]">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr]">
        <div className="grid content-start gap-4">
          <BrandLogo className="w-28 rounded-2xl bg-[var(--brand-cream)] p-3" />
          <p className="max-w-xs text-sm text-[#e6e1d8]/80">
            {t("BSmart Academy accompanies you on the journey to master knowledge and develop your skills.")}
          </p>
        </div>
        <div className="grid content-start gap-3">
          <h2 className="font-heading text-lg text-[var(--brand-beige)]">{t("Explore")}</h2>
          <ul className="grid gap-2 text-sm">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-white">
                  {t(link.title)}
                </Link>
              </li>
            ))}
            <li>
              <Link href={routes.login} className="hover:text-white">
                {t("Sign in")}
              </Link>
            </li>
          </ul>
        </div>
        <div className="grid content-start gap-3">
          <h2 className="font-heading text-lg text-[var(--brand-beige)]">{t("Contact")}</h2>
          <ul className="grid gap-2 text-sm">
            {settings?.contact_phone && (
              <li className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0" aria-hidden />
                <a href={`tel:${settings.contact_phone.replace(/[^\d+]/g, "")}`} className="hover:text-white">
                  {settings.contact_phone}
                </a>
              </li>
            )}
            {settings?.contact_email && (
              <li className="flex items-center gap-2">
                <MailIcon className="size-4 shrink-0" aria-hidden />
                <a href={`mailto:${settings.contact_email}`} className="hover:text-white">
                  {settings.contact_email}
                </a>
              </li>
            )}
            {settings?.address && (
              <li className="flex items-start gap-2">
                <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
                {settings.address}
              </li>
            )}
            {!settings?.contact_phone && !settings?.contact_email && !settings?.address && (
              <li>
                <Link href={routes.contact} className="hover:text-white">
                  {t("Contact us")}
                </Link>
              </li>
            )}
          </ul>
          <div className="flex gap-2">
            {settings?.facebook_url && <SocialLink href={settings.facebook_url} label="Facebook" />}
            {settings?.zalo_url && <SocialLink href={settings.zalo_url} label="Zalo" />}
          </div>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-xs text-[#e6e1d8]/60 sm:px-6">© {year} BSmart Academy</p>
      </div>
    </footer>
  )
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium transition-colors hover:bg-white/10"
    >
      {label}
    </a>
  )
}
