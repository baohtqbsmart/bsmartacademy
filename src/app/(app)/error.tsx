"use client"

import { ErrorState } from "@/components/shared/error-state"

export default function AppError(props: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorState {...props} />
}
