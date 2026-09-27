import { BrandLogo } from "@/components/layout/brand"
import { LanguageSwitcher } from "@/i18n/language-switcher"

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden p-6 md:p-10">
      {/* Brand accents: a brown band across the top and a navy rule beneath it. */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-primary" />
      <div aria-hidden className="bg-brand-navy absolute inset-x-0 top-1.5 h-0.5" />
      <LanguageSwitcher className="absolute top-4 right-4 w-36 bg-background" />
      <div className="flex w-full max-w-sm flex-col gap-6">
        <BrandLogo className="w-36 self-center" />
        <div className="[&>[data-slot=card]]:border-t-brand-navy [&>[data-slot=card]]:border-t-4">{children}</div>
      </div>
    </main>
  )
}
