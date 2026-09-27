import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AvatarUploader } from "@/features/profile/components/avatar-uploader"
import { ProfileForm } from "@/features/profile/components/profile-form"
import { requireUser } from "@/lib/auth/session"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import { createClient } from "@/lib/supabase/server"
import { LanguageSwitcher } from "@/i18n/language-switcher"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("My profile") }
}

export default async function ProfilePage() {
  const t = await getT()
  const user = await requireUser()
  const avatarUrl = await createSignedUrl(await createClient(), BUCKETS.avatars, user.avatarPath)

  return (
    <>
      <PageHeader title={t("My profile")} description={t("Manage your personal information.")} />
      <div className="grid max-w-xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("Photo")}</CardTitle>
            <CardDescription>{t("PNG, JPEG or WebP, up to 2 MB.")}</CardDescription>
          </CardHeader>
          <CardContent>
            <AvatarUploader userId={user.id} name={user.fullName || user.email} avatarUrl={avatarUrl} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Personal details")}</CardTitle>
            <CardDescription>{t("Signed in as {email}.", { email: user.email })}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm defaultValues={{ fullName: user.fullName, phone: user.phone ?? "" }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("Language")}</CardTitle>
            <CardDescription>
              {t("Vietnamese is the default. Choose English as a second language for this browser.")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LanguageSwitcher />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
