-- =============================================================================
-- Tuition management.
--
--   tuition_plans          price list per course: amount, duration, schedule
--   tuition_discount_rules named discounts (percent or fixed), optionally per plan
--   student_tuitions       a plan assigned to a student (amount snapshot)
--   student_tuition_discounts  discounts applied, with the amount at the time
--   invoices               installments (and ad-hoc charges) owed by a student
--   payments               money received against an invoice (append-only)
--
-- Money is VND in whole dong: numeric(14, 0). Balances and statuses are never
-- stored: they are derived from invoices and completed payments in the
-- invoice_balances / student_tuition_balances views, so they cannot drift.
-- Payments are never edited; mistakes are voided with a reason.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Permissions: finance staff only; students/parents read their own/children's.
-- Teachers get nothing unless granted individually (user_permissions).
-- -----------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('tuition.read',   'View tuition, invoices and payments'),
  ('tuition.write',  'Manage tuition plans, assign tuition, issue and void invoices'),
  ('payments.write', 'Record and void payments');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'tuition.read',   'all'),
  ('super_admin', 'tuition.write',  'all'),
  ('super_admin', 'payments.write', 'all'),
  ('admin',       'tuition.read',   'all'),
  ('admin',       'tuition.write',  'all'),
  ('admin',       'payments.write', 'all'),
  ('student',     'tuition.read',   'own'),
  ('parent',      'tuition.read',   'children');

-- "Today" in the academy's time zone (the database clock is UTC).
create or replace function private.academy_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Ho_Chi_Minh')::date;
$$;

-- Row access for anything owned by a student: finance staff see all, students
-- their own, parents their children's (archived students excepted).
create or replace function private.can_read_tuition_of(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('tuition.read', 'all')
    or (
      exists (select 1 from public.students s where s.id = target_student_id and s.deleted_at is null)
      and (
        (private.has_permission('tuition.read', 'own') and target_student_id = private.current_student_id())
        or (private.has_permission('tuition.read', 'children') and private.is_parent_of(target_student_id))
      )
    );
$$;

-- -----------------------------------------------------------------------------
-- Plans and discount rules
-- -----------------------------------------------------------------------------
create type public.payment_schedule as enum ('one_time', 'monthly', 'quarterly');
create type public.discount_kind as enum ('percent', 'fixed');

create table public.tuition_plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name             text not null check (btrim(name) <> '' and char_length(name) <= 150),
  course_id        uuid not null references public.courses (id) on delete restrict,
  amount           numeric(14, 0) not null check (amount > 0),
  currency         char(3) not null default 'VND' check (currency = 'VND'),
  duration_months  integer not null check (duration_months between 1 and 60),
  payment_schedule public.payment_schedule not null,
  is_active        boolean not null default true,
  notes            text check (char_length(notes) <= 1000),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

comment on column public.tuition_plans.payment_schedule is
  'one_time: 1 invoice; monthly: one per month of the duration; quarterly: one per 3 months.';

create index tuition_plans_course_idx on public.tuition_plans (course_id);

create trigger tuition_plans_set_updated_at
  before update on public.tuition_plans
  for each row execute function private.set_updated_at();

create table public.tuition_discount_rules (
  id         uuid primary key default gen_random_uuid(),
  plan_id    uuid references public.tuition_plans (id) on delete cascade,
  name       text not null check (btrim(name) <> '' and char_length(name) <= 150),
  kind       public.discount_kind not null,
  value      numeric(14, 2) not null check (value > 0),
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'percent' or value <= 100)
);

comment on column public.tuition_discount_rules.plan_id is 'NULL: the rule can be applied to any plan.';

create index tuition_discount_rules_plan_idx on public.tuition_discount_rules (plan_id);

create trigger tuition_discount_rules_set_updated_at
  before update on public.tuition_discount_rules
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Student tuition (a plan assigned to a student; amounts are snapshots)
-- -----------------------------------------------------------------------------
create type public.student_tuition_status as enum ('active', 'cancelled');

create table public.student_tuitions (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students (id) on delete restrict,
  plan_id          uuid not null references public.tuition_plans (id) on delete restrict,
  plan_name        text not null,
  course_name      text not null,
  original_amount  numeric(14, 0) not null check (original_amount > 0),
  discount_amount  numeric(14, 0) not null default 0 check (discount_amount >= 0),
  final_amount     numeric(14, 0) generated always as (original_amount - discount_amount) stored,
  start_date       date not null,
  status           public.student_tuition_status not null default 'active',
  cancelled_at     timestamptz,
  cancel_reason    text,
  created_by       uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (discount_amount <= original_amount),
  check (status = 'active' or (cancelled_at is not null and cancel_reason is not null))
);

create index student_tuitions_student_idx on public.student_tuitions (student_id);

create table public.student_tuition_discounts (
  id                 uuid primary key default gen_random_uuid(),
  student_tuition_id uuid not null references public.student_tuitions (id) on delete cascade,
  rule_id            uuid references public.tuition_discount_rules (id) on delete set null,
  label              text not null,
  amount             numeric(14, 0) not null check (amount > 0)
);

create index student_tuition_discounts_tuition_idx on public.student_tuition_discounts (student_tuition_id);

-- -----------------------------------------------------------------------------
-- Invoices
-- -----------------------------------------------------------------------------
create type public.invoice_status as enum ('open', 'void');

create sequence public.invoice_number_seq;
create sequence public.receipt_number_seq;

create table public.invoices (
  id                 uuid primary key default gen_random_uuid(),
  invoice_number     text not null unique,
  student_id         uuid not null references public.students (id) on delete restrict,
  student_tuition_id uuid references public.student_tuitions (id) on delete restrict,
  description        text not null check (btrim(description) <> '' and char_length(description) <= 300),
  amount             numeric(14, 0) not null check (amount > 0),
  issue_date         date not null default private.academy_today(),
  due_date           date not null,
  status             public.invoice_status not null default 'open',
  voided_at          timestamptz,
  void_reason        text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  check (due_date >= issue_date),
  check (status = 'open' or (voided_at is not null and void_reason is not null))
);

create index invoices_student_idx on public.invoices (student_id);
create index invoices_tuition_idx on public.invoices (student_tuition_id);
create index invoices_due_idx on public.invoices (due_date) where status = 'open';

create or replace function private.prepare_invoice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.invoice_number := 'HD' || to_char(new.issue_date, 'YYYY') || '-'
    || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
  new.created_by := (select auth.uid());
  new.status := 'open';
  new.voided_at := null;
  new.void_reason := null;
  if new.student_tuition_id is not null and not exists (
    select 1 from public.student_tuitions t
    where t.id = new.student_tuition_id and t.student_id = new.student_id
  ) then
    raise exception 'The invoice student must match the tuition student.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger invoices_prepare
  before insert on public.invoices
  for each row execute function private.prepare_invoice();

-- -----------------------------------------------------------------------------
-- Payments (append-only; provider fields prepare for a payment gateway)
-- -----------------------------------------------------------------------------
create type public.payment_method as enum ('cash', 'bank_transfer', 'other');
create type public.payment_status as enum ('completed', 'voided');

create table public.payments (
  id                    uuid primary key default gen_random_uuid(),
  receipt_number        text not null unique,
  invoice_id            uuid not null references public.invoices (id) on delete restrict,
  student_id            uuid not null references public.students (id) on delete restrict,
  amount                numeric(14, 0) not null check (amount > 0),
  paid_on               date not null,
  method                public.payment_method not null,
  transaction_reference text check (char_length(transaction_reference) <= 100),
  notes                 text check (char_length(notes) <= 1000),
  status                public.payment_status not null default 'completed',
  recorded_by           uuid references public.profiles (id) on delete set null,
  recorded_by_name      text not null default '',
  provider              text not null default 'manual' check (provider ~ '^[a-z0-9_]{2,30}$'),
  provider_payment_id   text,
  voided_at             timestamptz,
  void_reason           text,
  voided_by             uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  check (status = 'completed' or (voided_at is not null and void_reason is not null)),
  -- A gateway may deliver the same event twice; its id is recorded once.
  unique (provider, provider_payment_id)
);

comment on column public.payments.provider is
  '"manual" for staff-recorded payments; a gateway id (e.g. "vnpay") once integrated.';

create index payments_invoice_idx on public.payments (invoice_id);
create index payments_student_idx on public.payments (student_id);
create index payments_paid_on_idx on public.payments (paid_on);

-- Server-controlled fields and the balance rule. The invoice row is locked so
-- two concurrent payments cannot both fit into the same remaining balance.
create or replace function private.prepare_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invoice public.invoices;
  already_paid numeric(14, 0);
begin
  select * into invoice from public.invoices where id = new.invoice_id for update;
  if not found then
    raise exception 'Invoice not found.' using errcode = 'P0002';
  end if;
  if invoice.status = 'void' then
    raise exception 'Payments cannot be recorded against a void invoice.' using errcode = '22023';
  end if;

  select coalesce(sum(amount), 0) into already_paid
  from public.payments where invoice_id = invoice.id and status = 'completed';

  if already_paid + new.amount > invoice.amount then
    raise exception 'This payment exceeds the remaining balance of % ₫.',
      to_char(invoice.amount - already_paid, 'FM999G999G999G990')
      using errcode = '23514';
  end if;

  new.receipt_number := 'PT' || to_char(new.paid_on, 'YYYY') || '-'
    || lpad(nextval('public.receipt_number_seq')::text, 5, '0');
  new.student_id := invoice.student_id;
  new.status := 'completed';
  new.recorded_by := (select auth.uid());
  new.recorded_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  new.voided_at := null;
  new.void_reason := null;
  new.voided_by := null;
  return new;
end;
$$;

create trigger payments_prepare
  before insert on public.payments
  for each row execute function private.prepare_payment();

-- -----------------------------------------------------------------------------
-- Derived balances (security invoker: callers see only rows they may read)
-- -----------------------------------------------------------------------------
create view public.invoice_balances with (security_invoker = true) as
select
  i.id,
  i.invoice_number,
  i.student_id,
  i.student_tuition_id,
  i.description,
  i.amount,
  i.issue_date,
  i.due_date,
  i.status as invoice_status,
  i.voided_at,
  i.created_at,
  coalesce(p.paid, 0)::numeric(14, 0) as paid,
  (case when i.status = 'void' then 0 else i.amount - coalesce(p.paid, 0) end)::numeric(14, 0) as remaining,
  case
    when i.status = 'void' then 'void'
    when coalesce(p.paid, 0) >= i.amount then 'paid'
    when i.due_date < private.academy_today() then 'overdue'
    when coalesce(p.paid, 0) > 0 then 'partially_paid'
    else 'unpaid'
  end as payment_status,
  s.full_name as student_name,
  s.student_code
from public.invoices i
left join public.students s on s.id = i.student_id
left join lateral (
  select sum(amount) as paid from public.payments
  where invoice_id = i.id and status = 'completed'
) p on true;

create view public.student_tuition_balances with (security_invoker = true) as
select
  t.id,
  t.student_id,
  t.plan_id,
  t.plan_name,
  t.course_name,
  t.original_amount,
  t.discount_amount,
  t.final_amount,
  t.start_date,
  t.status as tuition_status,
  t.created_at,
  coalesce(sum(b.paid), 0)::numeric(14, 0) as paid,
  coalesce(sum(b.remaining), 0)::numeric(14, 0) as remaining,
  min(b.due_date) filter (where b.remaining > 0) as next_due_date,
  case
    when t.status = 'cancelled' then 'cancelled'
    when coalesce(sum(b.remaining), 0) = 0 then 'paid'
    when bool_or(b.payment_status = 'overdue') then 'overdue'
    when coalesce(sum(b.paid), 0) > 0 then 'partially_paid'
    else 'unpaid'
  end as payment_status,
  s.full_name as student_name,
  s.student_code
from public.student_tuitions t
left join public.invoice_balances b on b.student_tuition_id = t.id
left join public.students s on s.id = t.student_id
group by t.id, s.full_name, s.student_code;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Assigns a plan to a student: snapshots the price, applies discounts and
-- creates the installment invoices, all in one transaction.
create or replace function public.assign_tuition(
  target_student_id uuid,
  target_plan_id uuid,
  first_due_date date,
  discount_rule_ids uuid[] default '{}',
  manual_discount numeric default 0,
  manual_discount_label text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  plan record;
  rule record;
  tuition_id uuid;
  discount numeric(14, 0) := 0;
  final_amount numeric(14, 0);
  installments integer;
  step_months integer;
  base numeric(14, 0);
  due date;
  applied_rules integer := 0;
begin
  if not private.has_permission('tuition.write') then
    raise exception 'You do not have permission to manage tuition.' using errcode = '42501';
  end if;
  if manual_discount < 0 then
    raise exception 'Discounts cannot be negative.' using errcode = '22023';
  end if;

  select p.*, c.name as course_name into plan
  from public.tuition_plans p join public.courses c on c.id = p.course_id
  where p.id = target_plan_id and p.deleted_at is null and p.is_active;
  if not found then
    raise exception 'Choose an active tuition plan.' using errcode = '22023';
  end if;

  discount_rule_ids := array(select distinct unnest(coalesce(discount_rule_ids, '{}')));

  -- Validate and total the discounts first, so the tuition row is written once
  -- with its final discount (tuition rows are never updated afterwards).
  for rule in
    select * from public.tuition_discount_rules r where r.id = any (discount_rule_ids)
  loop
    if not rule.is_active or (rule.plan_id is not null and rule.plan_id <> plan.id) then
      raise exception 'Discount "%" cannot be used with this plan.', rule.name using errcode = '22023';
    end if;
    discount := discount + case rule.kind when 'percent' then round(plan.amount * rule.value / 100) else rule.value end;
    applied_rules := applied_rules + 1;
  end loop;
  if applied_rules <> cardinality(discount_rule_ids) then
    raise exception 'Unknown discount rule.' using errcode = '22023';
  end if;
  -- Discounts never exceed the price.
  discount := least(discount + round(manual_discount), plan.amount);
  final_amount := plan.amount - discount;

  insert into public.student_tuitions (
    student_id, plan_id, plan_name, course_name, original_amount, discount_amount, start_date, created_by
  )
  values (
    target_student_id, plan.id, plan.name, plan.course_name, plan.amount, discount, first_due_date, (select auth.uid())
  )
  returning id into tuition_id;

  insert into public.student_tuition_discounts (student_tuition_id, rule_id, label, amount)
  select tuition_id, r.id, r.name,
         case r.kind when 'percent' then round(plan.amount * r.value / 100) else r.value end
  from public.tuition_discount_rules r where r.id = any (discount_rule_ids);

  if manual_discount > 0 then
    insert into public.student_tuition_discounts (student_tuition_id, label, amount)
    values (tuition_id, coalesce(nullif(btrim(manual_discount_label), ''), 'Manual discount'), round(manual_discount));
  end if;

  if final_amount = 0 then
    return tuition_id;
  end if;

  installments := case plan.payment_schedule
    when 'one_time' then 1
    when 'monthly' then plan.duration_months
    else ceil(plan.duration_months / 3.0)::integer
  end;
  step_months := case plan.payment_schedule when 'quarterly' then 3 else 1 end;
  -- Equal installments rounded down to 1,000 ₫; the last one takes the rest.
  base := floor(final_amount / installments / 1000) * 1000;

  for i in 1..installments loop
    due := (first_due_date + make_interval(months => (i - 1) * step_months))::date;
    insert into public.invoices (student_id, student_tuition_id, description, amount, issue_date, due_date)
    values (
      target_student_id,
      tuition_id,
      case when installments = 1 then plan.name
           else plan.name || ' – installment ' || i || '/' || installments end,
      case when i < installments then base else final_amount - base * (installments - 1) end,
      least(private.academy_today(), due),
      due
    );
  end loop;

  return tuition_id;
end;
$$;

-- Records a payment. `provider`/`provider_payment_id` let a future gateway
-- webhook call this idempotently: a repeated event returns the first payment.
create or replace function public.record_payment(
  target_invoice_id uuid,
  payment_amount numeric,
  payment_date date,
  payment_method public.payment_method,
  reference text default null,
  payment_notes text default null,
  payment_provider text default 'manual',
  external_payment_id text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  payment_id uuid;
begin
  if not private.has_permission('payments.write') then
    raise exception 'You do not have permission to record payments.' using errcode = '42501';
  end if;
  if payment_date > private.academy_today() then
    raise exception 'The payment date cannot be in the future.' using errcode = '22023';
  end if;

  if external_payment_id is not null then
    select id into payment_id from public.payments
    where provider = payment_provider and provider_payment_id = external_payment_id;
    if found then
      return payment_id;
    end if;
  end if;

  -- receipt_number and student_id are placeholders: the payments_prepare
  -- trigger sets them from the sequence and the invoice.
  insert into public.payments (
    receipt_number, invoice_id, student_id, amount, paid_on, method,
    transaction_reference, notes, provider, provider_payment_id
  )
  values (
    '', target_invoice_id, target_invoice_id, payment_amount, payment_date, payment_method,
    nullif(btrim(reference), ''), nullif(btrim(payment_notes), ''), payment_provider, external_payment_id
  )
  returning id into payment_id;
  return payment_id;
end;
$$;

create or replace function public.void_payment(target_payment_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('payments.write') then
    raise exception 'You do not have permission to void payments.' using errcode = '42501';
  end if;
  if coalesce(btrim(reason), '') = '' then
    raise exception 'Give a reason for voiding the payment.' using errcode = '22023';
  end if;

  update public.payments
  set status = 'voided', voided_at = now(), void_reason = btrim(reason), voided_by = (select auth.uid())
  where id = target_payment_id and status = 'completed';
  if not found then
    raise exception 'Payment not found or already voided.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.void_invoice(target_invoice_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('tuition.write') then
    raise exception 'You do not have permission to manage tuition.' using errcode = '42501';
  end if;
  if coalesce(btrim(reason), '') = '' then
    raise exception 'Give a reason for voiding the invoice.' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where invoice_id = target_invoice_id and status = 'completed') then
    raise exception 'This invoice has payments. Void the payments first.' using errcode = '23503';
  end if;

  update public.invoices
  set status = 'void', voided_at = now(), void_reason = btrim(reason)
  where id = target_invoice_id and status = 'open';
  if not found then
    raise exception 'Invoice not found or already void.' using errcode = 'P0002';
  end if;
end;
$$;

-- Cancels a student's tuition (e.g. they left): unpaid invoices are voided;
-- invoices with payments are kept.
create or replace function public.cancel_tuition(target_tuition_id uuid, reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('tuition.write') then
    raise exception 'You do not have permission to manage tuition.' using errcode = '42501';
  end if;
  if coalesce(btrim(reason), '') = '' then
    raise exception 'Give a reason for cancelling.' using errcode = '22023';
  end if;

  update public.student_tuitions
  set status = 'cancelled', cancelled_at = now(), cancel_reason = btrim(reason)
  where id = target_tuition_id and status = 'active';
  if not found then
    raise exception 'Tuition not found or already cancelled.' using errcode = 'P0002';
  end if;

  update public.invoices i
  set status = 'void', voided_at = now(), void_reason = 'Tuition cancelled: ' || btrim(reason)
  where i.student_tuition_id = target_tuition_id
    and i.status = 'open'
    and not exists (select 1 from public.payments p where p.invoice_id = i.id and p.status = 'completed');
end;
$$;

revoke all on function public.assign_tuition(uuid, uuid, date, uuid[], numeric, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, date, public.payment_method, text, text, text, text) from public, anon;
revoke all on function public.void_payment(uuid, text) from public, anon;
revoke all on function public.void_invoice(uuid, text) from public, anon;
revoke all on function public.cancel_tuition(uuid, text) from public, anon;
grant execute on function public.assign_tuition(uuid, uuid, date, uuid[], numeric, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, date, public.payment_method, text, text, text, text) to authenticated;
grant execute on function public.void_payment(uuid, text) to authenticated;
grant execute on function public.void_invoice(uuid, text) to authenticated;
grant execute on function public.cancel_tuition(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.tuition_plans enable row level security;
alter table public.tuition_discount_rules enable row level security;
alter table public.student_tuitions enable row level security;
alter table public.student_tuition_discounts enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;

-- The price list is finance data.
create policy tuition_plans_select on public.tuition_plans for select to authenticated
  using ((select private.has_permission('tuition.read', 'all')));
create policy tuition_plans_write on public.tuition_plans for all to authenticated
  using ((select private.has_permission('tuition.write')))
  with check ((select private.has_permission('tuition.write')));

create policy tuition_discount_rules_select on public.tuition_discount_rules for select to authenticated
  using ((select private.has_permission('tuition.read', 'all')));
create policy tuition_discount_rules_write on public.tuition_discount_rules for all to authenticated
  using ((select private.has_permission('tuition.write')))
  with check ((select private.has_permission('tuition.write')));

create policy student_tuitions_select on public.student_tuitions for select to authenticated
  using (private.can_read_tuition_of(student_id));
create policy student_tuitions_insert on public.student_tuitions for insert to authenticated
  with check ((select private.has_permission('tuition.write')));

create policy student_tuition_discounts_select on public.student_tuition_discounts for select to authenticated
  using (exists (select 1 from public.student_tuitions t where t.id = student_tuition_id));
create policy student_tuition_discounts_insert on public.student_tuition_discounts for insert to authenticated
  with check ((select private.has_permission('tuition.write')));

create policy invoices_select on public.invoices for select to authenticated
  using (private.can_read_tuition_of(student_id));
create policy invoices_insert on public.invoices for insert to authenticated
  with check ((select private.has_permission('tuition.write')));

create policy payments_select on public.payments for select to authenticated
  using (private.can_read_tuition_of(student_id));
create policy payments_insert on public.payments for insert to authenticated
  with check ((select private.has_permission('payments.write')));

-- Financial records are immutable through the API: only the security-definer
-- functions above may change amounts' state (void/cancel), and nothing is
-- ever deleted.
revoke update, delete on public.student_tuitions, public.invoices, public.payments,
  public.student_tuition_discounts from authenticated;

revoke all on public.tuition_plans, public.tuition_discount_rules, public.student_tuitions,
  public.student_tuition_discounts, public.invoices, public.payments,
  public.invoice_balances, public.student_tuition_balances from anon;
revoke insert, update, delete on public.invoice_balances, public.student_tuition_balances from authenticated;
grant select on public.invoice_balances, public.student_tuition_balances to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
