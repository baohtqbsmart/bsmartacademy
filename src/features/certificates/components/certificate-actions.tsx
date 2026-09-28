"use client"

import { AwardIcon, BanIcon, PrinterIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { issueCertificateAction, revokeCertificateAction } from "@/features/certificates/actions"
import { useT } from "@/i18n/client"

export function PrintButton() {
  const t = useT()
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <PrinterIcon aria-hidden /> {t("Print or save as PDF")}
    </Button>
  )
}

export function RevokeCertificateButton({ id }: { id: string }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [isPending, startTransition] = useTransition()
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-destructive">
          <BanIcon aria-hidden /> {t("Revoke")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Revoke this certificate?")}</DialogTitle>
          <DialogDescription>{t("It stays on record marked as revoked, and the verification page will say so.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="revoke-reason">{t("Reason")}</Label>
          <Textarea id="revoke-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={isPending || !reason.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await revokeCertificateAction({ id, reason })
                if (result.ok) {
                  toast.success(t("Certificate revoked."))
                  setOpen(false)
                } else toast.error(result.error.message)
              })
            }
          >
            {t("Revoke")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Issue a certificate to one student of a class, showing their completion. */
export function IssueCertificateButton({
  classId,
  students,
}: {
  classId: string
  students: {
    id: string
    full_name: string
    student_code: string
    percent: number | null
    certified: boolean
  }[]
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [studentId, setStudentId] = useState("")
  const [note, setNote] = useState("")
  const [isPending, startTransition] = useTransition()
  const chosen = students.find((s) => s.id === studentId)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <AwardIcon aria-hidden /> {t("Issue a certificate")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Issue a certificate")}</DialogTitle>
          <DialogDescription>
            {t("The number, names and date are filled in automatically. A certificate can be revoked later but not edited.")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>{t("Student")}</Label>
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger>
                <SelectValue placeholder={t("Choose a student")} />
              </SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id} disabled={s.certified}>
                    {s.full_name} · {s.student_code}
                    {s.percent !== null ? ` · ${s.percent}%` : ""}
                    {s.certified ? ` · ${t("already certified")}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {chosen && chosen.percent !== null && (
              <p className="text-muted-foreground text-xs">
                {t("Learning path completed: {value}%", {
                  value: chosen.percent,
                })}
              </p>
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="certificate-note">{t("Note on the certificate (optional)")}</Label>
            <Textarea id="certificate-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder={t("e.g. With distinction")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={isPending || !studentId}
            onClick={() =>
              startTransition(async () => {
                const result = await issueCertificateAction({
                  classId,
                  studentId,
                  completionPercent: chosen?.percent ?? null,
                  note,
                })
                if (result.ok) {
                  toast.success(t("Certificate issued."))
                  setOpen(false)
                  setStudentId("")
                  setNote("")
                } else toast.error(result.error.message)
              })
            }
          >
            {t("Issue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
