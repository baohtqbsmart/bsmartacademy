import type { Metadata } from "next"
import Link from "next/link"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { routes } from "@/config/routes"
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Reset password") }
}

export default async function ForgotPasswordPage() {
  const t = await getT()
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
            <h1>{t("Reset your password")}</h1>
          </CardTitle>
        <CardDescription>{t("We will email you a link to choose a new password.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ForgotPasswordForm />
        <Link
          href={routes.login}
          className="text-muted-foreground text-center text-sm underline-offset-4 hover:underline"
        >
          {t("Back to sign in")}
        </Link>
      </CardContent>
    </Card>
  )
}
