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
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button>
            <PlusIcon aria-hidden /> New plan
          </Button>
        )
      }
      title={initial ? "Edit tuition plan" : "New tuition plan"}
      description="Changing a plan does not change tuition already assigned (amounts are snapshotted)."
      submitLabel="Save plan"
      successMessage="Plan saved."
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => savePlanAction(v)}
    >
      <div className="grid gap-4 sm:grid-cols-[9rem_1fr]">
        <Field id="plan-code" label="Code">
          <Input id="plan-code" value={v.code} onChange={(e) => set("code")(e.target.value)} placeholder="PET-10T" />
        </Field>
        <Field id="plan-name" label="Name">
          <Input id="plan-name" value={v.name} onChange={(e) => set("name")(e.target.value)} />
        </Field>
      </div>
      <Field id="plan-course" label="Course">
        <OptionSelect id="plan-course" value={v.courseId} onChange={set("courseId")} options={courses} placeholder="Choose a course" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="plan-amount" label="Amount (₫)">
          <Input id="plan-amount" inputMode="numeric" value={v.amount} onChange={(e) => set("amount")(e.target.value)} placeholder="12.600.000" />
        </Field>
        <Field id="plan-months" label="Duration (months)">
          <Input id="plan-months" inputMode="numeric" value={v.durationMonths} onChange={(e) => set("durationMonths")(e.target.value)} />
        </Field>
        <Field id="plan-schedule" label="Payment schedule">
          <OptionSelect
            id="plan-schedule"
            value={v.paymentSchedule}
            onChange={set("paymentSchedule")}
            options={PAYMENT_SCHEDULES.map((s) => ({ id: s, label: PAYMENT_SCHEDULE_LABELS[s] }))}
            placeholder="Schedule"
          />
        </Field>
      </div>
      <Field id="plan-notes" label="Notes">
        <Textarea id="plan-notes" rows={2} value={v.notes} onChange={(e) => set("notes")(e.target.value)} />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="plan-active" checked={v.isActive} onCheckedChange={(checked) => set("isActive")(checked === true)} />
        <Label htmlFor="plan-active" className="font-normal">
          Available for new assignments
        </Label>
      </div>
    </ActionDialog>
  )
}

type RuleValues = { ruleId?: string; planId: string; name: string; kind: string; value: string; isActive: boolean }
const ANY_PLAN = "__any"

export function DiscountRuleDialog({ plans, initial }: { plans: Option[]; initial?: RuleValues }) {
  const empty: RuleValues = { planId: "", name: "", kind: "percent", value: "", isActive: true }
  const [v, setV] = useState<RuleValues>(initial ?? empty)
  const set = <K extends keyof RuleValues>(key: K) => (value: RuleValues[K]) => setV((c) => ({ ...c, [key]: value }))

  return (
    <ActionDialog
      trigger={
        initial ? (
          <Button variant="ghost" size="icon" aria-label={`Edit ${initial.name}`}>
            <PencilIcon />
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden /> New discount rule
          </Button>
        )
      }
      title={initial ? "Edit discount rule" : "New discount rule"}
      description="Staff choose which rules apply when assigning tuition. Discounts never exceed the plan price."
      submitLabel="Save rule"
      successMessage="Discount rule saved."
      onOpen={() => setV(initial ?? empty)}
      onSubmit={() => saveDiscountRuleAction({ ...v, planId: v.planId === ANY_PLAN ? "" : v.planId })}
    >
      <Field id="rule-name" label="Name">
        <Input id="rule-name" value={v.name} onChange={(e) => set("name")(e.target.value)} placeholder="Sibling discount – 10%" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="rule-kind" label="Type">
          <OptionSelect
            id="rule-kind"
            value={v.kind}
            onChange={set("kind")}
            options={[
              { id: "percent", label: "Percentage of plan price" },
              { id: "fixed", label: "Fixed amount (₫)" },
            ]}
            placeholder="Type"
          />
        </Field>
        <Field id="rule-value" label={v.kind === "percent" ? "Percent" : "Amount (₫)"}>
          <Input id="rule-value" inputMode="decimal" value={v.value} onChange={(e) => set("value")(e.target.value)} />
        </Field>
      </div>
      <Field id="rule-plan" label="Applies to">
        <OptionSelect
          id="rule-plan"
          value={v.planId || ANY_PLAN}
          onChange={set("planId")}
          options={[{ id: ANY_PLAN, label: "Any plan" }, ...plans]}
          placeholder="Any plan"
        />
      </Field>
      <div className="flex items-center gap-2">
        <Checkbox id="rule-active" checked={v.isActive} onCheckedChange={(checked) => set("isActive")(checked === true)} />
        <Label htmlFor="rule-active" className="font-normal">
          Active
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
          <PlusIcon aria-hidden /> Assign tuition
        </Button>
      }
      title="Assign tuition"
      description="Creates the student's tuition and its installment invoices in one step."
      submitLabel="Assign"
      successMessage="Tuition assigned and invoices issued."
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
        <Field id="assign-student" label="Student">
          <OptionSelect id="assign-student" value={studentId} onChange={setStudentId} options={students} placeholder="Choose a student" />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
        <Field id="assign-plan" label="Plan">
          <OptionSelect id="assign-plan" value={planId} onChange={setPlanId} options={plans} placeholder="Choose a plan" />
        </Field>
        <Field id="assign-due" label="First due date">
          <Input id="assign-due" type="date" value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} />
        </Field>
      </div>
      {usableRules.length > 0 && (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-sm font-medium">Discounts</legend>
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
        <Field id="assign-manual" label="Extra discount (₫)">
          <Input id="assign-manual" inputMode="numeric" value={manualDiscount} onChange={(e) => setManualDiscount(e.target.value)} placeholder="0" />
        </Field>
        <Field id="assign-manual-label" label="Reason for extra discount">
          <Input id="assign-manual-label" value={manualDiscountLabel} onChange={(e) => setManualDiscountLabel(e.target.value)} />
        </Field>
      </div>
      {plan && (
        <dl className="bg-muted grid grid-cols-3 gap-2 rounded-md p-3 text-sm">
          <div>
            <dt className="text-muted-foreground text-xs">Original</dt>
            <dd>{formatVnd(plan.amount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Discount</dt>
            <dd>{formatVnd(discount)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Final</dt>
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
  const [studentId, setStudentId] = useState("")
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [dueDate, setDueDate] = useState(today())

  return (
    <ActionDialog
      trigger={
        <Button variant="outline">
          <PlusIcon aria-hidden /> Other charge
        </Button>
      }
      title="Invoice another charge"
      description="For charges outside a tuition plan, e.g. textbooks or exam fees."
      submitLabel="Create invoice"
      successMessage="Invoice created."
      onOpen={() => {
        setStudentId("")
        setDescription("")
        setAmount("")
        setDueDate(today())
      }}
      onSubmit={() => createInvoiceAction({ studentId, description, amount, dueDate })}
    >
      <Field id="invoice-student" label="Student">
        <OptionSelect id="invoice-student" value={studentId} onChange={setStudentId} options={students} placeholder="Choose a student" />
      </Field>
      <Field id="invoice-description" label="Description">
        <Input id="invoice-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Giáo trình Flyers" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="invoice-amount" label="Amount (₫)">
          <Input id="invoice-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="invoice-due" label="Due date">
          <Input id="invoice-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
    </ActionDialog>
  )
}

export function RecordPaymentDialog({ invoiceId, remaining }: { invoiceId: string; remaining: number }) {
  const [amount, setAmount] = useState(String(remaining))
  const [paidOn, setPaidOn] = useState(today())
  const [method, setMethod] = useState("cash")
  const [reference, setReference] = useState("")
  const [notes, setNotes] = useState("")

  return (
    <ActionDialog
      trigger={
        <Button>
          <BanknoteIcon aria-hidden /> Record payment
        </Button>
      }
      title="Record a payment"
      description={`Remaining on this invoice: ${formatVnd(remaining)}. Partial payments are allowed; over-payment is not.`}
      submitLabel="Record payment"
      successMessage="Payment recorded."
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
        <Field id="payment-amount" label="Amount (₫)">
          <Input id="payment-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field id="payment-date" label="Date received">
          <Input id="payment-date" type="date" value={paidOn} max={today()} onChange={(e) => setPaidOn(e.target.value)} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="payment-method" label="Method">
          <OptionSelect
            id="payment-method"
            value={method}
            onChange={setMethod}
            options={PAYMENT_METHOD_VALUES.map((m) => ({ id: m, label: PAYMENT_METHOD_LABELS[m] }))}
            placeholder="Method"
          />
        </Field>
        <Field id="payment-reference" label="Transaction reference">
          <Input id="payment-reference" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Bank transfer code" />
        </Field>
      </div>
      <Field id="payment-notes" label="Notes">
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
  const [reason, setReason] = useState("")
  return (
    <ActionDialog
      trigger={trigger}
      title={title}
      description={description}
      submitLabel={submitLabel}
      successMessage={successMessage}
      onOpen={() => setReason("")}
      onSubmit={() => action(reason)}
    >
      <Field id="reason" label="Reason (kept in the record)">
        <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </ActionDialog>
  )
}

export function VoidInvoiceButton({ invoiceId }: { invoiceId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="outline">
          <BanIcon aria-hidden /> Void invoice
        </Button>
      }
      title="Void this invoice?"
      description="Only invoices without payments can be voided. The invoice stays on record, marked void."
      submitLabel="Void invoice"
      successMessage="Invoice voided."
      action={(reason) => voidInvoiceAction({ invoiceId, reason })}
    />
  )
}

export function VoidPaymentButton({ paymentId }: { paymentId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm">
          Void
        </Button>
      }
      title="Void this payment?"
      description="Use this for mistakes or bounced transfers. The payment stays on record, marked void, and the balance is restored."
      submitLabel="Void payment"
      successMessage="Payment voided."
      action={(reason) => voidPaymentAction({ paymentId, reason })}
    />
  )
}

export function CancelTuitionButton({ tuitionId }: { tuitionId: string }) {
  return (
    <ReasonDialog
      trigger={
        <Button variant="ghost" size="sm">
          Cancel tuition
        </Button>
      }
      title="Cancel this tuition?"
      description="Unpaid invoices are voided; invoices with payments are kept."
      submitLabel="Cancel tuition"
      successMessage="Tuition cancelled."
      action={(reason) => cancelTuitionAction({ tuitionId, reason })}
    />
  )
}
