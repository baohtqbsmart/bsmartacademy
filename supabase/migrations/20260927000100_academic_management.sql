-- =============================================================================
-- Academic management:
--   * teachers: subjects taught, qualifications (replaces free-text specialization)
--   * courses: status, duration, reusable structure (course_units)
--   * classes: delivery mode / meeting link, weekly timetable slots
--     (replaces free-text schedule_note)
--   * integrity rules: timetable conflicts, active teachers/courses/classes only,
--     no archiving of things still in use
--   * assign_class_teacher / move_course_unit RPCs, timetable_entries view
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Teachers: subjects and qualifications
-- -----------------------------------------------------------------------------
alter table public.teachers drop column specialization;

create table public.teacher_subjects (
  teacher_id uuid not null references public.teachers (id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (teacher_id, subject_id)
);

create index teacher_subjects_subject_idx on public.teacher_subjects (subject_id);

create table public.teacher_qualifications (
  id           uuid primary key default gen_random_uuid(),
  teacher_id   uuid not null references public.teachers (id) on delete cascade,
  title        text not null check (btrim(title) <> '' and char_length(title) <= 200),
  institution  text check (char_length(institution) <= 200),
  year_awarded smallint check (year_awarded between 1950 and 2100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index teacher_qualifications_teacher_idx on public.teacher_qualifications (teacher_id);

create trigger teacher_qualifications_set_updated_at
  before update on public.teacher_qualifications
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Courses: status, duration and a reusable structure
-- -----------------------------------------------------------------------------
create type public.course_status as enum ('draft', 'active', 'inactive');

alter table public.courses
  add column status public.course_status not null default 'draft',
  add column duration_weeks integer check (duration_weeks > 0);

comment on column public.courses.status is
  'draft: being designed, hidden from non-admins; active: open for new classes; inactive: no new classes.';

-- Ordered syllabus units shared by every class of the course.
create table public.course_units (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references public.courses (id) on delete cascade,
  position      integer not null check (position > 0),
  title         text not null check (btrim(title) <> '' and char_length(title) <= 200),
  description   text not null default '' check (char_length(description) <= 2000),
  session_count integer check (session_count > 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Deferred so two units can swap positions inside one transaction.
  constraint course_units_position_key unique (course_id, position) deferrable initially deferred
);

create trigger course_units_set_updated_at
  before update on public.course_units
  for each row execute function private.set_updated_at();

-- New units are appended when no position is given.
create or replace function private.append_course_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.position is null then
    select coalesce(max(position), 0) + 1 into new.position
    from public.course_units where course_id = new.course_id;
  end if;
  return new;
end;
$$;

create trigger course_units_append
  before insert on public.course_units
  for each row execute function private.append_course_unit();

-- -----------------------------------------------------------------------------
-- Classes: delivery and weekly timetable
-- -----------------------------------------------------------------------------
create type public.delivery_mode as enum ('in_person', 'online', 'hybrid');

alter table public.classes
  drop column schedule_note,
  add column delivery_mode public.delivery_mode not null default 'in_person',
  add column meeting_url text check (meeting_url ~* '^https://[^\s]+$');

-- ISO weekday (1 = Monday ... 7 = Sunday); times are academy-local.
create table public.class_schedule_slots (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes (id) on delete cascade,
  weekday    smallint not null check (weekday between 1 and 7),
  starts_at  time not null,
  ends_at    time not null,
  room       text check (char_length(room) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (class_id, weekday, starts_at)
);

comment on column public.class_schedule_slots.room is 'Overrides the class room for this slot.';

create index class_schedule_slots_weekday_idx on public.class_schedule_slots (weekday, starts_at);

create trigger class_schedule_slots_set_updated_at
  before update on public.class_schedule_slots
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Timetable conflicts: no teacher and no room may be in two places at once.
-- Only planned/active, non-archived classes whose date ranges overlap count.
-- Runs after every change that can create a clash (slots, teacher
-- assignments, class dates/room/status). The advisory lock serialises
-- concurrent timetable writes so two transactions cannot both pass.
-- -----------------------------------------------------------------------------
create or replace function private.assert_no_timetable_conflicts(target_class_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  clash record;
  day_names constant text[] := array['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
begin
  perform pg_advisory_xact_lock(hashtext('bsmart.timetable'));

  select
    s.weekday,
    other.name as other_class,
    to_char(s2.starts_at, 'HH24:MI') as other_start,
    to_char(s2.ends_at, 'HH24:MI') as other_end,
    coalesce(s.room, c.room) as room,
    (c.delivery_mode <> 'online' and other.delivery_mode <> 'online'
      and coalesce(s.room, c.room) is not null
      and lower(coalesce(s.room, c.room)) = lower(coalesce(s2.room, other.room))) as same_room,
    (select t.full_name
       from public.class_members a
       join public.class_members b on b.teacher_id = a.teacher_id
       join public.teachers t on t.id = a.teacher_id
      where a.class_id = c.id and b.class_id = other.id
      limit 1) as shared_teacher
  into clash
  from public.class_schedule_slots s
  join public.classes c on c.id = s.class_id
  join public.class_schedule_slots s2
    on s2.weekday = s.weekday
   and s2.class_id <> s.class_id
   and s2.starts_at < s.ends_at
   and s.starts_at < s2.ends_at
  join public.classes other on other.id = s2.class_id
  where s.class_id = target_class_id
    and c.deleted_at is null and c.status in ('planned', 'active')
    and other.deleted_at is null and other.status in ('planned', 'active')
    and daterange(coalesce(c.start_date, '-infinity'::date), coalesce(c.end_date, 'infinity'::date), '[]')
        && daterange(coalesce(other.start_date, '-infinity'::date), coalesce(other.end_date, 'infinity'::date), '[]')
    and (
      (c.delivery_mode <> 'online' and other.delivery_mode <> 'online'
        and coalesce(s.room, c.room) is not null
        and lower(coalesce(s.room, c.room)) = lower(coalesce(s2.room, other.room)))
      or exists (
        select 1 from public.class_members a
        join public.class_members b on b.teacher_id = a.teacher_id
        where a.class_id = c.id and b.class_id = other.id
      )
    )
  limit 1;

  if not found then
    return;
  end if;

  if clash.same_room then
    raise exception 'Room % is already booked for % on % %–%.',
      clash.room, clash.other_class, day_names[clash.weekday], clash.other_start, clash.other_end
      using errcode = '23P01';
  end if;
  raise exception '% already teaches % on % %–%.',
    clash.shared_teacher, clash.other_class, day_names[clash.weekday], clash.other_start, clash.other_end
    using errcode = '23P01';
end;
$$;

-- Trigger wrapper; TG_ARGV[0] names the column holding the class id.
create or replace function private.check_timetable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_no_timetable_conflicts((to_jsonb(new) ->> tg_argv[0])::uuid);
  return null;
end;
$$;

create trigger class_schedule_slots_check_timetable
  after insert or update on public.class_schedule_slots
  for each row execute function private.check_timetable('class_id');

create trigger class_members_check_timetable
  after insert or update on public.class_members
  for each row execute function private.check_timetable('class_id');

create trigger classes_check_timetable
  after update of start_date, end_date, room, status, deleted_at, delivery_mode on public.classes
  for each row execute function private.check_timetable('id');

-- -----------------------------------------------------------------------------
-- Integrity rules
-- -----------------------------------------------------------------------------

-- Only active, non-archived teachers can be assigned to classes.
create or replace function private.enforce_assignable_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.teachers
    where id = new.teacher_id and deleted_at is null and status = 'active'
  ) then
    raise exception 'Only active teachers can be assigned to classes.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger class_members_enforce_teacher
  before insert or update of teacher_id on public.class_members
  for each row execute function private.enforce_assignable_teacher();

-- A teacher who still teaches planned/running classes cannot be archived or
-- made inactive; reassign the classes first.
create or replace function private.guard_teacher_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if ((new.deleted_at is not null and old.deleted_at is null)
      or (new.status = 'inactive' and old.status <> 'inactive'))
     and exists (
       select 1 from public.class_members cm
       join public.classes c on c.id = cm.class_id
       where cm.teacher_id = new.id and c.deleted_at is null and c.status in ('planned', 'active')
     ) then
    raise exception 'This teacher still teaches planned or running classes. Reassign them first.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger teachers_guard_deactivation
  before update of deleted_at, status on public.teachers
  for each row execute function private.guard_teacher_deactivation();

-- New classes (or a class moved to another course) need an active course.
create or replace function private.enforce_class_course()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.course_id is distinct from old.course_id)
     and not exists (
       select 1 from public.courses
       where id = new.course_id and deleted_at is null and status = 'active'
     ) then
    raise exception 'Classes can only be created for active courses.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger classes_enforce_course
  before insert or update of course_id on public.classes
  for each row execute function private.enforce_class_course();

-- A course with planned/running classes cannot be archived or deactivated.
create or replace function private.guard_course_retirement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if ((new.deleted_at is not null and old.deleted_at is null)
      or (new.status <> 'active' and old.status = 'active'))
     and exists (
       select 1 from public.classes
       where course_id = new.id and deleted_at is null and status in ('planned', 'active')
     ) then
    raise exception 'This course still has planned or running classes.' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger courses_guard_retirement
  before update of deleted_at, status on public.courses
  for each row execute function private.guard_course_retirement();

-- Subjects and levels in use by live courses cannot be archived.
create or replace function private.guard_catalogue_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null
     and exists (
       select 1 from public.courses
       where deleted_at is null
         and (case tg_table_name when 'subjects' then subject_id else level_id end) = new.id
     ) then
    raise exception 'This % is still used by courses. Archive those courses first.',
      case tg_table_name when 'subjects' then 'subject' else 'level' end
      using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger subjects_guard_archive
  before update of deleted_at on public.subjects
  for each row execute function private.guard_catalogue_archive();

create trigger levels_guard_archive
  before update of deleted_at on public.levels
  for each row execute function private.guard_catalogue_archive();

-- Enrolments: capacity (unchanged) plus only planned/running classes.
create or replace function private.enforce_class_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target record;
  taken integer;
begin
  if new.status not in ('pending', 'active') then
    return new;
  end if;

  select capacity, status, deleted_at into target from public.classes where id = new.class_id for update;
  if target.deleted_at is not null or target.status not in ('planned', 'active') then
    raise exception 'Students can only be enrolled in planned or running classes.' using errcode = '22023';
  end if;
  if target.capacity is null then
    return new;
  end if;

  select count(*) into taken
  from public.enrollments
  where class_id = new.class_id and status in ('pending', 'active') and id <> new.id;

  if taken >= target.capacity then
    raise exception 'This class is full (capacity %).', target.capacity using errcode = '23514';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- Assigns (or changes the role of) a teacher. Making someone lead demotes the
-- current lead to assistant in the same transaction.
create or replace function public.assign_class_teacher(
  target_class_id uuid,
  target_teacher_id uuid,
  new_role public.class_member_role default 'lead_teacher'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.has_permission('classes.write') then
    raise exception 'You do not have permission to manage classes.' using errcode = '42501';
  end if;

  if new_role = 'lead_teacher' then
    update public.class_members
    set member_role = 'assistant_teacher'
    where class_id = target_class_id and member_role = 'lead_teacher' and teacher_id <> target_teacher_id;
  end if;

  insert into public.class_members (class_id, teacher_id, member_role)
  values (target_class_id, target_teacher_id, new_role)
  on conflict (class_id, teacher_id) do update set member_role = excluded.member_role;
end;
$$;

-- Swaps a unit with its neighbour ('up' or 'down').
create or replace function public.move_course_unit(target_unit_id uuid, direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  unit public.course_units;
  neighbour public.course_units;
begin
  if not private.has_permission('courses.write') then
    raise exception 'You do not have permission to manage courses.' using errcode = '42501';
  end if;
  if direction not in ('up', 'down') then
    raise exception 'Direction must be up or down.' using errcode = '22023';
  end if;

  select * into unit from public.course_units where id = target_unit_id for update;
  if not found then
    raise exception 'Unit not found.' using errcode = 'P0002';
  end if;

  select * into neighbour from public.course_units
  where course_id = unit.course_id
    and case direction when 'up' then position < unit.position else position > unit.position end
  order by case direction when 'up' then -position else position end
  limit 1
  for update;
  if not found then
    return;
  end if;

  update public.course_units set position = neighbour.position where id = unit.id;
  update public.course_units set position = unit.position where id = neighbour.id;
end;
$$;

revoke all on function public.assign_class_teacher(uuid, uuid, public.class_member_role) from public, anon;
revoke all on function public.move_course_unit(uuid, text) from public, anon;
grant execute on function public.assign_class_teacher(uuid, uuid, public.class_member_role) to authenticated;
grant execute on function public.move_course_unit(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Timetable view (security invoker: each role sees only its classes)
-- -----------------------------------------------------------------------------
create view public.timetable_entries with (security_invoker = true) as
select
  s.id as slot_id,
  s.class_id,
  s.weekday,
  s.starts_at,
  s.ends_at,
  coalesce(s.room, c.room) as room,
  c.code as class_code,
  c.name as class_name,
  c.status as class_status,
  c.start_date,
  c.end_date,
  c.delivery_mode,
  c.meeting_url,
  co.name as course_name,
  sub.name as subject_name,
  coalesce(staff.teacher_ids, '{}') as teacher_ids,
  staff.lead_teacher_name
from public.class_schedule_slots s
join public.classes c on c.id = s.class_id
join public.courses co on co.id = c.course_id
left join public.subjects sub on sub.id = co.subject_id
left join lateral (
  select array_agg(cm.teacher_id) as teacher_ids,
         max(t.full_name) filter (where cm.member_role = 'lead_teacher') as lead_teacher_name
  from public.class_members cm
  left join public.teachers t on t.id = cm.teacher_id
  where cm.class_id = c.id
) staff on true
where c.deleted_at is null and c.status in ('planned', 'active');

revoke all on public.timetable_entries from anon;
revoke insert, update, delete on public.timetable_entries from authenticated;
grant select on public.timetable_entries to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.teacher_subjects enable row level security;
alter table public.teacher_qualifications enable row level security;
alter table public.course_units enable row level security;
alter table public.class_schedule_slots enable row level security;

-- Visible wherever the parent record is visible (sub-selects run under RLS).
create policy teacher_subjects_select on public.teacher_subjects for select to authenticated
  using (exists (select 1 from public.teachers t where t.id = teacher_id));
create policy teacher_subjects_write on public.teacher_subjects for all to authenticated
  using ((select private.has_permission('teachers.write')))
  with check ((select private.has_permission('teachers.write')));

create policy teacher_qualifications_select on public.teacher_qualifications for select to authenticated
  using (exists (select 1 from public.teachers t where t.id = teacher_id));
create policy teacher_qualifications_write on public.teacher_qualifications for all to authenticated
  using ((select private.has_permission('teachers.write')))
  with check ((select private.has_permission('teachers.write')));

create policy course_units_select on public.course_units for select to authenticated
  using (exists (select 1 from public.courses c where c.id = course_id));
create policy course_units_write on public.course_units for all to authenticated
  using ((select private.has_permission('courses.write')))
  with check ((select private.has_permission('courses.write')));

create policy class_schedule_slots_select on public.class_schedule_slots for select to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id));
create policy class_schedule_slots_write on public.class_schedule_slots for all to authenticated
  using ((select private.has_permission('classes.write')))
  with check ((select private.has_permission('classes.write')));

-- Draft courses are visible only to course editors.
drop policy courses_select on public.courses;
create policy courses_select on public.courses for select to authenticated using (
  (select private.has_permission('courses.write'))
  or (deleted_at is null and status <> 'draft' and (select private.has_permission('courses.read', 'all')))
);

revoke all on public.teacher_subjects, public.teacher_qualifications, public.course_units,
  public.class_schedule_slots from anon;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Internal notes are staff-only. RLS decides which rows a role sees, not which
-- columns, so the notes columns are withheld from API roles and served through
-- permission-checked functions instead.
-- -----------------------------------------------------------------------------
-- Delivery details: online and hybrid classes need a meeting link.
alter table public.classes
  add constraint classes_meeting_url_required
  check (delivery_mode = 'in_person' or meeting_url is not null);

revoke select on public.students from authenticated;
grant select (id, profile_id, student_code, full_name, date_of_birth, gender, school_name, status,
              phone, email, address, joined_on, english_level_code, target_level_code, avatar_path,
              created_at, updated_at, deleted_at)
  on public.students to authenticated;

revoke select on public.teachers from authenticated;
grant select (id, profile_id, teacher_code, full_name, phone, email, hired_on, status,
              created_at, updated_at, deleted_at)
  on public.teachers to authenticated;

revoke select on public.parents from authenticated;
grant select (id, profile_id, full_name, phone, email, address, created_at, updated_at, deleted_at)
  on public.parents to authenticated;

-- Admins and the student's teachers; never the student or their parents.
create or replace function public.student_notes(target_student_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.notes
  from public.students s
  where s.id = target_student_id
    and ((select private.has_permission('students.write')) or private.teaches_student(s.id));
$$;

create or replace function public.teacher_notes(target_teacher_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select t.notes
  from public.teachers t
  where t.id = target_teacher_id and (select private.has_permission('teachers.write'));
$$;

revoke all on function public.student_notes(uuid) from public, anon;
revoke all on function public.teacher_notes(uuid) from public, anon;
grant execute on function public.student_notes(uuid) to authenticated;
grant execute on function public.teacher_notes(uuid) to authenticated;
