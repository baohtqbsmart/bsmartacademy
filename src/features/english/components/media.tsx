"use client"

import { Loader2Icon, MicIcon, SquareIcon, UploadIcon, Volume2Icon } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { setLessonMediaAction, setWordMediaAction } from "@/features/english/actions"
import { BUCKETS } from "@/lib/storage"
import { createClient } from "@/lib/supabase/client"
import { checkFile, fileExtension } from "@/lib/uploads"

/**
 * Plays a word: its uploaded recording when there is one, otherwise the
 * browser's own English voice (speechSynthesis).
 */
export function SpeakButton({ text, audioUrl, label = "Listen", size = "sm" }: { text: string; audioUrl?: string | null; label?: string; size?: "sm" | "icon" }) {
  function play() {
    if (audioUrl) {
      void new Audio(audioUrl).play()
      return
    }
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      toast.error("This browser cannot read words aloud.")
      return
    }
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = "en-GB"
    utterance.rate = 0.9
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }
  return (
    <Button type="button" variant="outline" size={size} onClick={play} aria-label={size === "icon" ? `${label}: ${text}` : undefined}>
      <Volume2Icon aria-hidden />
      {size !== "icon" && label}
    </Button>
  )
}

/** Uploads a file to Storage under `folder` with a random name; returns its path. */
export async function uploadFile(folder: string, file: File) {
  const check = checkFile(file)
  if (!check.ok) throw new Error(check.message)
  const objectPath = `${folder}/${crypto.randomUUID()}.${fileExtension(file.name)}`
  const { error } = await createClient().storage.from(BUCKETS.assignmentFiles).upload(objectPath, file, { contentType: check.mimeType, upsert: false })
  if (error) throw new Error(`"${file.name}" could not be uploaded. Please try again.`)
  return objectPath
}

/** Records audio in the browser (MediaRecorder). The recording stays local until the caller uploads it. */
export function AudioRecorder({ onRecorded, maxSeconds = 120 }: { onRecorded: (file: File, url: string) => void; maxSeconds?: number }) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const timer = useRef<ReturnType<typeof setInterval>>(undefined)

  useEffect(() => () => clearInterval(timer.current), [])

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("This browser cannot record audio. Upload a recording instead.")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const chunks: Blob[] = []
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4"
      const r = new MediaRecorder(stream, { mimeType: mime })
      r.ondataavailable = (e) => chunks.push(e.data)
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunks, { type: mime })
        const file = new File([blob], `recording.${mime === "audio/webm" ? "webm" : "m4a"}`, { type: mime })
        onRecorded(file, URL.createObjectURL(blob))
      }
      recorder.current = r
      r.start()
      setRecording(true)
      setSeconds(0)
      timer.current = setInterval(() => {
        setSeconds((s) => {
          if (s + 1 >= maxSeconds) stop()
          return s + 1
        })
      }, 1000)
    } catch {
      toast.error("Microphone access was refused.")
    }
  }

  function stop() {
    clearInterval(timer.current)
    if (recorder.current?.state === "recording") recorder.current.stop()
    setRecording(false)
  }

  return recording ? (
    <Button type="button" variant="destructive" size="sm" onClick={stop}>
      <SquareIcon aria-hidden /> Stop · {seconds}s
    </Button>
  ) : (
    <Button type="button" variant="outline" size="sm" onClick={start}>
      <MicIcon aria-hidden /> Record
    </Button>
  )
}

type MediaTarget = { kind: "word"; wordId: string; field: "audio" | "image" } | { kind: "lesson"; lessonId: string }

/** Uploads word audio / pictures and lesson media (content editors). */
export function ContentMediaUpload({ target, accept, label }: { target: MediaTarget; accept: string; label: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function handle(file: File) {
    startTransition(async () => {
      try {
        const objectPath = await uploadFile("english-content", file)
        const result =
          target.kind === "word"
            ? await setWordMediaAction({ wordId: target.wordId, field: target.field, objectPath, fileName: file.name })
            : await setLessonMediaAction({ lessonId: target.lessonId, objectPath, fileName: file.name })
        if (result.ok) toast.success("Uploaded.")
        else toast.error(result.error.message)
      } catch (error) {
        toast.error((error as Error).message)
      }
    })
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ""
          if (file) handle(file)
        }}
      />
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => input.current?.click()}>
        {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <UploadIcon aria-hidden />} {label}
      </Button>
    </>
  )
}
