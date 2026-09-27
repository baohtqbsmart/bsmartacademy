"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { EyeIcon, EyeOffIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"

import { HeroIllustration } from "@/components/brand/hero-illustration"
import { SUBJECT_ICON_COMPONENTS, SUBJECT_ICON_LABELS, SUBJECT_ICONS, SubjectArt, subjectIcon, type SubjectIcon } from "@/components/brand/subject-art"
import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  deleteTestimonialAction,
  saveSiteSettingsAction,
  saveSubjectWebsiteAction,
  saveTestimonialAction,
  setHeroImageAction,
} from "@/features/site/actions"
import { SiteImageField } from "@/features/site/components/site-image-field"
import { siteSettingsSchema, testimonialSchema } from "@/features/site/schemas"
import { useT } from "@/i18n/client"
import { applyActionError } from "@/lib/action-result"

// ---- Contact details --------------------------------------------------------

export function SiteSettingsForm({ defaultValues }: { defaultValues: z.input<typeof siteSettingsSchema> }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<z.input<typeof siteSettingsSchema>, unknown, z.output<typeof siteSettingsSchema>>({
    resolver: zodResolver(siteSettingsSchema),
    defaultValues,
  })

  const fields = [
    { name: "contactEmail", label: "Contact email", type: "email", placeholder: "lienhe@bsmart.vn" },
    { name: "contactPhone", label: "Phone", type: "tel", placeholder: "0900 000 000" },
    { name: "address", label: "Address", type: "text", placeholder: "" },
    { name: "facebookUrl", label: "Facebook page", type: "url", placeholder: "https://facebook.com/…" },
    { name: "zaloUrl", label: "Zalo", type: "url", placeholder: "https://zalo.me/…" },
  ] as const

  return (
    <Form {...form}>
      <form
        noValidate
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={form.handleSubmit((values) => {
          setFormError(null)
          startTransition(async () => {
            const result = await saveSiteSettingsAction(values)
            if (result.ok) {
              form.reset(form.getValues())
              toast.success(t("Changes saved."))
            } else setFormError(applyActionError(form, result.error))
          })
        })}
      >
        <div className="sm:col-span-2">
          <FormAlert message={formError} />
        </div>
        {fields.map((f) => (
          <FormField
            key={f.name}
            control={form.control}
            name={f.name}
            render={({ field }) => (
              <FormItem className={f.name === "address" ? "sm:col-span-2" : undefined}>
                <FormLabel>{t(f.label)}</FormLabel>
                <FormControl>
                  <Input type={f.type} placeholder={f.placeholder} {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ))}
        <div className="sm:col-span-2">
          <SubmitButton pending={isPending} disabled={!form.formState.isDirty}>
            {t("Save changes")}
          </SubmitButton>
        </div>
      </form>
    </Form>
  )
}

// ---- Hero picture -----------------------------------------------------------

export function HeroImageEditor({ path }: { path: string | null }) {
  return (
    <SiteImageField
      folder="hero"
      path={path}
      onSave={(next) => setHeroImageAction({ path: next })}
      fallback={<HeroIllustration className="size-full object-cover" />}
    />
  )
}

// ---- Subjects on the website ------------------------------------------------

type SubjectRow = { id: string; code: string; name: string; audience: string; icon: string; image_path: string | null; show_on_website: boolean }

export function SubjectWebsiteCard({ subject }: { subject: SubjectRow }) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [audience, setAudience] = useState(subject.audience)
  const [icon, setIcon] = useState<SubjectIcon>(subjectIcon(subject.icon))
  const [show, setShow] = useState(subject.show_on_website)
  const dirty = audience !== subject.audience || icon !== subjectIcon(subject.icon) || show !== subject.show_on_website

  const save = (imagePath: string | null) =>
    saveSubjectWebsiteAction({ subjectId: subject.id, audience, icon, imagePath, showOnWebsite: show })

  return (
    <div className="bg-card grid gap-4 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-heading text-lg font-semibold">{subject.name}</h3>
        <Badge variant={show ? "default" : "outline"}>{show ? t("On the website") : t("Hidden")}</Badge>
      </div>
      <SiteImageField folder="subjects" path={subject.image_path} onSave={save} fallback={<SubjectArt icon={icon} className="size-full" />} />
      <div className="grid gap-1.5">
        <Label htmlFor={`aud-${subject.id}`}>{t("Who it is for")}</Label>
        <Input id={`aud-${subject.id}`} value={audience} maxLength={80} placeholder={t("e.g. Grades 6 – 12")} onChange={(e) => setAudience(e.target.value)} />
      </div>
      <fieldset className="grid gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">{t("Icon")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {SUBJECT_ICONS.map((value) => {
            const Icon = SUBJECT_ICON_COMPONENTS[value]
            return (
              <Button
                key={value}
                type="button"
                size="icon-sm"
                variant={icon === value ? "default" : "outline"}
                aria-pressed={icon === value}
                aria-label={t(SUBJECT_ICON_LABELS[value])}
                title={t(SUBJECT_ICON_LABELS[value])}
                onClick={() => setIcon(value)}
              >
                <Icon aria-hidden />
              </Button>
            )
          })}
        </div>
      </fieldset>
      <Label className="flex items-center gap-2 font-normal">
        <Checkbox checked={show} onCheckedChange={(v) => setShow(v === true)} />
        {t("Show this subject on the website")}
      </Label>
      <div>
        <Button
          type="button"
          size="sm"
          disabled={!dirty || isPending}
          onClick={() =>
            startTransition(async () => {
              const result = await save(subject.image_path)
              if (result.ok) toast.success(t("Changes saved."))
              else toast.error(result.error.message)
            })
          }
        >
          {t("Save changes")}
        </Button>
      </div>
    </div>
  )
}

// ---- Testimonials -----------------------------------------------------------

type Testimonial = { id: string; author_name: string; author_role: string; quote: string; is_published: boolean; sort_order: number }

export function TestimonialList({ items }: { items: Testimonial[] }) {
  const t = useT()
  return (
    <div className="grid gap-4">
      <div>
        <TestimonialDialog trigger={<Button size="sm"><PlusIcon aria-hidden /> {t("Add a testimonial")}</Button>} />
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("No testimonials yet. The section stays hidden on the website until one is published.")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.id} className="bg-card grid gap-2 rounded-xl border p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="grid">
                  <span className="font-medium">{item.author_name}</span>
                  {item.author_role && <span className="text-muted-foreground text-xs">{item.author_role}</span>}
                </div>
                <Badge variant={item.is_published ? "default" : "outline"} className="gap-1">
                  {item.is_published ? <EyeIcon className="size-3" aria-hidden /> : <EyeOffIcon className="size-3" aria-hidden />}
                  {item.is_published ? t("Published") : t("Draft")}
                </Badge>
              </div>
              <blockquote className="text-muted-foreground line-clamp-4 text-sm">“{item.quote}”</blockquote>
              <div className="flex gap-1">
                <TestimonialDialog
                  item={item}
                  trigger={
                    <Button size="sm" variant="ghost">
                      <PencilIcon aria-hidden /> {t("Edit")}
                    </Button>
                  }
                />
                <ConfirmActionButton
                  size="sm"
                  variant="ghost"
                  title={t("Delete this testimonial?")}
                  description={t("It is removed from the website straight away.")}
                  confirmLabel={t("Delete")}
                  successMessage={t("Testimonial deleted.")}
                  destructive
                  action={deleteTestimonialAction.bind(null, { id: item.id })}
                >
                  <Trash2Icon aria-hidden /> {t("Delete")}
                </ConfirmActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TestimonialDialog({ item, trigger }: { item?: Testimonial; trigger: React.ReactNode }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<z.input<typeof testimonialSchema>, unknown, z.output<typeof testimonialSchema>>({
    resolver: zodResolver(testimonialSchema),
    defaultValues: {
      id: item?.id,
      authorName: item?.author_name ?? "",
      authorRole: item?.author_role ?? "",
      quote: item?.quote ?? "",
      isPublished: item?.is_published ?? false,
      sortOrder: item?.sort_order ?? 0,
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? t("Edit testimonial") : t("New testimonial")}</DialogTitle>
          <DialogDescription>{t("Only publish real words from students or parents, with their permission.")}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            noValidate
            className="grid gap-4"
            onSubmit={form.handleSubmit((values) => {
              setFormError(null)
              startTransition(async () => {
                const result = await saveTestimonialAction(values)
                if (result.ok) {
                  toast.success(t("Changes saved."))
                  setOpen(false)
                  if (!item) form.reset()
                } else setFormError(applyActionError(form, result.error))
              })
            })}
          >
            <FormAlert message={formError} />
            <FormField
              control={form.control}
              name="authorName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Name")}</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="authorRole"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("Who they are")}</FormLabel>
                  <FormControl>
                    <Input placeholder={t("e.g. Parent of a Grade 10 student")} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="quote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t("What they said")}</FormLabel>
                  <FormControl>
                    <Textarea rows={4} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="sortOrder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("Order")}</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} {...field} value={String(field.value ?? 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="isPublished"
                render={({ field }) => (
                  <FormItem className="flex items-end gap-2 pb-2">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={(v) => field.onChange(v === true)} />
                    </FormControl>
                    <FormLabel className="font-normal">{t("Publish on the website")}</FormLabel>
                  </FormItem>
                )}
              />
            </div>
            <SubmitButton pending={isPending}>{t("Save")}</SubmitButton>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
