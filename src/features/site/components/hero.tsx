import { ArrowRightIcon, PlayCircleIcon } from "lucide-react"
import Link from "next/link"

import { HeroIllustration } from "@/components/brand/hero-illustration"
import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { getT } from "@/i18n/server"
import { cn } from "@/lib/utils"

// Entrance: CSS animations with staggered delays (visible without JavaScript).
const enter = "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-700 ease-out"
const delay = (step: number) => ({ animationDelay: `${step * 120}ms` })

/** Home hero: headline lines arrive one after another; the picture fades and settles. */
export async function Hero({ imageUrl }: { imageUrl: string | null }) {
  const t = await getT()
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(60%_60%_at_85%_20%,rgb(212_165_116/0.22),transparent),radial-gradient(40%_50%_at_0%_100%,rgb(30_42_68/0.08),transparent)]" />
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-8 pb-16 sm:px-6 md:pt-12 lg:grid-cols-2 lg:gap-16 lg:pb-24 [&>*]:min-w-0">
        <div className="grid gap-6">
          <p className={cn(enter, "text-primary text-sm font-semibold tracking-[0.2em] uppercase")} style={delay(0)}>
            BSmart Academy
          </p>
          <h1 className="text-foreground text-4xl leading-[1.1] font-semibold sm:text-5xl lg:text-6xl">
            <span className={cn(enter, "block")} style={delay(1)}>
              {t("Learn English")}
            </span>
            <span className={cn(enter, "text-primary block")} style={delay(2)}>
              {t("build your future")}
            </span>
          </h1>
          <p className={cn(enter, "text-muted-foreground max-w-xl text-base leading-relaxed sm:text-lg")} style={delay(3)}>
            {t("BSmart Academy accompanies you on the journey to master knowledge and develop your skills.")}
          </p>
          <div className={cn(enter, "flex flex-wrap gap-3")} style={delay(4)}>
            <Button asChild size="lg" className="group h-12 px-6 text-base">
              <Link href={routes.programs}>
                {t("Explore courses")}
                <ArrowRightIcon className="transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-primary/40 text-primary hover:bg-primary/5 h-12 px-6 text-base">
              <Link href={routes.about}>
                <PlayCircleIcon aria-hidden />
                {t("Learn more")}
              </Link>
            </Button>
          </div>
        </div>

        <div className="animate-in fade-in zoom-in-95 fill-mode-both relative duration-1000 ease-out" style={delay(1)}>
          <div className="bg-brand-beige/30 absolute -inset-4 -z-10 rounded-[2.5rem] blur-2xl" aria-hidden />
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public storage URL chosen by staff
            <img src={imageUrl} alt={t("Students learning online at BSmart Academy")} className="aspect-[6/5] w-full rounded-[2rem] object-cover shadow-xl" />
          ) : (
            <HeroIllustration className="drop-shadow-xl" title={t("A student learning online with headphones and a laptop")} />
          )}
          <p aria-hidden className="font-heading text-primary/80 absolute -top-2 right-2 rotate-[-8deg] text-xl italic sm:text-2xl">
            Better English,
            <br />
            Brighter Future
          </p>
        </div>
      </div>
    </section>
  )
}
