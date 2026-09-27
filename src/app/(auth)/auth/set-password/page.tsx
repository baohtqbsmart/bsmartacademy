import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SetPasswordForm } from "@/features/auth/components/set-password-form"
import { requireUser } from "@/lib/auth/session"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Choose a password") }
}

export default async function SetPasswordPage() {
  const t = await getT()
  const user = await requireUser()

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
            <h1>{t("Choose a password")}</h1>
          </CardTitle>
        <CardDescription>
          {user.mustChangePassword
            ? t("Your account was created with a default password. Choose your own password for {email} to continue.", { email: user.email })
            : t("Set a new password for {email}.", { email: user.email })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
      </CardContent>
    </Card>
  )
}
