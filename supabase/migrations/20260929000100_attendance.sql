-- =============================================================================
-- Attendance.
--
--   attendance_sessions  one register per class and date (who took it, notes)
--   attendance_records   one row per student in that register
--
-- A student has at most one record per class and date: enforced by the unique
-- constraint attendance_records_one_per_student_class_date. class_id and
-- session_date are copied from the session by a trigger and tied to it by a
-- composite foreign key, so the copy can never disagree with its session.
--
-- Offline and online: each record says how a present/late student attended
-- (in person / online). In-person classes only accept in person, online
-- classes only online; hybrid classes accept either.
-- =============================================================================

insert into public.permissions (code, description) values
  ('attendance.read',  'View attendance'),
  ('attendance.write', 'Take and correct attendance');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'attendance.read',  'all'),
  ('super_admin', 'attendance.write', 'all'),
  ('admin',       'attendance.read',  'all'),
  ('admin',       'attendance.write', 'all'),
  ('teacher',     'attendance.read',  'assigned'),
  ('teacher',     'attendance.write', 'assigned'),
  ('student',     'attendance.read',  'own'),
  ('parent',      'attendance.read',  'children');

create type public.attendance_status as enum ('present', 'late', 'absent', 'excused');

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.attendance_sessions (
  id               uuid primary key default gen_random_uuid(),
  class_id         uuid not null references public.classes (id) on delete restrict,
  session_date     date not null,
  notes            text check (char_length(notes) <= 1000),
  recorded_by      uuid references public.profiles (id) on delete set null,
  recorded_by_name text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint attendance_sessions_one_per_class_date unique (class_id, session_date),
  -- Target of the records' composite foreign key.
  unique (id, class_id, session_date)
);

create index attendance_sessions_date_idx on public.attendance_sessions (session_date);

create table public.attendance_records (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null,
  class_id     uuid not null references public.classes (id) on delete restrict,
  session_date date not null,
  student_id   uuid not null references public.students (id) on delete restrict,
  status       public.attendance_status not null,
  attended_via public.delivery_mode check (attended_via <> 'hybrid'),
  minutes_late smallint check (minutes_late between 1 and 240),
  note         text check (char_length(note) <= 500),
  recorded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (session_id, class_id, session_date)
    references public.attendance_sessions (id, class_id, session_date) on delete cascade,
  constraint attendance_records_one_per_student_class_date unique (student_id, class_id, session_date),
  -- Present/late students attended in person or online; absent/excused did not attend.
  check ((status in ('present', 'late')) = (attended_via is not null)),
  check (status = 'late' or minutes_late is null)
);

comment on column public.attendance_records.attended_via is
  'in_person or online for present/late students; NULL for absent/excused.';

create index attendance_records_session_idx on public.attendance_records (session_id);
create index attendance_records_class_date_idx on public.attendance_records (class_id, session_date);
create index attendance_records_date_idx on public.attendance_records (session_date);

create trigger attendance_sessions_set_updated_at
  before update on public.attendance_sessions
  for each row execute function private.set_updated_at();

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity rules (apply to every write path, including direct inserts)
-- -----------------------------------------------------------------------------

-- Registers belong to a live, running (or finished) class, on a date within
-- its dates and not in the future. Class and date never change afterwards.
create or replace function private.prepare_attendance_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  klass public.classes;
begin
  if tg_op = 'UPDATE' then
    new.class_id := old.class_id;
    new.session_date := old.session_date;
    new.created_at := old.created_at;
  end if;

  select * into klass from public.classes where id = new.class_id;
  if not found or klass.deleted_at is not null then
    raise exception 'Class not found.' using errcode = 'P0002';
  end if;

  if tg_op = 'INSERT' then
    if klass.status not in ('active', 'completed') then
      raise exception 'Attendance can only be taken for active or completed classes.' using errcode = '22023';
    end if;
    if new.session_date > private.academy_today() then
      raise exception 'Attendance cannot be taken for a future date.' using errcode = '22023';
    end if;
    if new.session_date < klass.start_date or new.session_date > coalesce(klass.end_date, new.session_date) then
      raise exception 'The date is outside the class dates.' using errcode = '22023';
    end if;
  end if;

  new.recorded_by := (select auth.uid());
  new.recorded_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  return new;
end;
$$;

create trigger attendance_sessions_prepare
  before insert or update on public.attendance_sessions
  for each row execute function private.prepare_attendance_session();

-- Records: copied keys, enrolment on that date, attendance mode and the
-- server-set author.
create or replace function private.prepare_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.attendance_sessions;
  mode public.delivery_mode;
begin
  if tg_op = 'UPDATE' then
    new.session_id := old.session_id;
    new.student_id := old.student_id;
    new.created_at := old.created_at;
  end if;

  select * into session from public.attendance_sessions where id = new.session_id;
  if not found then
    raise exception 'Attendance register not found.' using errcode = 'P0002';
  end if;
  new.class_id := session.class_id;
  new.session_date := session.session_date;

  if tg_op = 'INSERT' and not exists (
    select 1
    from public.enrollments e
    join public.students s on s.id = e.student_id
    where e.student_id = new.student_id
      and e.class_id = new.class_id
      and e.status <> 'pending'
      and s.deleted_at is null
      and e.enrolled_on <= new.session_date
      and (e.ended_on is null or e.ended_on >= new.session_date)
  ) then
    raise exception 'This student was not enrolled in the class on %.', to_char(new.session_date, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  select delivery_mode into mode from public.classes where id = new.class_id;
  if new.status in ('absent', 'excused') then
    new.attended_via := null;
  else
    new.attended_via := coalesce(new.attended_via, case mode when 'online' then 'online' else 'in_person' end::public.delivery_mode);
    if mode <> 'hybrid' and new.attended_via <> mode then
      raise exception 'This class is held %; attendance must match.',
        case mode when 'online' then 'online' else 'in person' end
        using errcode = '22023';
    end if;
  end if;
  if new.status <> 'late' then
    new.minutes_late := null;
  end if;

  new.recorded_by := (select auth.uid());
  return new;
end;
$$;

create trigger attendance_records_prepare
  before insert or update on public.attendance_records
  for each row execute function private.prepare_attendance_record();

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------

-- Take / correct attendance: everywhere, or in the classes one teaches.
create or replace function private.can_write_attendance(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('attendance.write', 'all')
    or (private.has_permission('attendance.write', 'assigned') and private.is_class_teacher(target_class_id));
$$;

-- One student's record in one class. Teachers see the students they teach in
-- their classes (like the students policy); students their own; parents their
-- children's. Archived students are hidden from everyone but academy-wide staff.
create or replace function private.can_read_attendance(target_student_id uuid, target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('attendance.read', 'all')
    or (
      exists (select 1 from public.students s where s.id = target_student_id and s.deleted_at is null)
      and (
        (private.has_permission('attendance.read', 'assigned')
          and private.is_class_teacher(target_class_id) and private.teaches_student(target_student_id))
        or (private.has_permission('attendance.read', 'own') and target_student_id = private.current_student_id())
        or (private.has_permission('attendance.read', 'children') and private.is_parent_of(target_student_id))
      )
    );
$$;

-- A class register (date, notes, who took it).
create or replace function private.can_read_attendance_session(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('attendance.read', 'all')
    or (private.has_permission('attendance.read', 'assigned') and private.is_class_teacher(target_class_id))
    or (private.has_permission('attendance.read', 'own') and private.is_class_student(target_class_id))
    or (private.has_permission('attendance.read', 'children') and private.is_class_of_child(target_class_id));
$$;

-- -----------------------------------------------------------------------------
-- Saving a register
-- -----------------------------------------------------------------------------

-- Creates or updates the register for a class and date and upserts one record
-- per entry: [{ "student_id", "status", "attended_via"?, "minutes_late"?, "note"? }].
-- Saving again corrects the same rows; the unique constraint makes duplicates
-- impossible.
create or replace function public.save_attendance(
  target_class_id uuid,
  target_date date,
  entries jsonb,
  session_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  register_id uuid;
begin
  if not private.can_write_attendance(target_class_id) then
    raise exception 'You can only take attendance for classes you teach.' using errcode = '42501';
  end if;
  if jsonb_typeof(entries) is distinct from 'array' or jsonb_array_length(entries) = 0 then
    raise exception 'Mark at least one student.' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct e ->> 'student_id') from jsonb_array_elements(entries) e) then
    raise exception 'Each student can only be marked once.' using errcode = '22023';
  end if;

  insert into public.attendance_sessions (class_id, session_date, notes)
  values (target_class_id, target_date, nullif(btrim(session_notes), ''))
  on conflict (class_id, session_date) do update set notes = excluded.notes
  returning id into register_id;

  insert into public.attendance_records (
    session_id, class_id, session_date, student_id, status, attended_via, minutes_late, note
  )
  select register_id, target_class_id, target_date, e.student_id, e.status, e.attended_via, e.minutes_late,
         nullif(btrim(e.note), '')
  from jsonb_to_recordset(entries) as e (
    student_id uuid,
    status public.attendance_status,
    attended_via public.delivery_mode,
    minutes_late smallint,
    note text
  )
  on conflict on constraint attendance_records_one_per_student_class_date do update set
    status = excluded.status,
    attended_via = excluded.attended_via,
    minutes_late = excluded.minutes_late,
    note = excluded.note;

  return register_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reports (security invoker: every figure is computed from rows the caller may
-- read, so a teacher's report covers their classes only).
-- -----------------------------------------------------------------------------

-- Totals per student, class or teacher (a class counts for each of its
-- teachers) between two dates, optionally filtered.
create or replace function public.attendance_summary(
  date_from date,
  date_to date,
  group_by text default 'student',
  class_filter uuid default null,
  teacher_filter uuid default null,
  student_filter uuid default null
)
returns table (
  group_id uuid,
  label text,
  code text,
  sessions bigint,
  present bigint,
  late bigint,
  absent bigint,
  excused bigint,
  total bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  with facts as (
    select r.student_id, r.class_id, r.session_id, r.status
    from public.attendance_records r
    where r.session_date between date_from and date_to
      and (class_filter is null or r.class_id = class_filter)
      and (student_filter is null or r.student_id = student_filter)
      and (teacher_filter is null or exists (
        select 1 from public.class_members cm where cm.class_id = r.class_id and cm.teacher_id = teacher_filter
      ))
  ),
  keyed as (
    select f.student_id as key, f.session_id, f.status from facts f where group_by = 'student'
    union all
    select f.class_id, f.session_id, f.status from facts f where group_by = 'class'
    union all
    select cm.teacher_id, f.session_id, f.status
    from facts f join public.class_members cm on cm.class_id = f.class_id
    where group_by = 'teacher'
  ),
  grouped as (
    select
      k.key,
      count(distinct k.session_id) as sessions,
      count(*) filter (where k.status = 'present') as present,
      count(*) filter (where k.status = 'late') as late,
      count(*) filter (where k.status = 'absent') as absent,
      count(*) filter (where k.status = 'excused') as excused,
      count(*) as total
    from keyed k
    group by k.key
  )
  select
    g.key,
    coalesce(s.full_name, c.name, t.full_name, '—'),
    coalesce(s.student_code, c.code, t.teacher_code, ''),
    g.sessions, g.present, g.late, g.absent, g.excused, g.total
  from grouped g
  left join public.students s on group_by = 'student' and s.id = g.key
  left join public.classes c on group_by = 'class' and c.id = g.key
  left join public.teachers t on group_by = 'teacher' and t.id = g.key
  order by 2;
$$;

-- Weekly counts per status (weeks start on Monday) for the trend chart.
create or replace function public.attendance_trend(
  date_from date,
  date_to date,
  class_filter uuid default null,
  teacher_filter uuid default null,
  student_filter uuid default null
)
returns table (week_start date, present bigint, late bigint, absent bigint, excused bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    date_trunc('week', r.session_date)::date,
    count(*) filter (where r.status = 'present'),
    count(*) filter (where r.status = 'late'),
    count(*) filter (where r.status = 'absent'),
    count(*) filter (where r.status = 'excused')
  from public.attendance_records r
  where r.session_date between date_from and date_to
    and (class_filter is null or r.class_id = class_filter)
    and (student_filter is null or r.student_id = student_filter)
    and (teacher_filter is null or exists (
      select 1 from public.class_members cm where cm.class_id = r.class_id and cm.teacher_id = teacher_filter
    ))
  group by 1
  order by 1;
$$;

-- Absence patterns of students currently in active classes: the current run
-- of consecutive absences (excused sessions neither count nor break it) and
-- absences in the last `window_days`. The app decides what is a warning.
create or replace function public.attendance_alerts(
  class_filter uuid default null,
  student_filter uuid default null,
  window_days integer default 30
)
returns table (
  student_id uuid,
  student_name text,
  student_code text,
  class_id uuid,
  class_name text,
  consecutive_absences integer,
  recent_absences integer,
  last_absent_on date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with seated as (
    select e.student_id, e.class_id
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.status = 'active' and c.status = 'active' and c.deleted_at is null
      and (class_filter is null or e.class_id = class_filter)
      and (student_filter is null or e.student_id = student_filter)
  ),
  ranked as (
    select r.student_id, r.class_id, r.status, r.session_date,
           row_number() over (partition by r.student_id, r.class_id order by r.session_date desc) as rn
    from public.attendance_records r
    join seated st on st.student_id = r.student_id and st.class_id = r.class_id
    where r.status <> 'excused'
  ),
  patterns as (
    select
      x.student_id,
      x.class_id,
      coalesce(min(x.rn) filter (where x.status <> 'absent') - 1, count(*))::integer as consecutive_absences,
      (count(*) filter (where x.status = 'absent'
        and x.session_date > private.academy_today() - window_days))::integer as recent_absences,
      max(x.session_date) filter (where x.status = 'absent') as last_absent_on
    from ranked x
    group by x.student_id, x.class_id
  )
  select p.student_id, s.full_name, s.student_code, p.class_id, c.name,
         p.consecutive_absences, p.recent_absences, p.last_absent_on
  from patterns p
  join public.students s on s.id = p.student_id
  join public.classes c on c.id = p.class_id
  where p.consecutive_absences > 0 or p.recent_absences > 0
  order by p.consecutive_absences desc, p.recent_absences desc, s.full_name;
$$;

revoke all on function public.save_attendance(uuid, date, jsonb, text) from public, anon;
revoke all on function public.attendance_summary(date, date, text, uuid, uuid, uuid) from public, anon;
revoke all on function public.attendance_trend(date, date, uuid, uuid, uuid) from public, anon;
revoke all on function public.attendance_alerts(uuid, uuid, integer) from public, anon;
grant execute on function public.save_attendance(uuid, date, jsonb, text) to authenticated;
grant execute on function public.attendance_summary(date, date, text, uuid, uuid, uuid) to authenticated;
grant execute on function public.attendance_trend(date, date, uuid, uuid, uuid) to authenticated;
grant execute on function public.attendance_alerts(uuid, uuid, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.attendance_sessions enable row level security;
alter table public.attendance_records enable row level security;

create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
  using (private.can_read_attendance_session(class_id));
create policy attendance_sessions_insert on public.attendance_sessions for insert to authenticated
  with check (private.can_write_attendance(class_id));
create policy attendance_sessions_update on public.attendance_sessions for update to authenticated
  using (private.can_write_attendance(class_id))
  with check (private.can_write_attendance(class_id));
-- Deleting a register (e.g. taken on the wrong date) removes its records too;
-- academy-wide staff only.
create policy attendance_sessions_delete on public.attendance_sessions for delete to authenticated
  using ((select private.has_permission('attendance.write', 'all')));

create policy attendance_records_select on public.attendance_records for select to authenticated
  using (private.can_read_attendance(student_id, class_id));
create policy attendance_records_insert on public.attendance_records for insert to authenticated
  with check (private.can_write_attendance(class_id));
create policy attendance_records_update on public.attendance_records for update to authenticated
  using (private.can_write_attendance(class_id))
  with check (private.can_write_attendance(class_id));

-- Single records are corrected, never deleted.
revoke delete on public.attendance_records from authenticated;
revoke all on public.attendance_sessions, public.attendance_records from anon;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
