"use client"

import { MotionConfig } from "motion/react"
import { ThemeProvider } from "next-themes"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { LocaleProvider } from "@/i18n/client"
import type { Locale } from "@/i18n/config"

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return (
    <LocaleProvider locale={locale}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {/* Animations follow the visitor's "reduce motion" setting. */}
        <MotionConfig reducedMotion="user">
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton />
          </TooltipProvider>
        </MotionConfig>
      </ThemeProvider>
    </LocaleProvider>
  )
}
