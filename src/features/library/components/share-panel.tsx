"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { classShareAction, studentShareAction, visibilityAction } from "@/features/library/actions"
import { useT } from "@/i18n/client"

type Target = { id: string; name: string; students: { id: string; name: string; code: string }[] }

/**
 * Who receives the material: all teachers (visibility), whole classes, or
 * single students. The database enforces that teachers only reach their own
 * classes and students.
 */
export function SharePanel({
  materialId,
  canManage,
  visibility,
  targets,
  classIds,
  studentIds,
  archived,
}: {
  materialId: string
  canManage: boolean
  visibility: "private" | "staff"
  targets: Target[]
  classIds: string[]
  studentIds: string[]
  archived: boolean
}) {
  const tr = useT()
  const [classes, setClasses] = useState(new Set(classIds))
  const [students, setStudents] = useState(new Set(studentIds))
  const [filter, setFilter] = useState("")
  const [isPending, startTransition] = useTransition()
  const disabled = isPending || archived

  function toggleClass(id: string, on: boolean) {
    startTransition(async () => {
      const result = await classShareAction({ materialId, classId: id, shared: on })
      if (!result.ok) return void toast.error(result.error.message)
      setClasses((s) => {
        const next = new Set(s)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })
    })
  }

  function toggleStudent(id: string, on: boolean) {
    startTransition(async () => {
      const result = await studentShareAction({ materialId, studentId: id, shared: on })
      if (!result.ok) return void toast.error(result.error.message)
      setStudents((s) => {
        const next = new Set(s)
        if (on) next.add(id)
        else next.delete(id)
        return next
      })
    })
  }

  const allStudents = [...new Map(targets.flatMap((t) => t.students.map((s) => [s.id, s] as const))).values()].sort((a, b) => a.name.localeCompare(b.name, "vi"))
  const shownStudents = allStudents.filter((s) => !filter || `${s.name} ${s.code}`.toLowerCase().includes(filter.toLowerCase()))

  return (
    <div className="grid gap-5 text-sm">
      {archived && <p className="text-muted-foreground">{tr("Archived materials cannot be assigned or shared. Restore it first.")}</p>}
      {canManage && (
        <label className="flex items-start gap-2">
          <Checkbox
            checked={visibility === "staff"}
            disabled={disabled}
            onCheckedChange={(v) =>
              startTransition(async () => {
                const result = await visibilityAction({ materialId, visibility: v === true ? "staff" : "private" })
                if (!result.ok) toast.error(result.error.message)
              })
            }
            className="mt-0.5"
          />
          <span>
            {tr("Visible to all teachers")}
            <span className="text-muted-foreground block text-xs">{tr("They can find it and assign it to their own classes. Students still only see it when assigned.")}</span>
          </span>
        </label>
      )}

      <fieldset className="grid gap-2">
        <legend className="mb-1 font-medium">{tr("Assign to classes")}</legend>
        {targets.length === 0 ? (
          <p className="text-muted-foreground text-xs">{tr("You have no planned or active classes.")}</p>
        ) : (
          targets.map((t) => (
            <label key={t.id} className="flex items-center gap-2">
              <Checkbox checked={classes.has(t.id)} disabled={disabled} onCheckedChange={(v) => toggleClass(t.id, v === true)} />
              {t.name}
              <span className="text-muted-foreground text-xs">{tr("({length} students)", { length: t.students.length })}</span>
            </label>
          ))
        )}
      </fieldset>

      {allStudents.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 font-medium">{tr("Share with individual students")}</legend>
          {allStudents.length > 8 && <Input className="h-8" placeholder={tr("Filter students")} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label={tr("Filter students")} />}
          <div className="grid max-h-60 gap-1.5 overflow-y-auto">
            {shownStudents.map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <Checkbox checked={students.has(s.id)} disabled={disabled} onCheckedChange={(v) => toggleStudent(s.id, v === true)} />
                {s.name}
                <span className="text-muted-foreground font-mono text-xs">{s.code}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  )
}
