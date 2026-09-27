import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SetPasswordForm } from "@/features/auth/components/set-password-form"
import { requireUser } from "@/lib/auth/session"

export const metadata: Metadata = { title: "Choose a password" }

export default async function SetPasswordPage() {
  const user = await requireUser()

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
            <h1>Choose a password</h1>
          </CardTitle>
        <CardDescription>Set a new password for {user.email}.</CardDescription>
      </CardHeader>
      <CardContent>
        <SetPasswordForm />
      </CardContent>
    </Card>
  )
}
