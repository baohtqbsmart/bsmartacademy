import Link from "next/link"

import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-muted-foreground text-sm font-medium">404</p>
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-muted-foreground max-w-md text-sm">
        The page you are looking for does not exist or you do not have access to it.
      </p>
      <Button asChild>
        <Link href={routes.dashboard}>Go to dashboard</Link>
      </Button>
    </main>
  )
}
