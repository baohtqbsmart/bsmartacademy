"use client"

import { FileIcon, Loader2Icon, SendIcon, UploadIcon, VideoIcon } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { submitAssessmentAction } from "@/features/assessments/actions"
import { countWords, type ResponseMode } from "@/features/assessments/scoring"
import { AudioRecorder, uploadFile } from "@/features/english/components/media"
import { checkFile, formatFileSize } from "@/lib/uploads"
import { useT } from "@/i18n/client"

type SubmitFormProps = {
  taskId: string
  studentId: string
  mode: ResponseMode
  minWords: number | null
  maxWords: number | null
  maxSeconds: number | null
  /** Text of the previous attempt, to start a resubmission from. */
  previousText?: string | null
}

const ACCEPT: Record<ResponseMode, string> = {
  online_text: "",
  document: ".pdf,.docx,.txt",
  online_or_document: ".pdf,.docx,.txt",
  audio: ".mp3,.m4a,.wav,.webm",
  video: ".mp4,.mov",
  audio_or_video: ".mp3,.m4a,.wav,.webm,.mp4,.mov",
}

/** Write online, upload a document, or record / upload audio or video; then hand in. */
export function SubmitForm({ taskId, studentId, mode, minWords, maxWords, maxSeconds, previousText }: SubmitFormProps) {
  const t = useT()
  const [text, setText] = useState(previousText ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)
  const canWrite = mode === "online_text" || mode === "online_or_document"
  const canUpload = mode !== "online_text"
  const spoken = mode === "audio" || mode === "video" || mode === "audio_or_video"
  const words = countWords(text)
  const outOfRange = (minWords !== null && words < minWords) || (maxWords !== null && words > maxWords)
  const ready = (canWrite && words > 0) || file !== null

  function choose(chosen: File, url?: string) {
    const check = checkFile(chosen)
    if (!check.ok) return void toast.error(t(check.message))
    if (preview) URL.revokeObjectURL(preview)
    setFile(chosen)
    setPreview(url ?? (spoken ? URL.createObjectURL(chosen) : null))
  }

  function handIn() {
    setError(null)
    startTransition(async () => {
      try {
        const uploaded = file ? { objectPath: await uploadFile(`assessments/${studentId}`, file), fileName: file.name } : null
        const result = await submitAssessmentAction({ taskId, text: canWrite ? text : "", file: uploaded })
        if (result && !result.ok) setError(result.error.message)
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  return (
    <div className="grid gap-4">
      {canWrite && (
        <div className="grid gap-2">
          <Label htmlFor="answer">{t("Your answer")}</Label>
          <Textarea id="answer" rows={14} maxLength={50000} value={text} onChange={(e) => setText(e.target.value)} className="leading-6" />
          <p className={`text-xs tabular-nums ${outOfRange && words > 0 ? "text-[#b02a2a] dark:text-[#ef7b7b]" : "text-muted-foreground"}`} aria-live="polite">
            {t("{words} words", { words })}
            {minWords !== null && t(" · at least {minWords}", { minWords })}
            {maxWords !== null && t(" · at most {maxWords}", { maxWords })}
          </p>
        </div>
      )}
      {canUpload && (
        <div className="grid gap-2">
          <span className="text-sm font-medium">
            {spoken ? t("Your recording") : mode === "document" ? t("Your document") : t("…or upload a document")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {(mode === "audio" || mode === "audio_or_video") && <AudioRecorder maxSeconds={maxSeconds ?? 300} onRecorded={(f, url) => choose(f, url)} />}
            <input
              ref={input}
              type="file"
              accept={ACCEPT[mode]}
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const chosen = e.target.files?.[0]
                e.target.value = ""
                if (chosen) choose(chosen)
              }}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
              {mode === "video" ? <VideoIcon aria-hidden /> : <UploadIcon aria-hidden />} {t("Upload a file")}
            </Button>
            {maxSeconds && spoken && <span className="text-muted-foreground text-xs">{t("About {value} minute(s).", { value: Math.round(maxSeconds / 60) || 1 })}</span>}
          </div>
          {file && (
            <p className="flex items-center gap-2 text-sm">
              <FileIcon className="size-4" aria-hidden /> {file.name} <span className="text-muted-foreground">{formatFileSize(file.size)}</span>
            </p>
          )}
          {preview && file && (file.type.startsWith("video/") ? <video controls src={preview} className="max-h-64 w-full max-w-md rounded-md" /> : <audio controls src={preview} className="w-full max-w-md" />)}
          <p className="text-muted-foreground text-xs">
            {t("{value}, up to 20 MB. Only you, your parents and your teachers can open it.", { value: spoken ? "Audio (MP3, M4A, WAV, WebM) or video (MP4, MOV)" : "PDF, Word (.docx) or text (.txt)" })}
          </p>
        </div>
      )}
      <FormAlert message={error} />
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="w-fit" disabled={!ready || isPending}>
            {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />} {t("Hand in")}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Hand in your work?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {canWrite && words > 0 && t("{words} words. ", { words })}
              {outOfRange && words > 0 && t("Your answer is outside the word limit. ")}
              {t("You cannot change it afterwards unless your teacher allows a resubmission.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Keep working")}</AlertDialogCancel>
            <AlertDialogAction onClick={handIn}>{t("Hand in")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
