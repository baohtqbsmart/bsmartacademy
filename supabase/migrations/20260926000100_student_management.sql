-- =============================================================================
-- Student management:
--   * english_levels reference data (CEFR, Pre-IELTS, IELTS, Cambridge)
--   * student contact, admission, level and photo fields; generated student codes
--   * student_directory view for search / filter / sort / pagination
--   * enrolment RPCs (enrol, change status, transfer) — atomic, RLS-respecting
--   * teacher feedback
--   * student-photos storage bucket
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- Generic helper: caller holds the permission at any scope
-- -----------------------------------------------------------------------------
create or replace function private.has_any_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_code = p.role_code
    where p.id = (select auth.uid()) and p.is_active and rp.permission_code = required_permission
  );
$$;

-- -----------------------------------------------------------------------------
-- English levels (reference data)
-- -----------------------------------------------------------------------------
create type public.english_framework as enum ('cefr', 'pre_ielts', 'ielts', 'cambridge');

create table public.english_levels (
  code       text primary key check (code ~ '^[A-Z0-9_.-]{2,20}$'),
  framework  public.english_framework not null,
  name       text not null check (btrim(name) <> ''),
  cefr       text check (cefr in ('Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  sort_order integer not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.english_levels.cefr is 'Approximate CEFR equivalent, used to compare levels across frameworks.';

create trigger english_levels_set_updated_at
  before update on public.english_levels
  for each row execute function private.set_updated_at();

insert into public.english_levels (code, framework, name, cefr, sort_order) values
  ('PRE_A1',       'cefr',      'Pre-A1',                'Pre-A1', 10),
  ('A1',           'cefr',      'A1',                    'A1',     20),
  ('A2',           'cefr',      'A2',                    'A2',     30),
  ('B1',           'cefr',      'B1',                    'B1',     40),
  ('B2',           'cefr',      'B2',                    'B2',     50),
  ('C1',           'cefr',      'C1',                    'C1',     60),
  ('C2',           'cefr',      'C2',                    'C2',     70),
  ('PRE_IELTS',    'pre_ielts', 'Pre-IELTS',             'A2',     100),
  ('IELTS_3.0',    'ielts',     'IELTS 3.0',             'A2',     200),
  ('IELTS_3.5',    'ielts',     'IELTS 3.5',             'A2',     205),
  ('IELTS_4.0',    'ielts',     'IELTS 4.0',             'B1',     210),
  ('IELTS_4.5',    'ielts',     'IELTS 4.5',             'B1',     215),
  ('IELTS_5.0',    'ielts',     'IELTS 5.0',             'B1',     220),
  ('IELTS_5.5',    'ielts',     'IELTS 5.5',             'B2',     225),
  ('IELTS_6.0',    'ielts',     'IELTS 6.0',             'B2',     230),
  ('IELTS_6.5',    'ielts',     'IELTS 6.5',             'B2',     235),
  ('IELTS_7.0',    'ielts',     'IELTS 7.0',             'C1',     240),
  ('IELTS_7.5',    'ielts',     'IELTS 7.5',             'C1',     245),
  ('IELTS_8.0',    'ielts',     'IELTS 8.0',             'C1',     250),
  ('IELTS_8.5',    'ielts',     'IELTS 8.5',             'C2',     255),
  ('IELTS_9.0',    'ielts',     'IELTS 9.0',             'C2',     260),
  ('CAM_STARTERS', 'cambridge', 'Cambridge Starters',    'Pre-A1', 300),
  ('CAM_MOVERS',   'cambridge', 'Cambridge Movers',      'A1',     310),
  ('CAM_FLYERS',   'cambridge', 'Cambridge Flyers',      'A2',     320),
  ('CAM_KET',      'cambridge', 'A2 Key (KET)',          'A2',     330),
  ('CAM_PET',      'cambridge', 'B1 Preliminary (PET)',  'B1',     340),
  ('CAM_FCE',      'cambridge', 'B2 First (FCE)',        'B2',     350),
  ('CAM_CAE',      'cambridge', 'C1 Advanced (CAE)',     'C1',     360),
  ('CAM_CPE',      'cambridge', 'C2 Proficiency (CPE)',  'C2',     370);

alter table public.english_levels enable row level security;

create policy english_levels_select on public.english_levels for select to authenticated using (true);
create policy english_levels_write on public.english_levels for all to authenticated
  using ((select private.has_permission('courses.write')))
  with check ((select private.has_permission('courses.write')));

-- -----------------------------------------------------------------------------
-- Student fields
-- -----------------------------------------------------------------------------
create sequence public.student_code_seq;
grant usage on sequence public.student_code_seq to authenticated;

alter table public.students
  alter column student_code set default 'HS' || lpad(nextval('public.student_code_seq')::text, 4, '0'),
  add column phone             text check (phone ~ '^\+?[0-9 .-]{6,20}$'),
  add column email             text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add column address           text,
  add column joined_on         date,
  add column english_level_code text references public.english_levels (code) on update cascade,
  add column target_level_code  text references public.english_levels (code) on update cascade,
  add column avatar_path       text;

comment on column public.students.joined_on is 'Date the student enrolled at the academy (shown as "Enrollment date").';
comment on column public.students.avatar_path is 'Object path in the private "student-photos" bucket.';

create index students_english_level_idx on public.students (english_level_code) where deleted_at is null;
create index students_joined_on_idx on public.students (joined_on) where deleted_at is null;

-- -----------------------------------------------------------------------------
-- Directory view: one row per student with derived columns for the list page.
-- security_invoker: every underlying table's RLS applies to the caller, so a
-- teacher only ever sees their students, and only their classes in the
-- "current classes" column.
-- -----------------------------------------------------------------------------
create view public.student_directory with (security_invoker = true) as
select
  s.id,
  s.student_code,
  s.full_name,
  s.date_of_birth,
  s.gender,
  s.phone,
  s.email,
  s.status,
  s.joined_on,
  s.english_level_code,
  s.target_level_code,
  s.avatar_path,
  s.created_at,
  s.deleted_at,
  coalesce(current_classes.ids, '{}') as current_class_ids,
  current_classes.names as current_class_names,
  primary_parent.full_name as primary_parent_name,
  lower(extensions.unaccent(concat_ws(' ', s.full_name, s.student_code, s.phone, s.email))) as search_text
from public.students s
left join lateral (
  select array_agg(c.id order by c.start_date) as ids,
         string_agg(c.name, ', ' order by c.start_date) as names
  from public.enrollments e
  join public.classes c on c.id = e.class_id
  where e.student_id = s.id and e.status in ('pending', 'active') and c.deleted_at is null
) current_classes on true
left join lateral (
  select p.full_name
  from public.student_parents sp
  join public.parents p on p.id = sp.parent_id
  where sp.student_id = s.id and p.deleted_at is null
  order by sp.is_primary_contact desc, p.full_name
  limit 1
) primary_parent on true;

revoke all on public.student_directory from anon;
revoke insert, update, delete on public.student_directory from authenticated;
grant select on public.student_directory to authenticated;

-- -----------------------------------------------------------------------------
-- Enrolment RPCs. security invoker: RLS still applies; the explicit check gives
-- a clear error instead of a silent no-op.
-- -----------------------------------------------------------------------------
create or replace function public.enroll_student(
  target_student_id uuid,
  target_class_id uuid,
  initial_status public.enrollment_status default 'active',
  start_on date default current_date
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  enrollment_id uuid;
begin
  if not private.has_permission('enrollments.write') then
    raise exception 'You do not have permission to manage enrolments.' using errcode = '42501';
  end if;
  if initial_status not in ('pending', 'active') then
    raise exception 'New enrolments must be pending or active.' using errcode = '22023';
  end if;

  -- A previously withdrawn student re-joining the class reuses their record.
  insert into public.enrollments (student_id, class_id, status, enrolled_on)
  values (target_student_id, target_class_id, initial_status, start_on)
  on conflict (student_id, class_id) do update
    set status = excluded.status, enrolled_on = excluded.enrolled_on, ended_on = null
    where public.enrollments.status = 'withdrawn'
  returning id into enrollment_id;

  if enrollment_id is null then
    raise exception 'The student is already enrolled in this class.' using errcode = '23505';
  end if;
  return enrollment_id;
end;
$$;

create or replace function public.set_enrollment_status(
  target_enrollment_id uuid,
  new_status public.enrollment_status
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_permission('enrollments.write') then
    raise exception 'You do not have permission to manage enrolments.' using errcode = '42501';
  end if;

  update public.enrollments
  set status = new_status,
      ended_on = case
        when new_status in ('completed', 'withdrawn') then greatest(current_date, enrolled_on)
        else null
      end
  where id = target_enrollment_id;

  if not found then
    raise exception 'Enrolment not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Moves a student to another class in one transaction: the old enrolment is
-- withdrawn and a new active one is created (or a withdrawn one reactivated).
create or replace function public.transfer_enrollment(
  target_enrollment_id uuid,
  new_class_id uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_enrollment public.enrollments;
begin
  if not private.has_permission('enrollments.write') then
    raise exception 'You do not have permission to manage enrolments.' using errcode = '42501';
  end if;

  select * into current_enrollment from public.enrollments where id = target_enrollment_id for update;
  if not found then
    raise exception 'Enrolment not found.' using errcode = 'P0002';
  end if;
  if current_enrollment.status not in ('pending', 'active') then
    raise exception 'Only current enrolments can be transferred.' using errcode = '22023';
  end if;
  if current_enrollment.class_id = new_class_id then
    raise exception 'The student is already in this class.' using errcode = '22023';
  end if;

  perform public.set_enrollment_status(target_enrollment_id, 'withdrawn');
  return public.enroll_student(current_enrollment.student_id, new_class_id, 'active', current_date);
end;
$$;

revoke all on function public.enroll_student(uuid, uuid, public.enrollment_status, date) from public, anon;
revoke all on function public.set_enrollment_status(uuid, public.enrollment_status) from public, anon;
revoke all on function public.transfer_enrollment(uuid, uuid) from public, anon;
grant execute on function public.enroll_student(uuid, uuid, public.enrollment_status, date) to authenticated;
grant execute on function public.set_enrollment_status(uuid, public.enrollment_status) to authenticated;
grant execute on function public.transfer_enrollment(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Teacher feedback
-- -----------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('feedback.read',  'Read teacher feedback on students'),
  ('feedback.write', 'Write teacher feedback on students');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'feedback.read',  'all'),
  ('super_admin', 'feedback.write', 'all'),
  ('admin',       'feedback.read',  'all'),
  ('admin',       'feedback.write', 'all'),
  ('teacher',     'feedback.read',  'assigned'),
  ('teacher',     'feedback.write', 'assigned'),
  ('student',     'feedback.read',  'own'),
  ('parent',      'feedback.read',  'children');

create table public.student_feedback (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.students (id) on delete cascade,
  author_profile_id uuid references public.profiles (id) on delete set null,
  author_name       text not null default '',
  body              text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on column public.student_feedback.author_name is
  'Snapshot of the author''s name, so students and parents can see who wrote it without reading profiles.';

create index student_feedback_student_idx on public.student_feedback (student_id, created_at desc);

create trigger student_feedback_set_updated_at
  before update on public.student_feedback
  for each row execute function private.set_updated_at();

-- The author is always the signed-in user; it cannot be supplied or changed.
create or replace function private.set_feedback_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_profile_id := (select auth.uid());
    new.author_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  else
    new.author_profile_id := old.author_profile_id;
    new.author_name := old.author_name;
    new.student_id := old.student_id;
  end if;
  return new;
end;
$$;

create trigger student_feedback_set_author
  before insert or update on public.student_feedback
  for each row execute function private.set_feedback_author();

alter table public.student_feedback enable row level security;

-- Visible to anyone who may read feedback AND can see the student (student
-- visibility already encodes assigned / own / children).
create policy student_feedback_select on public.student_feedback for select to authenticated using (
  (select private.has_permission('feedback.write', 'all'))
  or (
    deleted_at is null
    and (select private.has_any_permission('feedback.read'))
    and exists (select 1 from public.students s where s.id = student_id)
  )
);

create policy student_feedback_insert on public.student_feedback for insert to authenticated with check (
  (select private.has_permission('feedback.write', 'all'))
  or ((select private.has_permission('feedback.write', 'assigned')) and private.teaches_student(student_id))
);

-- Authors edit (and archive) their own feedback while they still teach the
-- student; admins can moderate any feedback.
create policy student_feedback_update on public.student_feedback for update to authenticated
  using (
    (select private.has_permission('feedback.write', 'all'))
    or (author_profile_id = (select auth.uid())
        and (select private.has_permission('feedback.write', 'assigned'))
        and private.teaches_student(student_id))
  )
  with check (
    (select private.has_permission('feedback.write', 'all'))
    or (author_profile_id = (select auth.uid())
        and (select private.has_permission('feedback.write', 'assigned'))
        and private.teaches_student(student_id))
  );

revoke delete on public.student_feedback from authenticated;

-- -----------------------------------------------------------------------------
-- Storage: student photos ("<student_id>/photo"), readable wherever the
-- student is visible, writable by roles that can edit students.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy student_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'student-photos'
  and exists (select 1 from public.students s where s.id::text = (storage.foldername(name))[1])
);
create policy student_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and (select private.has_permission('students.write')));
create policy student_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and (select private.has_permission('students.write')))
  with check (bucket_id = 'student-photos' and (select private.has_permission('students.write')));
create policy student_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and (select private.has_permission('students.write')));

-- -----------------------------------------------------------------------------
-- Privileges for objects created in this migration
-- -----------------------------------------------------------------------------
revoke all on public.english_levels, public.student_feedback from anon;
revoke all on function private.has_any_permission(text) from public, anon;
revoke all on function private.set_feedback_author() from public, anon;
grant execute on function private.has_any_permission(text) to authenticated;
