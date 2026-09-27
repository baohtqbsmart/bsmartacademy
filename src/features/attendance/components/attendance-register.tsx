"use client"

import { CheckCheckIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { FormAlert } from "@/components/shared/form-alert"
import { SubmitButton } from "@/components/shared/submit-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { saveAttendanceAction } from "@/features/attendance/actions"
import { AbsenceAlertBadge, ATTENDANCE_STATUS } from "@/features/attendance/components/attendance-badges"
import { ATTENDANCE_STATUSES, type AlertLevel, type AttendanceStatus } from "@/features/attendance/summary"
import { cn } from "@/lib/utils"
import type { Enums } from "@/types/database"
import { useT } from "@/i18n/client"

type Mode = "in_person" | "online"

export type RegisterRow = {
  student: { id: string; full_name: string; student_code: string }
  record: {
    status: AttendanceStatus
    attended_via: Enums<"delivery_mode"> | null
    minutes_late: number | null
    note: string | null
  } | null
  alert?: { level: AlertLevel; text: string } | null
}

type Mark = { status: AttendanceStatus | null; online: boolean; minutesLate: string; note: string }

type AttendanceRegisterProps = {
  classId: string
  date: string
  deliveryMode: Enums<"delivery_mode">
  rows: RegisterRow[]
  sessionNotes: string
  /** Online session day: students attended online unless unticked. */
  defaultOnline?: boolean
}

const ATTENDED = new Set<AttendanceStatus>(["present", "late"])

function initialMarks(rows: RegisterRow[], deliveryMode: Enums<"delivery_mode">, defaultOnline: boolean) {
  return Object.fromEntries(
    rows.map(({ student, record }) => [
      student.id,
      {
        status: record?.status ?? null,
        online: record ? record.attended_via === "online" : deliveryMode === "online" || defaultOnline,
        minutesLate: record?.minutes_late ? String(record.minutes_late) : "",
        note: record?.note ?? "",
      } satisfies Mark,
    ])
  )
}

/**
 * The class register: one row per enrolled student with Present / Late /
 * Absent / Excused, minutes late, online (hybrid classes) and a note.
 */
export function AttendanceRegister({ classId, date, deliveryMode, rows, sessionNotes, defaultOnline = false }: AttendanceRegisterProps) {
  const t = useT()
  const [marks, setMarks] = useState<Record<string, Mark>>(() => initialMarks(rows, deliveryMode, defaultOnline))
  const [notes, setNotes] = useState(sessionNotes)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const update = (studentId: string, change: Partial<Mark>) =>
    setMarks((current) => ({ ...current, [studentId]: { ...current[studentId], ...change } }))

  const unmarked = rows.filter(({ student }) => !marks[student.id]?.status).length
  const counts = Object.fromEntries(
    ATTENDANCE_STATUSES.map((s) => [s, rows.filter(({ student }) => marks[student.id]?.status === s).length])
  ) as Record<AttendanceStatus, number>

  function markAllPresent() {
    setMarks((current) =>
      Object.fromEntries(Object.entries(current).map(([id, mark]) => [id, mark.status ? mark : { ...mark, status: "present" }]))
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (unmarked > 0) {
      setError(`${unmarked} student${unmarked === 1 ? " is" : "s are"} not marked yet.`)
      return
    }
    const mode = (online: boolean): Mode | null =>
      deliveryMode === "hybrid" ? (online ? "online" : "in_person") : null
    startTransition(async () => {
      const result = await saveAttendanceAction({
        classId,
        date,
        notes,
        entries: rows.map(({ student }) => {
          const mark = marks[student.id]
          return {
            studentId: student.id,
            status: mark.status,
            attendedVia: mark.status && ATTENDED.has(mark.status) ? mode(mark.online) : null,
            minutesLate: mark.status === "late" && mark.minutesLate ? Number(mark.minutesLate) : null,
            note: mark.note,
          }
        }),
      })
      if (result.ok) toast.success(t("Attendance saved."))
      else setError(result.error.message)
    })
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
          {t("{present} present · {late} late · {absent} absent · {excused} excused", { present: counts.present, late: counts.late, absent: counts.absent, excused: counts.excused })}
          {unmarked > 0 && t(" · {unmarked} not marked", { unmarked })}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={markAllPresent} disabled={unmarked === 0}>
          <CheckCheckIcon aria-hidden /> {t("Mark the rest present")}
        </Button>
      </div>

      <ul className="grid gap-2">
        {rows.map(({ student, alert }) => {
          const mark = marks[student.id]
          const groupId = `status-${student.id}`
          return (
            <li key={student.id}>
              <Card className="gap-0 py-3">
                <CardContent className="grid gap-3 px-4 lg:grid-cols-[minmax(12rem,1fr)_auto_minmax(12rem,1fr)] lg:items-center">
                  <div className="grid gap-1">
                    <span id={groupId} className="font-medium">
                      {student.full_name}
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground font-mono text-xs">{student.student_code}</span>
                      {alert && <AbsenceAlertBadge level={alert.level} title={alert.text} />}
                    </span>
                  </div>

                  <div role="radiogroup" aria-labelledby={groupId} className="flex flex-wrap gap-1">
                    {ATTENDANCE_STATUSES.map((status) => {
                      const config = ATTENDANCE_STATUS[status]
                      const Icon = config.icon
                      const selected = mark.status === status
                      return (
                        <Button
                          key={status}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          variant="outline"
                          size="sm"
                          className={cn(selected && config.className, selected && "ring-ring/50 ring-2")}
                          onClick={() => update(student.id, { status })}
                        >
                          <Icon aria-hidden /> {t(config.label)}
                        </Button>
                      )
                    })}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {mark.status === "late" && (
                      <div className="flex items-center gap-1">
                        <Input
                          id={`late-${student.id}`}
                          inputMode="numeric"
                          className="h-8 w-16"
                          value={mark.minutesLate}
                          onChange={(e) => update(student.id, { minutesLate: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                          aria-label={t("Minutes late, {full_name}", { full_name: student.full_name })}
                        />
                        <Label htmlFor={`late-${student.id}`} className="text-muted-foreground text-xs font-normal">
                          {t("min")}
                        </Label>
                      </div>
                    )}
                    {deliveryMode === "hybrid" && mark.status && ATTENDED.has(mark.status) && (
                      <div className="flex items-center gap-1.5">
                        <Checkbox
                          id={`online-${student.id}`}
                          checked={mark.online}
                          onCheckedChange={(checked) => update(student.id, { online: checked === true })}
                        />
                        <Label htmlFor={`online-${student.id}`} className="text-xs font-normal">
                          {t("Online")}
                        </Label>
                      </div>
                    )}
                    <Input
                      className="h-8 min-w-40 flex-1"
                      placeholder={t("Note (optional)")}
                      maxLength={500}
                      value={mark.note}
                      onChange={(e) => update(student.id, { note: e.target.value })}
                      aria-label={t("Note, {full_name}", { full_name: student.full_name })}
                    />
                  </div>
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>

      <div className="grid gap-2">
        <Label htmlFor="session-notes">{t("Notes for this session")}</Label>
        <Textarea
          id="session-notes"
          rows={2}
          maxLength={1000}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("Topic covered, substitute teacher, room change…")}
        />
      </div>

      <FormAlert message={error} />
      <div>
        <SubmitButton pending={isPending}>{t("Save attendance")}</SubmitButton>
      </div>
    </form>
  )
}
