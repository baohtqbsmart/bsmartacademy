import { CheckIcon } from "lucide-react"
import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RegisterForm } from "@/features/auth/components/register-form"
import { getT } from "@/i18n/server"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("Create an account") }
}

const BENEFITS = ["Read free lessons in full", "Comment on lessons and articles", "Look up words in the dictionary"]

export default async function RegisterPage() {
  const t = await getT()
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>{t("Create an account")}</h1>
        </CardTitle>
        <CardDescription>{t("Free. Enrolled students get their account from the academy.")}</CardDescription>
        <ul className="text-muted-foreground mx-auto mt-2 grid gap-1 text-left text-sm">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-center gap-2">
              <CheckIcon className="text-success size-4" aria-hidden />
              {t(benefit)}
            </li>
          ))}
        </ul>
      </CardHeader>
      <CardContent>
        <RegisterForm />
      </CardContent>
    </Card>
  )
}
