import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { LoginForm } from "@/features/auth/components/login-form"

export const metadata: Metadata = { title: "Sign in" }

const ERROR_MESSAGES: Record<string, string> = {
  link_invalid: "That link is invalid or has expired. Please request a new one.",
  inactive: "Your account is not active. Please contact the academy office.",
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
            <h1>Welcome back</h1>
          </CardTitle>
        <CardDescription>Sign in with the account provided by the academy.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm
          next={typeof next === "string" ? next : undefined}
          initialError={typeof error === "string" ? ERROR_MESSAGES[error] : undefined}
        />
      </CardContent>
    </Card>
  )
}
