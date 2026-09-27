-- =============================================================================
-- Academics: subjects, levels, courses, classes, class_members, enrollments.
--
--   subject 1─* level          (e.g. Tiếng Anh → Flyers, KET)
--   subject 1─* course *─0..1 level
--   course  1─* class
--   class   *─* teacher        via class_members (lead / assistant)
--   class   *─* student        via enrollments   (the enrolment record)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Subjects
-- -----------------------------------------------------------------------------
create table public.subjects (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique check (code ~ '^[A-Z0-9-]{2,20}$'),
  name        text not null check (btrim(name) <> ''),
  description text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create trigger subjects_set_updated_at
  before update on public.subjects
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Levels (ordered within a subject)
-- -----------------------------------------------------------------------------
create table public.levels (
  id         uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects (id) on delete restrict,
  code       text not null check (code ~ '^[A-Z0-9-]{1,20}$'),
  name       text not null check (btrim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (subject_id, code),
  -- Target of the composite FK that keeps a course's level inside its subject.
  unique (id, subject_id)
);

create trigger levels_set_updated_at
  before update on public.levels
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Courses
-- -----------------------------------------------------------------------------
create table public.courses (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name            text not null check (btrim(name) <> ''),
  description     text not null default '',
  subject_id      uuid not null references public.subjects (id) on delete restrict,
  level_id        uuid,
  session_count   integer check (session_count > 0),
  session_minutes integer check (session_minutes > 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  foreign key (level_id, subject_id) references public.levels (id, subject_id) on delete restrict
);

create index courses_subject_idx on public.courses (subject_id);
create index courses_level_idx on public.courses (level_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Classes
-- -----------------------------------------------------------------------------
create type public.class_status as enum ('planned', 'active', 'completed', 'cancelled');

create table public.classes (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name          text not null check (btrim(name) <> ''),
  course_id     uuid not null references public.courses (id) on delete restrict,
  status        public.class_status not null default 'planned',
  start_date    date,
  end_date      date,
  capacity      integer check (capacity > 0),
  room          text,
  schedule_note text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check (end_date is null or start_date is null or end_date >= start_date)
);

create index classes_course_idx on public.classes (course_id);
create index classes_status_idx on public.classes (status) where deleted_at is null;

create trigger classes_set_updated_at
  before update on public.classes
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Class members (teaching staff assigned to a class)
-- -----------------------------------------------------------------------------
create type public.class_member_role as enum ('lead_teacher', 'assistant_teacher');

create table public.class_members (
  class_id    uuid not null references public.classes (id) on delete cascade,
  teacher_id  uuid not null references public.teachers (id) on delete cascade,
  member_role public.class_member_role not null default 'lead_teacher',
  assigned_on date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (class_id, teacher_id)
);

create index class_members_teacher_idx on public.class_members (teacher_id);
-- At most one lead teacher per class.
create unique index class_members_one_lead_idx
  on public.class_members (class_id) where member_role = 'lead_teacher';

create trigger class_members_set_updated_at
  before update on public.class_members
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Enrollments (a student's place in a class)
-- -----------------------------------------------------------------------------
create type public.enrollment_status as enum ('pending', 'active', 'completed', 'withdrawn');

create table public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete restrict,
  class_id    uuid not null references public.classes (id) on delete restrict,
  status      public.enrollment_status not null default 'pending',
  enrolled_on date not null default current_date,
  ended_on    date,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, class_id),
  check (ended_on is null or ended_on >= enrolled_on)
);

create index enrollments_class_idx on public.enrollments (class_id);

create trigger enrollments_set_updated_at
  before update on public.enrollments
  for each row execute function private.set_updated_at();

-- Pending + active enrolments may not exceed the class capacity. The class row
-- is locked so concurrent enrolments cannot both take the last seat.
create or replace function private.enforce_class_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_seats integer;
  taken     integer;
begin
  if new.status not in ('pending', 'active') then
    return new;
  end if;

  select capacity into max_seats from public.classes where id = new.class_id for update;
  if max_seats is null then
    return new;
  end if;

  select count(*) into taken
  from public.enrollments
  where class_id = new.class_id and status in ('pending', 'active') and id <> new.id;

  if taken >= max_seats then
    raise exception 'This class is full (capacity %).', max_seats using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger enrollments_enforce_capacity
  before insert or update of status, class_id on public.enrollments
  for each row execute function private.enforce_class_capacity();
