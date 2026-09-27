import type { Metadata } from "next"

import { PageHeader } from "@/components/layout/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AvatarUploader } from "@/features/profile/components/avatar-uploader"
import { ProfileForm } from "@/features/profile/components/profile-form"
import { requireUser } from "@/lib/auth/session"
import { BUCKETS, createSignedUrl } from "@/lib/storage"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "My profile" }

export default async function ProfilePage() {
  const user = await requireUser()
  const avatarUrl = await createSignedUrl(await createClient(), BUCKETS.avatars, user.avatarPath)

  return (
    <>
      <PageHeader title="My profile" description="Manage your personal information." />
      <div className="grid max-w-xl gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Photo</CardTitle>
            <CardDescription>PNG, JPEG or WebP, up to 2 MB.</CardDescription>
          </CardHeader>
          <CardContent>
            <AvatarUploader userId={user.id} name={user.fullName || user.email} avatarUrl={avatarUrl} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Personal details</CardTitle>
            <CardDescription>Signed in as {user.email}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm defaultValues={{ fullName: user.fullName, phone: user.phone ?? "" }} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
