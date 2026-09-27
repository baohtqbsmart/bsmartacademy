"use client"

import { ArrowRightLeftIcon, PlusIcon } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect, type Option } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ENROLLMENT_STATUS } from "@/config/labels"
import {
  enrollStudentAction,
  setEnrollmentStatusAction,
  transferEnrollmentAction,
} from "@/features/enrollments/actions"
import type { Enums } from "@/types/database"
import { useT } from "@/i18n/client"

type EnrollDialogProps =
  /** From a student profile: the student is fixed, pick a class. */
  | { studentId: string; classes: Option[]; classId?: never; students?: never }
  /** From a class roster: the class is fixed, pick a student. */
  | { classId: string; students: Option[]; studentId?: never; classes?: never }

export function EnrollDialog(props: EnrollDialogProps) {
  const t = useT()
  const today = new Date().toISOString().slice(0, 10)
  const [picked, setPicked] = useState("")
  const [status, setStatus] = useState<"pending" | "active">("active")
  const [startOn, setStartOn] = useState(today)
  const fromClass = props.classId !== undefined

  return (
    <ActionDialog
      trigger={
        <Button variant="outline" size="sm">
          <PlusIcon aria-hidden /> {fromClass ? t("Add student") : t("Enrol in class")}
        </Button>
      }
      title={fromClass ? t("Add a student to this class") : t("Enrol in a class")}
      description={
        fromClass
          ? t("Students already in the class are not listed. Class capacity is enforced.")
          : t("Only planned and running classes are listed. Class capacity is enforced.")
      }
      submitLabel={fromClass ? t("Add student") : t("Enrol")}
      successMessage={t("Student enrolled.")}
      onOpen={() => {
        setPicked("")
        setStatus("active")
        setStartOn(today)
      }}
      onSubmit={() =>
        enrollStudentAction({
          studentId: fromClass ? picked : props.studentId,
          classId: fromClass ? props.classId : picked,
          status,
          startOn,
        })
      }
    >
      <Field id="enrol-target" label={fromClass ? t("Student") : t("Class")}>
        <OptionSelect
          id="enrol-target"
          value={picked}
          onChange={setPicked}
          options={fromClass ? props.students : props.classes}
          placeholder={fromClass ? t("Choose a student") : t("Choose a class")}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="enrol-status" label={t("Status")}>
          <OptionSelect
            id="enrol-status"
            value={status}
            onChange={(value) => setStatus(value as "pending" | "active")}
            options={(["active", "pending"] as const).map((s) => ({ id: s, label: ENROLLMENT_STATUS[s].label }))}
            placeholder={t("Status")}
          />
        </Field>
        <Field id="enrol-start" label={t("Start date")}>
          <Input id="enrol-start" type="date" value={startOn} onChange={(event) => setStartOn(event.target.value)} />
        </Field>
      </div>
    </ActionDialog>
  )
}

const ENROLLMENT_STATUSES = Object.keys(ENROLLMENT_STATUS) as Enums<"enrollment_status">[]

/** Status changer (withdrawing = removing from the class) and transfer. */
export function EnrollmentActions({
  enrollmentId,
  status,
  currentClassId,
  classes,
}: {
  enrollmentId: string
  status: Enums<"enrollment_status">
  currentClassId: string | null
  classes: Option[]
}) {
  const t = useT()
  const [isPending, startTransition] = useTransition()
  const [targetClassId, setTargetClassId] = useState("")
  const isCurrent = status === "pending" || status === "active"

  function changeStatus(next: string) {
    if (next === status) return
    startTransition(async () => {
      const result = await setEnrollmentStatusAction({ enrollmentId, status: next })
      if (result.ok) toast.success(t("Enrolment updated."))
      else toast.error(result.error.message)
    })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={status} onValueChange={changeStatus} disabled={isPending}>
        <SelectTrigger size="sm" className="w-32" aria-label={t("Enrolment status")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ENROLLMENT_STATUSES.map((s) => (
            <SelectItem key={s} value={s}>
              {t(ENROLLMENT_STATUS[s].label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isCurrent && (
        <ActionDialog
          trigger={
            <Button variant="ghost" size="sm">
              <ArrowRightLeftIcon aria-hidden /> {t("Transfer")}
            </Button>
          }
          title={t("Move to another class")}
          description={t("The current enrolment is marked withdrawn and a new active enrolment is created, in one step.")}
          submitLabel={t("Transfer")}
          successMessage={t("Student transferred.")}
          onOpen={() => setTargetClassId("")}
          onSubmit={() => transferEnrollmentAction({ enrollmentId, classId: targetClassId })}
        >
          <Field id={`transfer-${enrollmentId}`} label={t("New class")}>
            <OptionSelect
              id={`transfer-${enrollmentId}`}
              value={targetClassId}
              onChange={setTargetClassId}
              options={classes.filter((option) => option.id !== currentClassId)}
              placeholder={t("Choose a class")}
            />
          </Field>
        </ActionDialog>
      )}
    </div>
  )
}
