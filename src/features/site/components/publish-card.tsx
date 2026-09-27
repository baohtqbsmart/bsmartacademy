"use client"

import { ExternalLinkIcon, GlobeIcon, LockKeyholeIcon, SparklesIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { publicLessonPath, resourcePath } from "@/config/routes"
import { setLessonPublicAction, setMaterialPublicAction } from "@/features/site/actions"
import { useT } from "@/i18n/client"
import { slugify } from "@/lib/slug"
import { cn } from "@/lib/utils"

type Access = "members" | "preview" | "public"

const OPTIONS: { value: Access; label: string; text: string; icon: LucideIcon }[] = [
  { value: "members", label: "Members only", text: "Only signed-in users see it (as before).", icon: LockKeyholeIcon },
  { value: "preview", label: "Public preview", text: "Visitors see the beginning, then are asked to sign in.", icon: SparklesIcon },
  { value: "public", label: "Free for everyone", text: "Visitors see all of it, without signing in.", icon: GlobeIcon },
]

function AccessPicker({ value, onChange, name }: { value: Access; onChange: (value: Access) => void; name: string }) {
  const t = useT()
  return (
    <div role="radiogroup" aria-label={t("Who can see it")} className="grid gap-2">
      {OPTIONS.map((option) => (
        <label
          key={option.value}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
            value === option.value ? "border-primary bg-primary/5" : "hover:bg-muted/50"
          )}
        >
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} className="accent-primary mt-1" />
          <option.icon className="text-primary mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="grid gap-0.5">
            <span className="text-sm font-medium">{t(option.label)}</span>
            <span className="text-muted-foreground text-xs">{t(option.text)}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

/** Administrators open a lesson to the website and give it a web address. */
export function LessonPublishCard({
  lessonId,
  title,
  published,
  initialAccess,
  initialSlug,
}: {
  lessonId: string
  title: string
  published: boolean
  initialAccess: Access
  initialSlug: string | null
}) {
  const t = useT()
  const [access, setAccess] = useState<Access>(initialAccess)
  const [slug, setSlug] = useState(initialSlug ?? "")
  const [saved, setSaved] = useState({ access: initialAccess, slug: initialSlug ?? "" })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const dirty = access !== saved.access || slug !== saved.slug

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("On the website")}</CardTitle>
        <CardDescription>{t("Share this lesson on the public website with its own web address.")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AccessPicker value={access} onChange={setAccess} name={`lesson-access-${lessonId}`} />
        {access !== "members" && (
          <div className="grid gap-1.5">
            <Label htmlFor={`slug-${lessonId}`}>{t("Web address")}</Label>
            <div className="flex gap-2">
              <span className="text-muted-foreground bg-muted flex items-center rounded-md border px-2 text-sm">/lessons/</span>
              <Input id={`slug-${lessonId}`} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="english-present-simple" aria-invalid={Boolean(error)} />
              <Button type="button" variant="outline" onClick={() => setSlug(slugify(title))}>
                {t("From the title")}
              </Button>
            </div>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {!published && <p className="text-muted-foreground text-xs">{t("Visitors see it once the lesson is published.")}</p>}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={!dirty || isPending}
            onClick={() =>
              startTransition(async () => {
                setError(null)
                const result = await setLessonPublicAction({ lessonId, access, slug })
                if (result.ok) {
                  setSaved({ access, slug: access === "members" && !slug ? "" : slug.trim().toLowerCase() })
                  toast.success(t("Changes saved."))
                } else {
                  setError(result.error.fieldErrors?.slug?.[0] ?? result.error.message)
                }
              })
            }
          >
            {t("Save")}
          </Button>
          {saved.access !== "members" && saved.slug && published && (
            <Button asChild variant="ghost">
              <Link href={publicLessonPath(saved.slug)} target="_blank">
                <ExternalLinkIcon aria-hidden /> {t("View on the website")}
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Administrators list a library material on the website (locked or free). */
export function MaterialPublishCard({ materialId, initialAccess, archived }: { materialId: string; initialAccess: Access; archived: boolean }) {
  const t = useT()
  const [access, setAccess] = useState<Access>(initialAccess)
  const [saved, setSaved] = useState(initialAccess)
  const [isPending, startTransition] = useTransition()
  const text: Record<Access, string> = {
    members: "Only signed-in users see it (as before).",
    preview: "Listed on the website; visitors must sign in to open the file.",
    public: "Anyone can open the file from the website.",
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("On the website")}</CardTitle>
        <CardDescription>{t(text[access])}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <AccessPicker value={access} onChange={setAccess} name={`material-access-${materialId}`} />
        {archived && <p className="text-muted-foreground text-xs">{t("Archived materials are not shown on the website.")}</p>}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={access === saved || isPending}
            onClick={() =>
              startTransition(async () => {
                const result = await setMaterialPublicAction({ materialId, access })
                if (result.ok) {
                  setSaved(access)
                  toast.success(t("Changes saved."))
                } else toast.error(result.error.message)
              })
            }
          >
            {t("Save")}
          </Button>
          {saved !== "members" && !archived && (
            <Button asChild variant="ghost">
              <Link href={resourcePath(materialId)} target="_blank">
                <ExternalLinkIcon aria-hidden /> {t("View on the website")}
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
