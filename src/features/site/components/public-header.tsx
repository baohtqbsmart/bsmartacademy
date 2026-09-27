"use client"

import { MenuIcon } from "lucide-react"
import { motion, useMotionValueEvent, useScroll } from "motion/react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { BrandLockup } from "@/components/layout/brand"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { routes } from "@/config/routes"
import { PUBLIC_LINKS } from "@/features/site/links"
import { useT } from "@/i18n/client"
import { LanguageSwitcher } from "@/i18n/language-switcher"
import { cn } from "@/lib/utils"

/** Sticky website header: slimmer, solid and shadowed once the page scrolls. */
export function PublicHeader({ signedIn }: { signedIn: boolean }) {
  const t = useT()
  const pathname = usePathname()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 12))

  const isActive = (href: string) => (href === routes.home ? pathname === href : pathname === href || pathname.startsWith(`${href}/`))

  return (
    <motion.header
      className={cn(
        "sticky top-0 z-50 w-full transition-[background-color,box-shadow,border-color] duration-300",
        scrolled ? "bg-background/90 border-b shadow-sm backdrop-blur-md" : "border-b border-transparent bg-transparent"
      )}
    >
      <div
        className={cn(
          "mx-auto flex max-w-7xl items-center gap-6 px-4 transition-[height] duration-300 sm:px-6",
          scrolled ? "h-16" : "h-20"
        )}
      >
        <Link href={routes.home} aria-label="BSmart Academy" className="shrink-0">
          <BrandLockup markClassName={cn("transition-all duration-300", scrolled ? "size-9" : "size-10")} />
        </Link>

        <nav aria-label={t("Main")} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {PUBLIC_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive(link.href) ? "text-primary" : "text-foreground/80 hover:text-primary"
                  )}
                >
                  {t(link.title)}
                  {isActive(link.href) && (
                    <motion.span layoutId="public-nav" className="bg-primary absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full" />
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="ml-auto hidden items-center gap-2 lg:flex">
          <LanguageSwitcher className="w-36" />
          {signedIn ? (
            <Button asChild>
              <Link href={routes.dashboard}>{t("Go to my learning")}</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="text-primary">
                <Link href={routes.login}>{t("Sign in")}</Link>
              </Button>
              <Button asChild>
                <Link href={routes.register}>{t("Sign up")}</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="ml-auto lg:hidden" aria-label={t("Open menu")}>
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72">
            <SheetHeader>
              <SheetTitle className="sr-only">{t("Menu")}</SheetTitle>
              <BrandLockup />
            </SheetHeader>
            <nav aria-label={t("Main")} className="grid gap-1 px-4">
              {PUBLIC_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setOpen(false)}
                  aria-current={isActive(link.href) ? "page" : undefined}
                  className={cn(
                    "rounded-lg px-3 py-2.5 text-base font-medium transition-colors",
                    isActive(link.href) ? "bg-primary/10 text-primary" : "hover:bg-muted"
                  )}
                >
                  {t(link.title)}
                </Link>
              ))}
            </nav>
            <div className="mt-auto grid gap-3 p-4">
              <LanguageSwitcher className="w-full" />
              {signedIn ? (
                <Button asChild>
                  <Link href={routes.dashboard} onClick={() => setOpen(false)}>
                    {t("Go to my learning")}
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild>
                    <Link href={routes.register} onClick={() => setOpen(false)}>
                      {t("Sign up")}
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href={routes.login} onClick={() => setOpen(false)}>
                      {t("Sign in")}
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </motion.header>
  )
}
