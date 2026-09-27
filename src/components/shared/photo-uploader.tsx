"use client"

import { Loader2Icon, UploadIcon } from "lucide-react"
import { useRef, useTransition } from "react"
import { toast } from "sonner"

import { UserAvatar } from "@/components/shared/user-avatar"
import { Button } from "@/components/ui/button"
import type { ActionResult } from "@/lib/action-result"
import { IMAGE_RULES, type Bucket } from "@/lib/storage"
import { createClient } from "@/lib/supabase/client"

type PhotoUploaderProps = {
  bucket: Bucket
  objectPath: string
  name: string
  photoUrl: string | null
  /** Server Action that records the uploaded path in the database. */
  onUploaded: () => Promise<ActionResult<unknown>>
  className?: string
}

/**
 * Uploads straight from the browser to Supabase Storage (bucket RLS decides
 * who may write where), then lets a Server Action record the object path.
 */
export function PhotoUploader({ bucket, objectPath, name, photoUrl, onUploaded, className }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function handleFile(file: File) {
    if (!(IMAGE_RULES.mimeTypes as readonly string[]).includes(file.type)) {
      toast.error("Please choose a PNG, JPEG or WebP image.")
      return
    }
    if (file.size > IMAGE_RULES.maxBytes) {
      toast.error("Images must be 2 MB or smaller.")
      return
    }

    startTransition(async () => {
      const { error } = await createClient()
        .storage.from(bucket)
        .upload(objectPath, file, { upsert: true, contentType: file.type })
      if (error) {
        toast.error("Upload failed. Please try again.")
        return
      }
      const result = await onUploaded()
      if (result.ok) toast.success("Photo updated.")
      else toast.error(result.error.message)
    })
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={name} avatarUrl={photoUrl} className={className ?? "size-16 text-lg"} />
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_RULES.mimeTypes.join(",")}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ""
          if (file) handleFile(file)
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => inputRef.current?.click()}>
        {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <UploadIcon aria-hidden />}
        Change photo
      </Button>
    </div>
  )
}
