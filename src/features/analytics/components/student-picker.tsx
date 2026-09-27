"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { analyticsStudentPath } from "@/config/routes"
import { useT } from "@/i18n/client"

/** Find a student (among those the viewer may see) and open their progress. */
export function StudentPicker({ students }: { students: { id: string; full_name: string; student_code: string }[] }) {
  const t = useT()
  const router = useRouter()
  const [q, setQ] = useState("")
  const term = q.trim().toLowerCase()
  const matches = term ? students.filter((s) => `${s.full_name} ${s.student_code}`.toLowerCase().includes(term)).slice(0, 8) : []
  return (
    <div className="grid gap-2">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Type a name or student code")} aria-label={t("Find a student")} />
      {matches.length > 0 && (
        <ul className="grid gap-1">
          {matches.map((s) => (
            <li key={s.id}>
              <Button variant="ghost" className="h-auto w-full justify-between py-1.5" onClick={() => router.push(analyticsStudentPath(s.id))}>
                <span>{s.full_name}</span>
                <span className="text-muted-foreground font-mono text-xs">{s.student_code}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {term && matches.length === 0 && <p className="text-muted-foreground text-sm">{t("No student found.")}</p>}
    </div>
  )
}
