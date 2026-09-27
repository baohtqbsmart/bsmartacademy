"use client"

import { Loader2Icon, PaperclipIcon } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { recordAttachmentAction, recordSubmissionFileAction } from "@/features/assignments/actions"
import { addFileMaterialAction } from "@/features/online/actions"
import { setQuestionMediaAction } from "@/features/question-bank/actions"
import { recordSpokenAnswerAction } from "@/features/tests/actions"
import { BUCKETS } from "@/lib/storage"
import { createClient } from "@/lib/supabase/client"
import { ACCEPT_ATTRIBUTE, checkFile, describeAcceptedTypes, fileExtension, UPLOAD_RULES } from "@/lib/uploads"

export type UploadTarget =
  | { kind: "submission"; submissionId: string }
  | { kind: "assignment"; assignmentId: string }
  | { kind: "question"; questionId: string }
  | { kind: "spoken"; attemptId: string; questionId: string }
  | { kind: "online"; sessionId: string }

type FileUploaderProps = {
  target: UploadTarget
  remaining: number
  label?: string
  /** Narrower file picker filter (e.g. audio only); the server still decides. */
  accept?: string
}

/**
 * Uploads files straight to Storage under a random name, then asks the server
 * to verify the content and record it. The browser only pre-checks
 * (type/size) for quick feedback; the server and database decide.
 */
export function FileUploader({ target, remaining, label = "Add files", accept = ACCEPT_ATTRIBUTE }: FileUploaderProps) {
  // Storage RLS allows these folders only for the right person.
  const folder = folderOf(target)
  const record = (input: { objectPath: string; fileName: string }) => {
    switch (target.kind) {
      case "submission":
        return recordSubmissionFileAction({ ...input, submissionId: target.submissionId })
      case "assignment":
        return recordAttachmentAction({ ...input, assignmentId: target.assignmentId })
      case "question":
        return setQuestionMediaAction({ ...input, questionId: target.questionId })
      case "spoken":
        return recordSpokenAnswerAction({ ...input, attemptId: target.attemptId, questionId: target.questionId })
      case "online":
        return addFileMaterialAction({ ...input, sessionId: target.sessionId })
    }
  }

  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()
  const [progress, setProgress] = useState<string | null>(null)

  function handleFiles(list: FileList) {
    const files = [...list]
    if (files.length > remaining) {
      toast.error(remaining === 0 ? "No more files can be added." : `You can add ${remaining} more file${remaining === 1 ? "" : "s"}.`)
      return
    }
    const problems = files.map(checkFile).filter((check) => !check.ok)
    if (problems.length > 0) {
      for (const problem of problems) if (!problem.ok) toast.error(problem.message)
      return
    }

    startTransition(async () => {
      const storage = createClient().storage.from(BUCKETS.assignmentFiles)
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1} of ${files.length}…`)
        const check = checkFile(file)
        if (!check.ok) continue
        const objectPath = `${folder}/${crypto.randomUUID()}.${fileExtension(file.name)}`
        const { error } = await storage.upload(objectPath, file, { contentType: check.mimeType, upsert: false })
        if (error) {
          toast.error(`"${file.name}" could not be uploaded. Please try again.`)
          continue
        }
        const result = await record({ objectPath, fileName: file.name })
        if (result.ok) toast.success(`"${file.name}" added.`)
        else toast.error(result.error.message)
      }
      setProgress(null)
    })
  }

  return (
    <div className="grid gap-1">
      <input
        ref={inputRef}
        type="file"
        multiple={remaining > 1}
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const files = event.target.files
          if (files?.length) handleFiles(files)
          event.target.value = ""
        }}
      />
      <div>
        <Button type="button" variant="outline" size="sm" disabled={isPending || remaining === 0} onClick={() => inputRef.current?.click()}>
          {isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : <PaperclipIcon aria-hidden />}
          {progress ?? label}
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {describeAcceptedTypes()}; up to {UPLOAD_RULES.maxBytes / 1024 / 1024} MB each.
      </p>
    </div>
  )
}

function folderOf(target: UploadTarget) {
  switch (target.kind) {
    case "submission":
      return `submissions/${target.submissionId}`
    case "assignment":
      return `assignments/${target.assignmentId}`
    case "question":
      return `questions/${target.questionId}`
    case "spoken":
      return `test-attempts/${target.attemptId}`
    case "online":
      return `online-sessions/${target.sessionId}`
  }
}
