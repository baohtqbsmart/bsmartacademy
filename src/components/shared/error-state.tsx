"use client"

import { TriangleAlertIcon } from "lucide-react"

import { Button } from "@/components/ui/button"

type ErrorStateProps = {
  error: Error & { digest?: string }
  retry: () => void
}

/**
 * Shared UI for error.tsx boundaries. In production Next.js replaces server
 * error messages with a generic one, so only the digest is shown for support.
 */
export function ErrorState({ error, retry }: ErrorStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <TriangleAlertIcon className="text-destructive size-10" aria-hidden />
      <div className="grid gap-1">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <p className="text-muted-foreground max-w-md text-sm">
          The page could not be loaded. Please try again, and contact the academy office if the
          problem continues.
        </p>
        {error.digest && (
          <p className="text-muted-foreground font-mono text-xs">Reference: {error.digest}</p>
        )}
      </div>
      <Button onClick={retry}>Try again</Button>
    </div>
  )
}
