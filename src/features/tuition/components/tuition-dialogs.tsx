"use client"

import { BanIcon, BanknoteIcon, PencilIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { ActionDialog } from "@/components/shared/action-dialog"
import { Field, OptionSelect, type Option } from "@/components/shared/option-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PAYMENT_METHOD_LABELS, PAYMENT_SCHEDULE_LABELS } from "@/config/labels"
import {
  assignTuitionAction,
  cancelTuitionAction,
  createInvoiceAction,
  recordPaymentAction,
  saveDiscountRuleAction,
  savePlanAction,
  voidInvoiceAction,
  voidPaymentAction,
} from "@/features/tuition/actions"
import { PAYMENT_METHOD_VALUES, PAYMENT_SCHEDULES } from "@/features/tuition/schemas"
import type { ActionResult } from "@/lib/action-result"
import { formatVnd } from "@/lib/money"
import { useT } from "@/i18n/client"

const today = () => new Date().toISOString().slice(0, 10)

// ---------------------------------------------------------------------------
// Plans and discount rules
// ---------------------------------------------------------------------------

type PlanValues = {
  planId?: string
  code: string
  name: string
  courseId: string
  amount: string
  durationMonths: string
  paymentSchedule: string
  isActive: boolean
  notes: string
}

export function PlanDialog({ courses, initial }: { courses: Option[]; initial?: PlanValues }) {
  const t = useT()
  const empty: PlanValues = {
    code: "",
    name: "",
    courseId: "",
    amount: "",
    durationMonths: "",
    paymentSchedule: "monthly",
    isActive: true,
    notes: "",
  }
  const [v, setV] = useState<PlanValues>(initial ?? empty)
  const set = <K extends keyof PlanValues>(key: K) => (value: PlanValues[K]) => setV((c) => ({ ...c, [key]: value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={t("Edit {name}", { name: initial.name })}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden /> {t("New plan")}
          </Button>
        )
      }
      title={initial ? t("Edit tuition plan") : t("New tuition plan")}
      description={t("Changing a plan does not change tuition already assigned (amounts are snapshotted).")}
      submitLabel={t("Save plan")}
      successMessage={t("Plan saved.")}
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => savePlanAction(v)}
    >
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <Field id="plan-code" label={t("Code")}>
          <Input id="plan-code" value={v.code} onChange={(e) => set("code")(e.target.value)} placeholder={t("PET-10T")} />
        </Field>
        <Field id="plan-name" label={t("Name")}>
          <Input id="plan-name" value={v.name} onChange={(e) => set("name")(e.target.value)} />
        </Field>
      </div>
      <Field id="plan-course" label={t("Course")}>
        <OptionSelect id="plan-course" value={v.courseId} onChange={set("courseId")} options={courses} placeholder={t("Choose a course")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="plan-amount" label={t("Amount (₫)")}>
          <Input id="plan-amount" inputMode="numeric" value={v.amount} onChange={(e) => set("amount")(e.target.value)} placeholder="12.600.000" />
        </Field>
        <Field id="plan-months" label={t("Duration (months)")}>
          <Input id="plan-months" inputMode="numeric" value={v.durationMonths} onChange={(e) => set("durationMonths")(e.target.value)} />
        </Field>
        <Field id="plan-schedule" label={t("Payment schedule")}>
          <OptionSelect
            id="plan-schedule"
            value={v.paymentSchedule}
            onChange={set("paymentSchedule")}
            options={PAYMENT_SCHEDULES.map((s) => ({ id: s, label: PAYMENT_SCHEDULE_LABELS[s] }))}
            placeholder={t("Schedule")}
          />
        </Field>
      </div>
      <Field id="plan-notes" label={t("Notes")}>
        <Textarea id="plan-notes" rows={2} value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="plan-active" checked={v.isActive} onCheckedChange={(checked) => set("isActive")(checked === true)} />
        <Label htmlFor="plan-active" className="font-normal">
          {t("Available for new assignments")}
        </Label>
      </div>
    </ActionDialog>
  )
}

type RuleValues = { ruleId?: string; planId: string; name: string; kind: string; value: string; isActive: boolean }
const ANY_PLAN = "__any"

export function DiscountRuleDialog({ plans, initial }: { plans: Option[]; initial?: RuleValues }) {
  const t = useT()
  const empty: RuleValues = { planId: "", name: "", kind: "percent", value: "", isActive: true }
  const [v, setV] = useState<RuleValues>(initial ?? empty)
  const set = <K extends keyof RuleValues>(key: K) => (value: RuleValues[K]) => setV((c) => ({ ...c, [key]: value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={t("Edit {name}", { name: initial.name })}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> {t("New discount rule")}
          </Button>
        )
      }
      title={initial ? t("Edit discount rule") : t("New discount rule")}
      description={t("Staff choose which rules apply when assigning tuition. Discounts never exceed the plan price.")}
      submitLabel={t("Save rule")}
      successMessage={t("Discount rule saved.")}
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => saveDiscountRuleAction({ ...v, planId: v.planId === ANY_PLAN ? "" : v.planId })}
    >
      <Field id="rule-name" label={t("Name")}>
        <Input id="rule-name" value={v.name} onChange={(e) => set("name")(e.target.value)} placeholder={t("Sibling discount – 10%")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rule-kind" label={t("Type")}>
          <OptionSelect
            id="rule-kind"
            value={v.kind}
            onChange={set("kind")}
            options={[
              { id: "percent", label: "Percentage of plan price" },
              { id: "fixed", label: "Fixed amount (₫)" },
            ]}
            placeholder={t("Type")}
          />
        </Field>
        <Field id="rule-value" label={v.kind === "percent" ? t("Percent") : t("Amount (₫)")}>
          <Input id="rule-value" inputMode="decimal" value={v.value} onChange={(e) => set("value")(e.target.value)} />
        </Field>
      </div>
      <Field id="rule-plan" label={t("Applies to")}>
        <OptionSelect
          id="rule-plan"
          value={v.planId || ANY_PLAN}
          onChange={set("planId")}
          options={[{ id: ANY_PLAN, label: "Any plan" }, ...plans]}
          placeholder={t("Any plan")}
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="rule-active" checked={v.isActive} onCheckedChange={(checked) => set("isActive")(checked === true)} />
        <Label htmlFor="rule-active" className="font-normal">
          {t("Active")}
        </Label>
      </div>
    </ActionDialog>
  )
}

// ---------------------------------------------------------------------------
// Assigning tuition
// ---------------------------------------------------------------------------

type PlanOption = { id: string; label: string; amount: number }
type RuleOption = { id: string; label: string; planId: string | null; kind: "percent" | "fixed"; value: number }

export function AssignTuitionDialog({
  students,
  plans,
  rules,
  fixedStudentId,
}: {
  students: Option[]
  plans: PlanOption[]
  rules: RuleOption[]
  fixedStudentId?: string
}) {
  const t = useT()
  const [studentId, setStudentId] = useState(fixedStudentId ?? "")
  const [planId, setPlanId] = useState("")
  const [firstDueDate, setFirstDueDate] = useState(today())
  const [ruleIds, setRuleIds] = useState<string[]>([])
  const [manualDiscount, setManualDiscount] = useState("")
  const [manualDiscountLabel, setManualDiscountLabel] = useState("")

  const plan = plans.find((p) => p.id === planId)
  const usableRules = rules.filter((r) => !r.planId || r.planId === planId)
  // Preview only; the database computes the authoritative amounts.
  const manual = Number(manualDiscount.replace(/[^\d]/g, "")) || 0
  const discount = plan
    ? Math.min(
        plan.amount,
        usableRules
          .filter((r) => ruleIds.includes(r.id))
          .reduce((sum, r) => sum + (r.kind === "percent" ? Math.round((plan.amount * r.value) / 100) : r.value), 0) + manual
      )
    : 0

  return (
    <ActionDialog
      trigger={
        <Button size={fixedStudentId ? "sm" : "default"} variant={fixedStudentId ? "outline" : "default"}>
          <PlusIcon aria-hidden /> {t("Assign tuition")}
        </Button>
      }
      title={t("Assign tuition")}
      description={t("Creates the student's tuition and its installment invoices in one step.")}
      submitLabel={t("Assign")}
      successMessage={t("Tuition assigned and invoices issued.")}
      onOpen={() => {
        setStudentId(fixedStudentId ?? "")
        setPlanId("")
        setFirstDueDate(today())
        setRuleIds([])
        setManualDiscount("")
        setManualDiscountLabel("")
      }}
      onSubmit={() =>
        assignTuitionAction({
          studentId,
          planId,
          firstDueDate,
          discountRuleIds: ruleIds.filter((id) => usableRules.some((r) => r.id === id)),
          manualDiscount: manualDiscount || "0",
          manualDiscountLabel,
        })
      }
    >
      {!fixedStudentId && (
        <Field id="assign-student" label={t("Student")}>
          <OptionSelect id="assign-student" value={studentId} onChange={setStudentId} options={students} placeholder={t("Choose a student")} />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field id="assign-plan" label={t("Plan")}>
          <OptionSelect id="assign-plan" value={planId} onChange={setPlanId} options={plans} placeholder={t("Choose a plan")} />
        </Field>
        <Field id="assign-due" label={t("First due date")}>
          <Input id="assign-due" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
        </Field>
      </div>
      {usableRules.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">{t("Discounts")}</legend>
          {usableRules.map((rule) => (
            <div key={rule.id} className="flex items-center gap-2">
              <Checkbox
                id={`rule-${rule.id}`}
                checked={ruleIds.includes(rule.id)}
                onCheckedChange={(checked) =>
                  setRuleIds((ids) => (checked === true ? [...ids, rule.id] : ids.filter((id) => id !== rule.id)))
                }
              />
              <Label htmlFor={`rule-${rule.id}`} className="font-normal">
                {rule.label}
              </Label>
            </div>
          ))}
        </fieldset>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="assign-manual" label={t("Extra discount (₫)")}>
          <Input id="assign-manual" inputMode="numeric" value={manualDiscount} onChange={(e) => setManualDiscount(e.target.value)} placeholder="0" />
        </Field>
        <Field id="assign-manual-label" label={t("Reason for extra discount")}>
          <Input id="assign-manual-label" value={manualDiscountLabel} onChange={(e) => setManualDiscountLabel(e.target.value)} />
        </Field>
      </div>
      {plan && (
        <dl className="bg-muted grid grid-cols-3 gap-2 rounded-md p-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">{t("Original")}</dt>
            <dd>{formatVnd(plan.amount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("Discount")}</dt>
            <dd>{formatVnd(discount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">{t("Final")}</dt>
            <dd className="font-semibold">{formatVnd(plan.amount - discount)}</dd>
          </div>
        </dl>
      )}
    </ActionDialog>
  )
}

// ---------------------------------------------------------------------------
// Invoices and payments
// ---------------------------------------------------------------------------

export function CreateInvoiceDialog({ students }: { students: Option[] }) {
  const t = useT()
  const [studentId, setStudentId] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [dueDate, setDueDate] = useState(today())

  return (
    <ActionDialog
      trigger={
        <Button variant="outline">
          <PlusIcon aria-hidden /> {t("Other charge")}
        </Button>
      }
      title={t("Invoice another charge")}
      description={t("For charges outside a tuition plan, e.g. textbooks or exam fees.")}
      submitLabel={t("Create invoice")}
      successMessage={t("Invoice created.")}
      onOpen={() => {
        setStudentId("")
        setDescription("")
        setAmount("")
        setDueDate(today())
      }}
      onSubmit={() => createInvoiceAction({ studentId, description, amount, dueDate })}
    >
      <Field id="invoice-student" label={t("Student")}>
        <OptionSelect id="invoice-student" value={studentId} onChange={setStudentId} options={students} placeholder={t("Choose a student")} />
      </Field>
      <Field id="invoice-description" label={t("Description")}>
        <Input id="invoice-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("Giáo trình Flyers")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="invoice-amount" label={t("Amount (₫)")}>
          <Input id="invoice-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="invoice-due" label={t("Due date")}>
          <Input id="invoice-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
    </ActionDialog>
  )
}

export function RecordPaymentDialog({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const t = useT()
  const [amount, setAmount] = useState(String(remaining))
  const [paidOn, setPaidOn] = useState(today())
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  return (
    <ActionDialog
      trigger={
        <Button>
          <BanknoteIcon aria-hidden /> {t("Record payment")}
        </Button>
      }
      title={t("Record a payment")}
      description={t("Remaining on this invoice: {vnd}. Partial payments are allowed; over-payment is not.", { vnd: formatVnd(remaining) })}
      submitLabel={t("Record payment")}
      successMessage={t("Payment recorded.")}
      onOpen={() => {
        setAmount(String(remaining))
        setPaidOn(today())
        setMethod("cash")
        setReference("")
        setNotes("")
      }}
      onSubmit={() => recordPaymentAction({ invoiceId, amount, paidOn, method, reference, notes })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payment-amount" label={t("Amount (₫)")}>
          <Input id="payment-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="payment-date" label={t("Date received")}>
          <Input id="payment-date" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payment-method" label={t("Method")}>
          <OptionSelect
            id="payment-method"
            value={method}
            onChange={setMethod}
            options={PAYMENT_METHOD_VALUES.map((m) => ({ id: m, label: PAYMENT_METHOD_LABELS[m] }))}
            placeholder={t("Method")}
          />
        </Field>
        <Field id="payment-reference" label={t("Transaction reference")}>
          <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t("Bank transfer code")} />
        </Field>
      </div>
      <Field id="payment-notes" label={t("Notes")}>
        <Textarea id="payment-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </ActionDialog>
  )
}

/** Confirmation that requires a reason (voiding, cancelling). */
export function ReasonDialog({
  trigger,
  title,
  description,
  submitLabel,
  successMessage,
  action,
}: {
  trigger: React.ReactNode
  title: string
  description: string
  submitLabel: string
  successMessage: string
  action: (reason: string) => Promise<ActionResult<unknown>>
}) {
  const t = useT()
  const [reason, setReason] = useState("")
  return (
    <ActionDialog
      trigger={trigger}
      title={title}
      description={description}
      submitLabel={t(submitLabel)}
      successMessage={t(successMessage)}
      onOpen={() => setReason("")}
      onSubmit={() => action(reason)}
    >
      <Field id="reason" label={t("Reason (kept in the record)")}>
        <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  )
}

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  const t = useT()
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline">
          <BanIcon aria-hidden /> {t("Void invoice")}
        </Button>
      }
      title={t("Void this invoice?")}
      description={t("Only invoices without payments can be voided. The invoice stays on record, marked void.")}
      submitLabel={t("Void invoice")}
      successMessage={t("Invoice voided.")}
      action={(reason) => voidInvoiceAction({ invoiceId, reason })}
    />
  )
}

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  const t = useT()
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm">
          {t("Void")}
        </Button>
      }
      title={t("Void this payment?")}
      description={t("Use this for mistakes or bounced transfers. The payment stays on record, marked void, and the balance is restored.")}
      submitLabel={t("Void payment")}
      successMessage={t("Payment voided.")}
      action={(reason) => voidPaymentAction({ paymentId, reason })}
    />
  )
}

export function CancelTuitionButton({ tuitionId }: { tuitionId: string }) {
  const t = useT()
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm">
          {t("Cancel tuition")}
        </Button>
      }
      title={t("Cancel this tuition?")}
      description={t("Unpaid invoices are voided; invoices with payments are kept.")}
      submitLabel={t("Cancel tuition")}
      successMessage={t("Tuition cancelled.")}
      action={(reason) => cancelTuitionAction({ tuitionId, reason })}
    />
  )
}
