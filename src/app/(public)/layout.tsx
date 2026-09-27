import type { Metadata } from "next"

import { PublicFooter } from "@/features/site/components/public-footer"
import { PublicHeader } from "@/features/site/components/public-header"
import { getSiteSettings } from "@/features/site/server/site-service"
import { getT } from "@/i18n/server"
import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return {
    description: t("BSmart Academy accompanies you on the journey to master knowledge and develop your skills."),
    // The public website is meant to be found (the platform itself stays noindex).
    robots: { index: true, follow: true },
    openGraph: { siteName: "BSmart Academy", type: "website", images: ["/brand/logo-full.png"] },
  }
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([getCurrentUser(), createClient().then(getSiteSettings)])
  return (
    <div className="bg-background flex min-h-svh flex-col overflow-x-clip">
      <PublicHeader signedIn={Boolean(user)} />
      <main className="flex-1">{children}</main>
      <PublicFooter settings={settings} />
    </div>
  )
}
