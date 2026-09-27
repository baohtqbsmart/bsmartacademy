"use client"

import { PencilIcon, PlusIcon, UserPlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect, type Option } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CLASS_MEMBER_ROLE_LABELS } from "@/config/labels"
import { assignTeacherAction, saveSlotAction } from "@/features/classes/actions"
import { WEEKDAYS } from "@/lib/dates"
import type { Enums } from "@/types/database"

type Role = Enums<"class_member_role">

export function AssignTeacherDialog({
  classId,
  teachers,
  hasLead,
}: {
  classId: string
  teachers: Option[]
  hasLead: boolean
}) {
  const initialRole: Role = hasLead ? "assistant_teacher" : "lead_teacher"
  const [teacherId, setTeacherId] = useState("")
  const [role, setRole] = useState<Role>(initialRole)

  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <UserPlusIcon aria-hidden /> Assign teacher
        </Button>
      }
      title="Assign a teacher"
      description="Making someone lead turns the current lead into an assistant. Timetable clashes are rejected."
      submitLabel="Assign"
      successMessage="Teacher assigned."
      onOpen={() => {
        setTeacherId("")
        setRole(initialRole)
      }}
      onSubmit={() => assignTeacherAction({ classId, teacherId, role })}
    >
      <Field id="assign-teacher" label="Teacher">
        <OptionSelect id="assign-teacher" value={teacherId} onChange={setTeacherId} options={teachers} placeholder="Choose a teacher" />
      </Field>
      <Field id="assign-role" label="Role">
        <OptionSelect
          id="assign-role"
          value={role}
          onChange={(value) => setRole(value as Role)}
          options={(Object.keys(CLASS_MEMBER_ROLE_LABELS) as Role[]).map((r) => ({ id: r, label: CLASS_MEMBER_ROLE_LABELS[r] }))}
          placeholder="Role"
        />
      </Field>
    </ActionDialog>
  )
}

/** Role change for an assigned teacher (reuses the assignment RPC). */
export function ChangeRoleButton({ classId, teacherId, role }: { classId: string; teacherId: string; role: Role }) {
  const next: Role = role === "lead_teacher" ? "assistant_teacher" : "lead_teacher"
  return (
    <ActionDialog
      trigger={
        <Button variant="ghost" size="sm">
          Make {CLASS_MEMBER_ROLE_LABELS[next].toLowerCase()}
        </Button>
      }
      title={`Make ${CLASS_MEMBER_ROLE_LABELS[next].toLowerCase()}?`}
      description={next === "lead_teacher" ? "The current lead becomes an assistant." : "The class will have no lead until one is assigned."}
      submitLabel="Confirm"
      successMessage="Role updated."
      onSubmit={() => assignTeacherAction({ classId, teacherId, role: next })}
    >
      {null}
    </ActionDialog>
  )
}

type SlotValues = { slotId?: string; weekday: string; startsAt: string; endsAt: string; room: string }

export function SlotDialog({ classId, initial }: { classId: string; initial?: SlotValues }) {
  const empty: SlotValues = { weekday: "", startsAt: "", endsAt: "", room: "" }
  const [values, setValues] = useState<SlotValues>(initial ?? empty)
  const set = (key: keyof SlotValues) => (value: string) => setValues((current) => ({ ...current, [key]: value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label="Edit time slot">
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> Add time slot
          </Button>
        )
      }
      title={initial ? "Edit time slot" : "Add a weekly time slot"}
      description="Rooms and teachers cannot be double-booked; clashes are rejected with the conflicting class."
      submitLabel="Save"
      successMessage="Timetable updated."
      onOpen={() => setValues(initial ?? empty)}
      onSubmit={() => saveSlotAction({ ...values, classId })}
    >
      <Field id="slot-day" label="Day">
        <OptionSelect
          id="slot-day"
          value={values.weekday}
          onChange={set("weekday")}
          options={WEEKDAYS.map((d) => ({ id: String(d.value), label: d.label }))}
          placeholder="Choose a day"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="slot-start" label="Starts">
          <Input id="slot-start" type="time" value={values.startsAt} onChange={(e) => set("startsAt")(e.target.value)} />
        </Field>
        <Field id="slot-end" label="Ends">
          <Input id="slot-end" type="time" value={values.endsAt} onChange={(e) => set("endsAt")(e.target.value)} />
        </Field>
        <Field id="slot-room" label="Room (optional)">
          <Input id="slot-room" value={values.room} onChange={(e) => set("room")(e.target.value)} placeholder="Class room" />
        </Field>
      </div>
    </ActionDialog>
  )
}
