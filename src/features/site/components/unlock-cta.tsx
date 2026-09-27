import { LockKeyholeIcon, LogInIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { routes } from "@/config/routes"
import { getT } from "@/i18n/server"

/**
 * Where free content ends: visitors are asked to sign in (and come back to
 * the full version); signed-in users go to it, or are told how to unlock it.
 */
export async function UnlockCta({
  signedIn,
  fullHref,
  title,
  text,
}: {
  signedIn: boolean
  /** The full version inside the platform, if the viewer may open it. */
  fullHref: string | null
  title?: string
  text?: string
}) {
  const t = await getT()
  return (
    <aside className="bg-brand-cream/70 border-primary/20 grid justify-items-center gap-3 rounded-2xl border p-8 text-center dark:bg-[#2a2018]">
      <span className="bg-primary text-primary-foreground flex size-12 items-center justify-center rounded-full">
        <LockKeyholeIcon className="size-5" aria-hidden />
      </span>
      {!signedIn ? (
        <>
          <h2 className="text-2xl font-semibold">{title ?? t("Sign in to continue learning")}</h2>
          <p className="text-muted-foreground max-w-md">{text ?? t("The full lesson, exercises, scores and your progress are for BSmart Academy learners.")}</p>
          <Button asChild size="lg">
            <Link href={`${routes.login}?next=${encodeURIComponent(fullHref ?? routes.dashboard)}`}>
              <LogInIcon aria-hidden /> {t("Sign in to continue learning")}
            </Link>
          </Button>
          <Link href={routes.contact} className="text-primary text-sm font-medium hover:underline">
            {t("Not a learner yet? Contact us to enrol")}
          </Link>
        </>
      ) : fullHref ? (
        <>
          <h2 className="text-2xl font-semibold">{t("Continue in your learning space")}</h2>
          <Button asChild size="lg">
            <Link href={fullHref}>{t("Open the full version")}</Link>
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-semibold">{t("Enrol in a course to unlock this content")}</h2>
          <p className="text-muted-foreground max-w-md">{t("Talk to us to join a course that includes it.")}</p>
          <Button asChild size="lg">
            <Link href={routes.contact}>{t("Contact us")}</Link>
          </Button>
        </>
      )}
    </aside>
  )
}
