-- =============================================================================
-- Learning path, completion, streaks and certificates
--
-- Course -> Module (course_units) -> Lessons (unit_lessons), and a class's
-- assignments and tests can be placed in a module of its course. Completion
-- is computed from real work (handed-in assignments and tests, practised
-- lessons); the learning streak from days with real activity. Certificates are
-- issued by administrators, carry a public verification code and can only be
-- revoked, never edited or deleted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Lessons in a module
-- -----------------------------------------------------------------------------
create table public.unit_lessons (
  unit_id    uuid not null references public.course_units (id) on delete cascade,
  lesson_id  uuid not null references public.lessons (id) on delete cascade,
  position   integer not null default 1 check (position > 0),
  created_at timestamptz not null default now(),
  primary key (unit_id, lesson_id)
);

create index unit_lessons_lesson_idx on public.unit_lessons (lesson_id);

alter table public.unit_lessons enable row level security;

-- Readable with the module (course visibility); lessons still apply their own RLS.
create policy unit_lessons_select on public.unit_lessons for select to authenticated
  using (exists (select 1 from public.course_units u where u.id = unit_id));
create policy unit_lessons_write on public.unit_lessons for all to authenticated
  using ((select private.has_permission('courses.write')))
  with check ((select private.has_permission('courses.write')));

-- -----------------------------------------------------------------------------
-- Assignments and tests placed in a module of their class's course
-- -----------------------------------------------------------------------------
alter table public.assignments add column unit_id uuid references public.course_units (id) on delete set null;
alter table public.tests add column unit_id uuid references public.course_units (id) on delete set null;

create or replace function private.check_unit_of_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_id is not null and not exists (
    select 1 from public.course_units u join public.classes c on c.course_id = u.course_id
    where u.id = new.unit_id and c.id = new.class_id
  ) then
    raise exception 'Choose a module of this class''s course.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger assignments_check_unit before insert or update of unit_id, class_id on public.assignments
  for each row execute function private.check_unit_of_class();
create trigger tests_check_unit before insert or update of unit_id, class_id on public.tests
  for each row execute function private.check_unit_of_class();

-- -----------------------------------------------------------------------------
-- Days with learning activity (academy time), for streaks. Runs with the
-- caller's rights: RLS decides whose activity they may see.
-- -----------------------------------------------------------------------------
create or replace function public.learning_days(target_student uuid, since date)
returns table (day date)
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct d from (
    select (s.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date as d
      from public.submissions s where s.student_id = target_student and s.submitted_at is not null
    union all
    select (a.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date
      from public.test_attempts a where a.student_id = target_student and a.submitted_at is not null
    union all
    select (l.created_at at time zone 'Asia/Ho_Chi_Minh')::date
      from public.lesson_attempts l where l.student_id = target_student
    union all
    select (l.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date
      from public.lesson_submissions l where l.student_id = target_student
    union all
    select (a.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date
      from public.assessment_submissions a where a.student_id = target_student
    union all
    select (v.created_at at time zone 'Asia/Ho_Chi_Minh')::date
      from public.vocabulary_practice v where v.student_id = target_student
    union all
    select r.session_date
      from public.attendance_records r where r.student_id = target_student and r.status in ('present', 'late')
  ) days (d)
  where d >= since
  order by 1
$$;

revoke all on function public.learning_days(uuid, date) from public, anon;
grant execute on function public.learning_days(uuid, date) to authenticated;

-- -----------------------------------------------------------------------------
-- Certificates
-- -----------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('certificates.write', 'Issue and revoke course certificates');
insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'certificates.write', 'all'),
  ('admin', 'certificates.write', 'all');

create sequence public.certificate_number_seq;

create table public.certificates (
  id                 uuid primary key default gen_random_uuid(),
  certificate_no     text not null unique,
  verify_code        text not null unique,
  student_id         uuid not null references public.students (id) on delete restrict,
  class_id           uuid not null references public.classes (id) on delete restrict,
  course_id          uuid references public.courses (id) on delete set null,
  student_name       text not null,
  course_name        text not null,
  class_name         text not null,
  completion_percent integer check (completion_percent between 0 and 100),
  note               text check (char_length(note) <= 500),
  issued_on          date not null,
  issued_by          uuid references public.profiles (id) on delete set null,
  issued_by_name     text not null default '',
  revoked_at         timestamptz,
  revoke_reason      text check (char_length(revoke_reason) <= 500),
  created_at         timestamptz not null default now(),
  check (revoked_at is null or revoke_reason is not null)
);

create index certificates_student_idx on public.certificates (student_id);

-- Names and numbers are filled in by the database, never by the client.
create or replace function private.prepare_certificate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  klass record;
begin
  select c.name as class_name, c.course_id, co.name as course_name
    into klass
    from public.classes c left join public.courses co on co.id = c.course_id
    where c.id = new.class_id;
  if not found or not exists (
    select 1 from public.enrollments e where e.class_id = new.class_id and e.student_id = new.student_id and e.status in ('active', 'completed')
  ) then
    raise exception 'The student is not enrolled in this class.' using errcode = '22023';
  end if;
  if exists (select 1 from public.certificates x where x.class_id = new.class_id and x.student_id = new.student_id and x.revoked_at is null) then
    raise exception 'This student already has a certificate for this class.' using errcode = '23505';
  end if;
  new.issued_on := coalesce(new.issued_on, (now() at time zone 'Asia/Ho_Chi_Minh')::date);
  new.certificate_no := 'BSA-' || to_char(new.issued_on, 'YYYY') || '-' || lpad(nextval('public.certificate_number_seq')::text, 5, '0');
  new.verify_code := encode(extensions.gen_random_bytes(9), 'hex');
  new.student_name := (select full_name from public.students where id = new.student_id);
  new.class_name := klass.class_name;
  new.course_id := klass.course_id;
  new.course_name := coalesce(klass.course_name, klass.class_name);
  new.issued_by := (select auth.uid());
  new.issued_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  new.revoked_at := null;
  new.revoke_reason := null;
  return new;
end;
$$;

create trigger certificates_prepare before insert on public.certificates
  for each row execute function private.prepare_certificate();

create or replace function private.audit_certificates()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('certificate.issued', 'certificate', new.id::text, new.certificate_no || ' · ' || new.student_name,
      jsonb_build_object('course', new.course_name));
  elsif new.revoked_at is not null and old.revoked_at is null then
    perform private.audit('certificate.revoked', 'certificate', new.id::text, new.certificate_no || ' · ' || new.student_name,
      jsonb_build_object('reason', new.revoke_reason));
  end if;
  return null;
end;
$$;

create trigger audit_certificates after insert or update of revoked_at on public.certificates
  for each row execute function private.audit_certificates();

alter table public.certificates enable row level security;

-- Whoever may see the student may see their certificates (student, parents, staff).
create policy certificates_select on public.certificates for select to authenticated
  using (exists (select 1 from public.students s where s.id = student_id));
create policy certificates_insert on public.certificates for insert to authenticated
  with check ((select private.has_permission('certificates.write')));
create policy certificates_update on public.certificates for update to authenticated
  using ((select private.has_permission('certificates.write')) and revoked_at is null)
  with check ((select private.has_permission('certificates.write')));

revoke all on public.certificates from anon;
revoke update, delete on public.certificates from authenticated;
grant update (revoked_at, revoke_reason) on public.certificates to authenticated;

-- Public verification by code: only what is printed on the certificate.
create or replace function public.verify_certificate(code text)
returns table (certificate_no text, student_name text, course_name text, class_name text, issued_on date, revoked boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select c.certificate_no, c.student_name, c.course_name, c.class_name, c.issued_on, c.revoked_at is not null
  from public.certificates c
  where c.verify_code = lower(btrim(code))
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
grant execute on function private.is_public_object(text), private.is_public_target(uuid, uuid) to anon;
