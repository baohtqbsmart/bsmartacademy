import { DownloadIcon, FileIcon, XIcon } from "lucide-react"

import { ConfirmActionButton } from "@/components/shared/confirm-action-button"
import { removeAttachmentAction, removeSubmissionFileAction } from "@/features/assignments/actions"
import { formatFileSize } from "@/lib/uploads"

type FileRow = { id: string; file_name: string; size_bytes: number; url: string | null }

/** Files with signed download links; removable while the owner may still change them. */
export function FileList({
  files,
  removable,
  empty = "No files.",
}: {
  files: FileRow[]
  /** Which kind of file row these are, when the viewer may remove them. */
  removable?: "attachment" | "submission"
  empty?: string
}) {
  if (files.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>
  return (
    <ul className="grid gap-1">
      {files.map((file) => (
        <li key={file.id} className="flex items-center justify-between gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <FileIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            {file.url ? (
              <a href={file.url} className="truncate hover:underline" download={file.file_name}>
                {file.file_name}
              </a>
            ) : (
              <span className="truncate">{file.file_name}</span>
            )}
            <span className="text-muted-foreground shrink-0 tabular-nums">{formatFileSize(file.size_bytes)}</span>
            {file.url && <DownloadIcon className="text-muted-foreground size-3 shrink-0" aria-hidden />}
          </span>
          {removable && (
            <ConfirmActionButton
              variant="ghost"
              size="icon"
              aria-label={`Remove ${file.file_name}`}
              title="Remove this file?"
              description={`"${file.file_name}" will be deleted.`}
              confirmLabel="Remove"
              successMessage="File removed."
              destructive
              action={
                removable === "attachment"
                  ? removeAttachmentAction.bind(null, { attachmentId: file.id })
                  : removeSubmissionFileAction.bind(null, { fileId: file.id })
              }
            >
              <XIcon />
            </ConfirmActionButton>
          )}
        </li>
      ))}
    </ul>
  )
}
