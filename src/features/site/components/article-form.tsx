"use client"

import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import type { z } from "zod"

import { SubjectArt } from "@/components/brand/subject-art"
import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { adminArticlePath } from "@/config/routes"
import { saveArticleAction } from "@/features/site/actions"
import { SiteImageField } from "@/features/site/components/site-image-field"
import { articleSchema } from "@/features/site/schemas"
import { useT } from "@/i18n/client"
import { applyActionError, type ActionResult } from "@/lib/action-result"
import { slugify } from "@/lib/slug"

type Values = z.input<typeof articleSchema>

export function ArticleForm({ defaultValues }: { defaultValues: Values }) {
  const t = useT()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values, unknown, z.output<typeof articleSchema>>({ resolver: zodResolver(articleSchema), defaultValues })
  const cover = useWatch({ control: form.control, name: "coverImagePath" }) ?? null

  function submit(values: z.output<typeof articleSchema>) {
    setFormError(null)
    startTransition(async () => {
      const result = await saveArticleAction(values)
      if (!result.ok) return void setFormError(applyActionError(form, result.error))
      toast.success(values.status === "published" ? t("Article published.") : t("Saved as a draft."))
      form.reset(values)
      if (!values.id) router.push(adminArticlePath(result.data))
    })
  }

  // The cover is chosen before saving; it is stored with the article.
  const setCover = async (path: string | null): Promise<ActionResult<unknown>> => {
    form.setValue("coverImagePath", path, { shouldDirty: true })
    return { ok: true, data: null }
  }

  return (
    <Form {...form}>
      <form noValidate onSubmit={form.handleSubmit(submit)} className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="grid content-start gap-4">
          <FormAlert message={formError} />
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Title")}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    onBlur={() => {
                      field.onBlur()
                      if (!form.getValues("slug")) form.setValue("slug", slugify(field.value), { shouldDirty: true })
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Web address")}</FormLabel>
                <div className="flex gap-2">
                  <span className="text-muted-foreground bg-muted flex items-center rounded-md border px-2 text-sm">/articles/</span>
                  <FormControl>
                    <Input placeholder="5-tips-to-learn-vocabulary" {...field} />
                  </FormControl>
                  <Button type="button" variant="outline" onClick={() => form.setValue("slug", slugify(form.getValues("title")), { shouldDirty: true })}>
                    {t("From the title")}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="excerpt"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Short summary")}</FormLabel>
                <FormControl>
                  <Textarea rows={2} maxLength={500} {...field} />
                </FormControl>
                <FormDescription>{t("Shown on cards and when the article is shared.")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="body"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Content")}</FormLabel>
                <FormControl>
                  <Textarea rows={18} {...field} />
                </FormControl>
                <FormDescription>{t("Leave a blank line between paragraphs. Start a line with ## for a heading, or - for a list item.")}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid content-start gap-4">
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t("Cover picture")}</span>
            <SiteImageField folder="articles" path={cover} onSave={setCover} fallback={<SubjectArt icon="book" className="size-full" />} />
          </div>
          <FormField
            control={form.control}
            name="status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("Status")}</FormLabel>
                <div className="grid gap-2">
                  {(["draft", "published"] as const).map((status) => (
                    <label key={status} className="flex cursor-pointer items-center gap-2 rounded-lg border p-3 text-sm">
                      <input type="radio" className="accent-primary" checked={field.value === status} onChange={() => field.onChange(status)} />
                      {status === "draft" ? t("Draft (only administrators see it)") : t("Published on the website")}
                    </label>
                  ))}
                </div>
              </FormItem>
            )}
          />
          <SubmitButton pending={isPending} disabled={!form.formState.isDirty}>
            {t("Save")}
          </SubmitButton>
        </div>
      </form>
    </Form>
  )
}
