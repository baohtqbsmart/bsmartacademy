import { GraduationCapIcon } from "lucide-react"

import { siteConfig } from "@/config/site"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted flex min-h-svh flex-col items-center justify-center gap-6 p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center gap-2 self-center font-semibold">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md">
            <GraduationCapIcon className="size-5" aria-hidden />
          </span>
          {siteConfig.name}
        </div>
        {children}
      </div>
    </main>
  )
}
