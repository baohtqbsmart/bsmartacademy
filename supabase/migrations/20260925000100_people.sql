-- =============================================================================
-- People: students, parents, teachers and the student <-> parent link.
--
-- Person records are separate from login accounts: a young student or a parent
-- may exist without an account. profile_id links a record to its account.
-- Soft deletion: deleted_at marks a record as removed (data-entry cleanup);
-- `status` captures real-life state (a student who left is "withdrawn").
-- =============================================================================

create type public.gender as enum ('male', 'female', 'other');
create type public.student_status as enum ('active', 'on_hold', 'graduated', 'withdrawn');
create type public.staff_status as enum ('active', 'on_leave', 'inactive');
create type public.guardian_relationship as enum ('father', 'mother', 'guardian', 'grandparent', 'other');

-- -----------------------------------------------------------------------------
-- Students
-- -----------------------------------------------------------------------------
create table public.students (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid unique references public.profiles (id) on delete set null,
  student_code  text not null unique check (student_code ~ '^[A-Z0-9-]{3,20}$'),
  full_name     text not null check (btrim(full_name) <> ''),
  date_of_birth date check (date_of_birth > date '1900-01-01'),
  gender        public.gender,
  school_name   text,
  status        public.student_status not null default 'active',
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create index students_status_idx on public.students (status) where deleted_at is null;

create trigger students_set_updated_at
  before update on public.students
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Parents / guardians
-- -----------------------------------------------------------------------------
create table public.parents (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles (id) on delete set null,
  full_name  text not null check (btrim(full_name) <> ''),
  phone      text,
  email      text,
  address    text,
  notes      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create trigger parents_set_updated_at
  before update on public.parents
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Teachers
-- -----------------------------------------------------------------------------
create table public.teachers (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid unique references public.profiles (id) on delete set null,
  teacher_code   text not null unique check (teacher_code ~ '^[A-Z0-9-]{3,20}$'),
  full_name      text not null check (btrim(full_name) <> ''),
  phone          text,
  email          text,
  specialization text,
  hired_on       date,
  status         public.staff_status not null default 'active',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

create index teachers_status_idx on public.teachers (status) where deleted_at is null;

create trigger teachers_set_updated_at
  before update on public.teachers
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Student <-> parent (many-to-many)
-- -----------------------------------------------------------------------------
create table public.student_parents (
  student_id         uuid not null references public.students (id) on delete cascade,
  parent_id          uuid not null references public.parents (id) on delete cascade,
  relationship       public.guardian_relationship not null,
  is_primary_contact boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (student_id, parent_id)
);

create index student_parents_parent_idx on public.student_parents (parent_id);
-- At most one primary contact per student.
create unique index student_parents_one_primary_idx
  on public.student_parents (student_id) where is_primary_contact;

create trigger student_parents_set_updated_at
  before update on public.student_parents
  for each row execute function private.set_updated_at();
