-- =============================================================================
-- Assignments and submissions.
--
--   assignments             work set for a class; lifecycle draft -> scheduled ->
--                           published -> closed -> archived
--   assignment_questions    optional questions (multiple choice / short / long)
--   assignment_answer_keys  answers, readable by the assignment's editors only
--   assignment_attachments  teacher files (worksheets, audio...)
--   submissions             one row per attempt; locked once submitted
--   submission_files        files a student uploads with an attempt
--   submission_grades       score + feedback; students see them once returned
--   submission_events       history: started, submitted, graded, returned...
--
-- A "scheduled" assignment becomes visible at publish_at without any job: the
-- visibility rule compares publish_at with now().
-- =============================================================================

insert into public.permissions (code, description) values
  ('assignments.read',  'View assignments and submissions'),
  ('assignments.write', 'Create, publish and grade assignments'),
  ('submissions.write', 'Work on and submit assignments');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'assignments.read',  'all'),
  ('super_admin', 'assignments.write', 'all'),
  ('admin',       'assignments.read',  'all'),
  ('admin',       'assignments.write', 'all'),
  ('teacher',     'assignments.read',  'assigned'),
  ('teacher',     'assignments.write', 'assigned'),
  ('student',     'assignments.read',  'own'),
  ('student',     'submissions.write', 'own'),
  ('parent',      'assignments.read',  'children');

create type public.assignment_type as enum (
  'homework', 'worksheet', 'vocabulary', 'grammar', 'reading', 'listening',
  'speaking', 'writing', 'project', 'quiz', 'test'
);
create type public.assignment_skill as enum (
  'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing',
  'pronunciation', 'problem_solving', 'mixed'
);
create type public.assignment_status as enum ('draft', 'scheduled', 'published', 'closed', 'archived');
create type public.question_kind as enum ('multiple_choice', 'short_answer', 'long_answer');
create type public.submission_status as enum ('in_progress', 'submitted', 'graded', 'returned');
create type public.submission_event as enum (
  'started', 'submitted', 'graded', 'returned', 'resubmission_allowed', 'resubmission_revoked'
);

-- -----------------------------------------------------------------------------
-- Upload rules: the single list of accepted file types (the storage bucket, the
-- storage policies, the metadata checks and the app all use it).
-- -----------------------------------------------------------------------------
create table public.upload_file_types (
  mime_type  text primary key,
  extensions text[] not null check (cardinality(extensions) > 0),
  label      text not null
);

insert into public.upload_file_types (mime_type, extensions, label) values
  ('application/pdf', '{pdf}', 'PDF'),
  ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', '{docx}', 'Word document'),
  ('application/vnd.openxmlformats-officedocument.presentationml.presentation', '{pptx}', 'PowerPoint'),
  ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '{xlsx}', 'Excel workbook'),
  ('text/plain', '{txt}', 'Text file'),
  ('image/png', '{png}', 'PNG image'),
  ('image/jpeg', '{jpg,jpeg}', 'JPEG image'),
  ('image/webp', '{webp}', 'WebP image'),
  ('audio/mpeg', '{mp3}', 'MP3 audio'),
  ('audio/mp4', '{m4a}', 'M4A audio'),
  ('audio/wav', '{wav}', 'WAV audio'),
  ('audio/webm', '{webm}', 'WebM recording'),
  ('video/mp4', '{mp4}', 'MP4 video');

alter table public.upload_file_types enable row level security;
create policy upload_file_types_select on public.upload_file_types for select to authenticated using (true);
revoke insert, update, delete on public.upload_file_types from authenticated;

-- 20 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-files', 'assignment-files', false, 20971520, array(select mime_type from public.upload_file_types))
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Assignments
-- -----------------------------------------------------------------------------
create table public.assignments (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.classes (id) on delete restrict,
  title              text not null check (btrim(title) <> '' and char_length(title) <= 200),
  assignment_type    public.assignment_type not null,
  skill              public.assignment_skill,
  description        text check (char_length(description) <= 5000),
  instructions       text check (char_length(instructions) <= 10000),
  status             public.assignment_status not null default 'draft',
  publish_at         timestamptz,
  published_at       timestamptz,
  due_at             timestamptz,
  time_limit_minutes integer check (time_limit_minutes between 1 and 600),
  max_score          numeric(6, 2) not null default 10 check (max_score > 0 and max_score <= 1000),
  allow_late         boolean not null default true,
  requires_file      boolean not null default false,
  closed_at          timestamptz,
  archived_at        timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (status <> 'scheduled' or publish_at is not null)
);

comment on column public.assignments.class_id is
  'Course and level come from the class (not duplicated).';
comment on column public.assignments.status is
  'Stored lifecycle state. A scheduled assignment whose publish_at has passed is effectively published.';

create index assignments_class_idx on public.assignments (class_id);
create index assignments_due_idx on public.assignments (due_at);

create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function private.set_updated_at();

-- Released = visible to students and parents.
create or replace function private.assignment_released(s public.assignment_status, release_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select s in ('published', 'closed') or (s = 'scheduled' and release_at <= now());
$$;

-- The state the rules reason about: a released scheduled assignment is published.
create or replace function private.assignment_effective_status(s public.assignment_status, release_at timestamptz)
returns public.assignment_status
language sql
stable
set search_path = ''
as $$
  select case when s = 'scheduled' and release_at <= now() then 'published'::public.assignment_status else s end;
$$;

-- Edit assignments of a class: everywhere, or in the classes one teaches.
create or replace function private.can_write_class_assignments(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('assignments.write', 'all')
    or (private.has_permission('assignments.write', 'assigned') and private.is_class_teacher(target_class_id));
$$;

-- Lifecycle, ownership and dates. Allowed moves (from the effective state):
--   draft     -> scheduled | published | archived
--   scheduled -> draft | published | archived
--   published -> closed | archived
--   closed    -> published | archived
--   archived  -> closed (if it was ever published) | draft (if not)
create or replace function private.prepare_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  klass public.classes;
  old_state public.assignment_status;
  new_state public.assignment_status := new.status;
  release timestamptz;
begin
  if tg_op = 'INSERT' then
    select * into klass from public.classes where id = new.class_id;
    if not found or klass.deleted_at is not null or klass.status not in ('planned', 'active') then
      raise exception 'Assignments can only be set for planned or running classes.' using errcode = '22023';
    end if;
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    new.published_at := null;
    new.closed_at := null;
    new.archived_at := null;
    old_state := 'draft';
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    old_state := private.assignment_effective_status(old.status, old.publish_at);

    if new.class_id <> old.class_id and (old.published_at is not null
        or exists (select 1 from public.submissions s where s.assignment_id = old.id)) then
      raise exception 'The class cannot change once the assignment has been published.' using errcode = '22023';
    end if;
    if old.status = 'archived' and new.status = 'archived' then
      raise exception 'Restore the assignment before editing it.' using errcode = '22023';
    end if;
    if new.max_score < old.max_score and exists (
      select 1 from public.submission_grades g join public.submissions s on s.id = g.submission_id
      where s.assignment_id = old.id and g.score > new.max_score
    ) then
      raise exception 'Some grades are higher than the new maximum score.' using errcode = '22023';
    end if;
  end if;

  if new.status is distinct from (case when tg_op = 'INSERT' then 'draft' else old.status end)
     or (tg_op = 'INSERT' and new.status <> 'draft') then
    if not (
      old_state = new_state
      or (old_state = 'draft'     and new_state in ('draft', 'scheduled', 'published', 'archived'))
      or (old_state = 'scheduled' and new_state in ('draft', 'scheduled', 'published', 'archived'))
      or (old_state = 'published' and new_state in ('closed', 'archived'))
      or (old_state = 'closed'    and new_state in ('published', 'archived'))
      or (old_state = 'archived'  and (
            (new_state = 'closed' and old.published_at is not null)
         or (new_state = 'draft' and old.published_at is null)))
    ) then
      raise exception 'An assignment cannot go from % to %.', old_state, new_state using errcode = '22023';
    end if;

    if new_state in ('scheduled', 'published') and old_state in ('draft', 'scheduled') then
      if coalesce(btrim(new.instructions), '') = '' and coalesce(btrim(new.description), '') = '' then
        raise exception 'Add instructions before publishing.' using errcode = '22023';
      end if;
      release := case when new_state = 'scheduled' then new.publish_at else now() end;
      if new_state = 'scheduled' and new.publish_at <= now() then
        raise exception 'Choose a publication time in the future.' using errcode = '22023';
      end if;
      if new.due_at is not null and new.due_at <= release then
        raise exception 'The due date must be after the publication time.' using errcode = '22023';
      end if;
    end if;

    case new_state
      when 'published' then
        new.published_at := coalesce(new.published_at, now());
        new.publish_at := coalesce(new.publish_at, now());
        new.closed_at := null;
        new.archived_at := null;
      when 'scheduled' then
        new.published_at := null;
      when 'draft' then
        new.publish_at := null;
        new.archived_at := null;
      when 'closed' then
        new.closed_at := now();
        new.archived_at := null;
      when 'archived' then
        new.archived_at := now();
    end case;
  end if;

  if tg_op = 'UPDATE' and old.status = 'scheduled' and new.status = 'scheduled' then
    if old.publish_at <= now() then
      -- Already released: stored as published from now on.
      new.status := 'published';
      new.publish_at := old.publish_at;
      new.published_at := coalesce(new.published_at, old.publish_at);
    elsif new.publish_at is distinct from old.publish_at and new.publish_at <= now() then
      raise exception 'Choose a publication time in the future.' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

create trigger assignments_prepare
  before insert or update on public.assignments
  for each row execute function private.prepare_assignment();

-- -----------------------------------------------------------------------------
-- Questions and answer keys
-- -----------------------------------------------------------------------------
create table public.assignment_questions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  position      integer not null check (position > 0),
  kind          public.question_kind not null,
  prompt        text not null check (btrim(prompt) <> '' and char_length(prompt) <= 2000),
  options       text[],
  points        numeric(6, 2) not null default 1 check (points > 0 and points <= 1000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint assignment_questions_position_unique unique (assignment_id, position) deferrable initially deferred,
  check ((kind = 'multiple_choice') = (options is not null)),
  check (options is null or cardinality(options) between 2 and 8)
);

create trigger assignment_questions_set_updated_at
  before update on public.assignment_questions
  for each row execute function private.set_updated_at();

create table public.assignment_answer_keys (
  question_id      uuid primary key references public.assignment_questions (id) on delete cascade,
  correct_option   integer check (correct_option >= 0),
  accepted_answers text[],
  explanation      text check (char_length(explanation) <= 5000),
  updated_at       timestamptz not null default now()
);

comment on table public.assignment_answer_keys is
  'Readable only by the assignment''s editors (never by students or parents).';

-- Questions are frozen once a student has started: answers refer to them.
create or replace function private.guard_assignment_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := coalesce(new.assignment_id, old.assignment_id);
begin
  if tg_op = 'UPDATE' and new.assignment_id <> old.assignment_id then
    raise exception 'Questions cannot move to another assignment.' using errcode = '22023';
  end if;
  if exists (select 1 from public.submissions s where s.assignment_id = target) then
    raise exception 'Questions cannot change once students have started the assignment.' using errcode = '22023';
  end if;
  if exists (select 1 from public.assignments a where a.id = target and a.status = 'archived') then
    raise exception 'Restore the assignment before editing it.' using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger assignment_questions_guard
  before insert or update or delete on public.assignment_questions
  for each row execute function private.guard_assignment_questions();

create or replace function private.check_answer_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  question public.assignment_questions;
begin
  select * into question from public.assignment_questions where id = new.question_id;
  if question.kind = 'multiple_choice' then
    if new.correct_option is null or new.correct_option >= cardinality(question.options) then
      raise exception 'Choose one of the question''s options as the correct answer.' using errcode = '22023';
    end if;
    new.accepted_answers := null;
  elsif question.kind = 'short_answer' then
    new.accepted_answers := array(
      select distinct btrim(a) from unnest(coalesce(new.accepted_answers, '{}')) a where btrim(a) <> ''
    );
    if cardinality(new.accepted_answers) = 0 then
      raise exception 'Give at least one accepted answer.' using errcode = '22023';
    end if;
    new.correct_option := null;
  else
    new.correct_option := null;
    new.accepted_answers := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger assignment_answer_keys_check
  before insert or update on public.assignment_answer_keys
  for each row execute function private.check_answer_key();

-- -----------------------------------------------------------------------------
-- Files (shared validation)
-- -----------------------------------------------------------------------------

-- True when an object name ends in an accepted extension.
create or replace function private.is_allowed_upload_name(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.upload_file_types t, unnest(t.extensions) e
    where lower(object_name) like '%.' || e
  );
$$;

-- A file record must describe an object that was really uploaded under the
-- owner's folder, with an accepted type whose extension matches, within the
-- size limit, and agreeing with what Storage recorded.
create or replace function private.validate_upload(
  object_path text,
  folder text,
  file_name text,
  mime text,
  size_bytes bigint
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  ext text := lower(substring(file_name from '\.([A-Za-z0-9]+)$'));
  obj record;
begin
  if not exists (select 1 from public.upload_file_types t where t.mime_type = mime and ext = any (t.extensions)) then
    raise exception 'This file type is not allowed.' using errcode = '22023';
  end if;
  if object_path is null or object_path !~ ('^' || folder || '/[0-9a-f-]{36}\.' || ext || '$') then
    raise exception 'The file was uploaded to the wrong place.' using errcode = '22023';
  end if;
  if size_bytes < 1 or size_bytes > 20971520 then
    raise exception 'Files must be 20 MB or smaller.' using errcode = '22023';
  end if;

  select o.metadata into obj from storage.objects o where o.bucket_id = 'assignment-files' and o.name = object_path;
  if not found then
    raise exception 'The uploaded file was not found.' using errcode = 'P0002';
  end if;
  if obj.metadata is not null then
    if obj.metadata ? 'size' and (obj.metadata ->> 'size')::bigint <> size_bytes then
      raise exception 'The file size does not match the upload.' using errcode = '22023';
    end if;
    if obj.metadata ? 'mimetype' and obj.metadata ->> 'mimetype' <> mime then
      raise exception 'The file type does not match the upload.' using errcode = '22023';
    end if;
  end if;
end;
$$;

create table public.assignment_attachments (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  object_path   text not null unique,
  file_name     text not null check (btrim(file_name) <> '' and char_length(file_name) <= 200 and file_name !~ '[/\\[:cntrl:]]'),
  mime_type     text not null references public.upload_file_types (mime_type),
  size_bytes    bigint not null check (size_bytes between 1 and 20971520),
  uploaded_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index assignment_attachments_assignment_idx on public.assignment_attachments (assignment_id);

create or replace function private.prepare_assignment_attachment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.validate_upload(new.object_path, 'assignments/' || new.assignment_id, new.file_name, new.mime_type, new.size_bytes);
  if (select count(*) from public.assignment_attachments where assignment_id = new.assignment_id) >= 10 then
    raise exception 'An assignment can have at most 10 attachments.' using errcode = '22023';
  end if;
  new.uploaded_by := (select auth.uid());
  return new;
end;
$$;

create trigger assignment_attachments_prepare
  before insert on public.assignment_attachments
  for each row execute function private.prepare_assignment_attachment();

-- -----------------------------------------------------------------------------
-- Submissions
-- -----------------------------------------------------------------------------
create table public.submissions (
  id                   uuid primary key default gen_random_uuid(),
  assignment_id        uuid not null references public.assignments (id) on delete restrict,
  student_id           uuid not null references public.students (id) on delete restrict,
  attempt              integer not null default 1 check (attempt >= 1),
  status               public.submission_status not null default 'in_progress',
  answers              jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  response_text        text check (char_length(response_text) <= 20000),
  started_at           timestamptz not null default now(),
  deadline_at          timestamptz,
  submitted_at         timestamptz,
  is_late              boolean not null default false,
  resubmission_allowed boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint submissions_one_per_attempt unique (assignment_id, student_id, attempt),
  check ((status = 'in_progress') = (submitted_at is null))
);

comment on column public.submissions.deadline_at is 'started_at + the time limit, for timed quizzes and tests.';

-- At most one attempt in progress per student and assignment.
create unique index submissions_one_open_attempt on public.submissions (assignment_id, student_id)
  where status = 'in_progress';
create index submissions_student_idx on public.submissions (student_id);

create trigger submissions_set_updated_at
  before update on public.submissions
  for each row execute function private.set_updated_at();

-- Work in progress: answers must refer to this assignment's questions, and a
-- timed attempt cannot be changed after its deadline (1 minute of grace).
create or replace function private.check_submission_work()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.answers is distinct from old.answers or new.response_text is distinct from old.response_text then
    if old.status <> 'in_progress' then
      raise exception 'This submission has been handed in and can no longer be changed.' using errcode = '42501';
    end if;
    if old.deadline_at is not null and now() > old.deadline_at + interval '1 minute' then
      raise exception 'Time is up for this attempt. Submit what you have saved.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(new.answers) e
      where not exists (
        select 1 from public.assignment_questions q where q.id::text = e.key and q.assignment_id = new.assignment_id
      )
    ) then
      raise exception 'The answers refer to an unknown question.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(new.answers) e
      where jsonb_typeof(e.value) <> 'object'
         or not (e.value ? 'choice' or e.value ? 'text')
         or (e.value ? 'choice' and jsonb_typeof(e.value -> 'choice') <> 'number')
         or char_length(e.value ->> 'text') > 5000
    ) then
      raise exception 'The answers are not in the expected format.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger submissions_check_work
  before update on public.submissions
  for each row execute function private.check_submission_work();

create table public.submission_files (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  object_path   text not null unique,
  file_name     text not null check (btrim(file_name) <> '' and char_length(file_name) <= 200 and file_name !~ '[/\\[:cntrl:]]'),
  mime_type     text not null references public.upload_file_types (mime_type),
  size_bytes    bigint not null check (size_bytes between 1 and 20971520),
  created_at    timestamptz not null default now()
);

create index submission_files_submission_idx on public.submission_files (submission_id);

create or replace function private.prepare_submission_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.submissions s where s.id = old.submission_id and s.status <> 'in_progress') then
      raise exception 'Files of a handed-in submission cannot be removed.' using errcode = '42501';
    end if;
    return old;
  end if;
  if not exists (select 1 from public.submissions s where s.id = new.submission_id and s.status = 'in_progress') then
    raise exception 'Files can only be added before submitting.' using errcode = '42501';
  end if;
  perform private.validate_upload(new.object_path, 'submissions/' || new.submission_id, new.file_name, new.mime_type, new.size_bytes);
  if (select count(*) from public.submission_files where submission_id = new.submission_id) >= 5 then
    raise exception 'You can attach at most 5 files.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger submission_files_prepare
  before insert or delete on public.submission_files
  for each row execute function private.prepare_submission_file();

create table public.submission_grades (
  submission_id  uuid primary key references public.submissions (id) on delete cascade,
  score          numeric(6, 2) not null check (score >= 0),
  feedback       text check (char_length(feedback) <= 5000),
  graded_by      uuid references public.profiles (id) on delete set null,
  graded_by_name text not null default '',
  graded_at      timestamptz not null default now(),
  returned_at    timestamptz
);

comment on column public.submission_grades.returned_at is
  'When the grade was published to the student; NULL = not visible to students or parents yet.';

create table public.submission_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  event         public.submission_event not null,
  detail        text,
  actor_id      uuid references public.profiles (id) on delete set null,
  actor_name    text not null default '',
  created_at    timestamptz not null default now()
);

create index submission_events_submission_idx on public.submission_events (submission_id, created_at);

create or replace function private.log_submission_event(target uuid, what public.submission_event, info text default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.submission_events (submission_id, event, detail, actor_id, actor_name)
  values (target, what, info, (select auth.uid()),
          coalesce((select full_name from public.profiles where id = (select auth.uid())), ''));
$$;

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------

-- Reading one student's submission for one assignment.
create or replace function private.can_read_submission(target_student_id uuid, target_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('assignments.read', 'all')
    or (
      exists (select 1 from public.students s where s.id = target_student_id and s.deleted_at is null)
      and (
        (private.has_permission('assignments.read', 'assigned')
          and exists (select 1 from public.assignments a where a.id = target_assignment_id and private.is_class_teacher(a.class_id))
          and private.teaches_student(target_student_id))
        or (private.has_permission('assignments.read', 'own') and target_student_id = private.current_student_id())
        or (private.has_permission('assignments.read', 'children') and private.is_parent_of(target_student_id))
      )
    );
$$;

-- Grading: an editor of the assignment's class who can see the student.
create or replace function private.can_grade_submission(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.submissions s
    join public.assignments a on a.id = s.assignment_id
    where s.id = target_submission_id
      and private.can_write_class_assignments(a.class_id)
      and (private.has_permission('assignments.write', 'all') or private.teaches_student(s.student_id))
  );
$$;

create or replace function private.owns_open_submission(target_submission_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('submissions.write', 'own') and exists (
    select 1 from public.submissions s
    where s.id::text = target_submission_id
      and s.status = 'in_progress'
      and s.student_id = private.current_student_id()
  );
$$;

create or replace function private.can_edit_assignment_files(target_assignment_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assignments a
    where a.id::text = target_assignment_id
      and a.status <> 'archived'
      and private.can_write_class_assignments(a.class_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- Student RPCs
-- -----------------------------------------------------------------------------

-- Starts (or continues) the caller's attempt. A new attempt after a handed-in
-- one needs the teacher's permission to resubmit; it starts from the previous
-- answers.
create or replace function public.start_submission(target_assignment_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  work public.assignments;
  latest public.submissions;
  has_latest boolean;
  new_id uuid;
begin
  if me is null or not private.has_permission('submissions.write', 'own') then
    raise exception 'Only students can work on assignments.' using errcode = '42501';
  end if;

  select * into work from public.assignments where id = target_assignment_id;
  if not found or not private.assignment_released(work.status, work.publish_at) or not private.is_class_student(work.class_id) then
    raise exception 'Assignment not found.' using errcode = 'P0002';
  end if;

  select * into latest from public.submissions
  where assignment_id = work.id and student_id = me
  order by attempt desc limit 1
  for update;
  has_latest := found;

  if has_latest and latest.status = 'in_progress' then
    return latest.id;
  end if;
  if private.assignment_effective_status(work.status, work.publish_at) <> 'published' then
    raise exception 'This assignment is closed.' using errcode = '22023';
  end if;
  if has_latest and not latest.resubmission_allowed then
    raise exception 'You have already submitted this assignment.' using errcode = '22023';
  end if;
  if not has_latest and work.due_at is not null and now() > work.due_at and not work.allow_late then
    raise exception 'The due date has passed.' using errcode = '22023';
  end if;

  insert into public.submissions (assignment_id, student_id, attempt, answers, response_text, deadline_at)
  values (
    work.id, me, coalesce(latest.attempt, 0) + 1,
    coalesce(latest.answers, '{}'), latest.response_text,
    case when work.time_limit_minutes is not null then now() + make_interval(mins => work.time_limit_minutes) end
  )
  returning id into new_id;

  perform private.log_submission_event(new_id, 'started',
    case when latest.id is not null then 'Attempt ' || (latest.attempt + 1) end);
  return new_id;
end;
$$;

-- Hands in an attempt. From here on the student cannot change it.
create or replace function public.submit_submission(target_submission_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  work public.submissions;
  task public.assignments;
  late boolean;
begin
  select * into work from public.submissions where id = target_submission_id for update;
  if not found or work.student_id is distinct from private.current_student_id()
     or not private.has_permission('submissions.write', 'own') then
    raise exception 'Submission not found.' using errcode = 'P0002';
  end if;
  if work.status <> 'in_progress' then
    raise exception 'This work has already been submitted.' using errcode = '22023';
  end if;

  select * into task from public.assignments where id = work.assignment_id;
  if private.assignment_effective_status(task.status, task.publish_at) <> 'published' then
    raise exception 'This assignment is closed.' using errcode = '22023';
  end if;
  late := task.due_at is not null and now() > task.due_at;
  if late and not task.allow_late then
    raise exception 'The due date has passed; late work is not accepted.' using errcode = '22023';
  end if;
  if task.requires_file and not exists (select 1 from public.submission_files f where f.submission_id = work.id) then
    raise exception 'This assignment needs at least one file.' using errcode = '22023';
  end if;
  if work.answers = '{}' and coalesce(btrim(work.response_text), '') = ''
     and not exists (select 1 from public.submission_files f where f.submission_id = work.id) then
    raise exception 'Add an answer or a file before submitting.' using errcode = '22023';
  end if;

  update public.submissions
  set status = 'submitted', submitted_at = now(), is_late = late
  where id = work.id;
  perform private.log_submission_event(work.id, 'submitted', case when late then 'Late' end);
  return now();
end;
$$;

-- -----------------------------------------------------------------------------
-- Teacher RPCs
-- -----------------------------------------------------------------------------

-- Saves a grade and feedback; publish = also return it to the student.
create or replace function public.grade_submission(
  target_submission_id uuid,
  new_score numeric,
  new_feedback text default null,
  publish boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  work public.submissions;
  maximum numeric;
begin
  if not private.can_grade_submission(target_submission_id) then
    raise exception 'You can only grade work from classes you teach.' using errcode = '42501';
  end if;
  select * into work from public.submissions where id = target_submission_id for update;
  if work.status = 'in_progress' then
    raise exception 'This work has not been submitted yet.' using errcode = '22023';
  end if;
  select a.max_score into maximum from public.assignments a where a.id = work.assignment_id;
  if new_score is null or new_score < 0 or new_score > maximum then
    raise exception 'The score must be between 0 and %.', trim_scale(maximum) using errcode = '22023';
  end if;
  if char_length(new_feedback) > 5000 then
    raise exception 'Feedback can be at most 5000 characters.' using errcode = '22023';
  end if;

  insert into public.submission_grades (submission_id, score, feedback, graded_by, graded_by_name, graded_at, returned_at)
  values (
    work.id, new_score, nullif(btrim(new_feedback), ''), (select auth.uid()),
    coalesce((select full_name from public.profiles where id = (select auth.uid())), ''),
    now(), case when publish then now() end
  )
  on conflict (submission_id) do update set
    score = excluded.score,
    feedback = excluded.feedback,
    graded_by = excluded.graded_by,
    graded_by_name = excluded.graded_by_name,
    graded_at = excluded.graded_at,
    returned_at = case when publish then now() else public.submission_grades.returned_at end;

  update public.submissions
  set status = (case when publish or status = 'returned' then 'returned' else 'graded' end)::public.submission_status
  where id = work.id;

  perform private.log_submission_event(work.id, 'graded', trim_scale(new_score)::text || ' / ' || trim_scale(maximum)::text);
  if publish then
    perform private.log_submission_event(work.id, 'returned');
  end if;
end;
$$;

-- Publishes grades: one submission, or every graded one of an assignment.
create or replace function public.return_grades(target_assignment_id uuid, target_submission_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  returned integer := 0;
begin
  for item in
    select s.id from public.submissions s
    join public.submission_grades g on g.submission_id = s.id
    where s.assignment_id = target_assignment_id
      and (target_submission_id is null or s.id = target_submission_id)
      and s.status = 'graded'
  loop
    if not private.can_grade_submission(item.id) then
      raise exception 'You can only grade work from classes you teach.' using errcode = '42501';
    end if;
    update public.submission_grades set returned_at = now() where submission_id = item.id;
    update public.submissions set status = 'returned' where id = item.id;
    perform private.log_submission_event(item.id, 'returned');
    returned := returned + 1;
  end loop;
  return returned;
end;
$$;

-- Lets a student hand in a new attempt (or takes that back).
create or replace function public.set_resubmission(target_submission_id uuid, allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  work public.submissions;
begin
  if not private.can_grade_submission(target_submission_id) then
    raise exception 'You can only manage work from classes you teach.' using errcode = '42501';
  end if;
  select * into work from public.submissions where id = target_submission_id for update;
  if work.status = 'in_progress' then
    raise exception 'The student is still working on this attempt.' using errcode = '22023';
  end if;
  if exists (select 1 from public.submissions s
             where s.assignment_id = work.assignment_id and s.student_id = work.student_id and s.attempt > work.attempt) then
    raise exception 'Only the latest attempt can be reopened.' using errcode = '22023';
  end if;
  update public.submissions set resubmission_allowed = allowed where id = work.id;
  perform private.log_submission_event(work.id,
    (case when allowed then 'resubmission_allowed' else 'resubmission_revoked' end)::public.submission_event);
end;
$$;

-- Marks objective questions against the answer key (a suggestion for the
-- teacher; the score is always the teacher's decision).
create or replace function public.submission_auto_marks(target_submission_id uuid)
returns table (question_id uuid, points numeric, earned numeric, correct boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_grade_submission(target_submission_id) then
    raise exception 'You can only grade work from classes you teach.' using errcode = '42501';
  end if;
  return query
  select q.id, q.points,
         case when m.correct then q.points else 0 end,
         m.correct
  from public.submissions s
  join public.assignment_questions q on q.assignment_id = s.assignment_id
  left join public.assignment_answer_keys k on k.question_id = q.id
  cross join lateral (
    select case
      when q.kind = 'multiple_choice' and k.correct_option is not null
        then (s.answers -> q.id::text ->> 'choice')::integer is not distinct from k.correct_option
      when q.kind = 'short_answer' and k.accepted_answers is not null
        then lower(regexp_replace(btrim(coalesce(s.answers -> q.id::text ->> 'text', '')), '\s+', ' ', 'g'))
             = any (array(select lower(regexp_replace(btrim(x), '\s+', ' ', 'g')) from unnest(k.accepted_answers) x))
      else null
    end as correct
  ) m
  where s.id = target_submission_id
  order by q.position;
end;
$$;

revoke all on function public.start_submission(uuid) from public, anon;
revoke all on function public.submit_submission(uuid) from public, anon;
revoke all on function public.grade_submission(uuid, numeric, text, boolean) from public, anon;
revoke all on function public.return_grades(uuid, uuid) from public, anon;
revoke all on function public.set_resubmission(uuid, boolean) from public, anon;
revoke all on function public.submission_auto_marks(uuid) from public, anon;
grant execute on function public.start_submission(uuid) to authenticated;
grant execute on function public.submit_submission(uuid) to authenticated;
grant execute on function public.grade_submission(uuid, numeric, text, boolean) to authenticated;
grant execute on function public.return_grades(uuid, uuid) to authenticated;
grant execute on function public.set_resubmission(uuid, boolean) to authenticated;
grant execute on function public.submission_auto_marks(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.assignments enable row level security;
alter table public.assignment_questions enable row level security;
alter table public.assignment_answer_keys enable row level security;
alter table public.assignment_attachments enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_files enable row level security;
alter table public.submission_grades enable row level security;
alter table public.submission_events enable row level security;

-- Editors see every state; others only released (not draft, scheduled or archived).
create policy assignments_select on public.assignments for select to authenticated using (
  private.can_write_class_assignments(class_id)
  or (select private.has_permission('assignments.read', 'all'))
  or ((select private.has_permission('assignments.read', 'assigned')) and private.is_class_teacher(class_id))
  or (private.assignment_released(status, publish_at) and (
       ((select private.has_permission('assignments.read', 'own')) and private.is_class_student(class_id))
    or ((select private.has_permission('assignments.read', 'children')) and private.is_class_of_child(class_id))
  ))
);
create policy assignments_insert on public.assignments for insert to authenticated
  with check (private.can_write_class_assignments(class_id));
create policy assignments_update on public.assignments for update to authenticated
  using (private.can_write_class_assignments(class_id))
  with check (private.can_write_class_assignments(class_id));
-- Only never-published drafts are deleted; everything else is archived.
create policy assignments_delete on public.assignments for delete to authenticated
  using (status = 'draft' and published_at is null and private.can_write_class_assignments(class_id));

create policy assignment_questions_select on public.assignment_questions for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id));
create policy assignment_questions_write on public.assignment_questions for all to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id and private.can_write_class_assignments(a.class_id)))
  with check (exists (select 1 from public.assignments a where a.id = assignment_id and private.can_write_class_assignments(a.class_id)));

create policy assignment_answer_keys_all on public.assignment_answer_keys for all to authenticated
  using (exists (
    select 1 from public.assignment_questions q join public.assignments a on a.id = q.assignment_id
    where q.id = question_id and private.can_write_class_assignments(a.class_id)
  ))
  with check (exists (
    select 1 from public.assignment_questions q join public.assignments a on a.id = q.assignment_id
    where q.id = question_id and private.can_write_class_assignments(a.class_id)
  ));

create policy assignment_attachments_select on public.assignment_attachments for select to authenticated
  using (exists (select 1 from public.assignments a where a.id = assignment_id));
create policy assignment_attachments_insert on public.assignment_attachments for insert to authenticated
  with check (private.can_edit_assignment_files(assignment_id::text));
create policy assignment_attachments_delete on public.assignment_attachments for delete to authenticated
  using (private.can_edit_assignment_files(assignment_id::text));

create policy submissions_select on public.submissions for select to authenticated
  using (private.can_read_submission(student_id, assignment_id));
-- Students save their own work in progress (answers and text only, see the
-- column grant below); everything else goes through the RPCs.
create policy submissions_update on public.submissions for update to authenticated
  using (status = 'in_progress' and private.owns_open_submission(id::text))
  with check (status = 'in_progress' and private.owns_open_submission(id::text));

create policy submission_files_select on public.submission_files for select to authenticated
  using (exists (select 1 from public.submissions s where s.id = submission_id));
create policy submission_files_insert on public.submission_files for insert to authenticated
  with check (private.owns_open_submission(submission_id::text));
create policy submission_files_delete on public.submission_files for delete to authenticated
  using (private.owns_open_submission(submission_id::text));

-- Students and parents see a grade only once it has been returned.
create policy submission_grades_select on public.submission_grades for select to authenticated using (
  private.can_grade_submission(submission_id)
  or (select private.has_permission('assignments.read', 'all'))
  or (returned_at is not null and exists (select 1 from public.submissions s where s.id = submission_id))
);

-- "graded" events carry the score, so students and parents see them only once
-- the grade has been returned.
create policy submission_events_select on public.submission_events for select to authenticated using (
  exists (select 1 from public.submissions s where s.id = submission_id)
  and (
    event <> 'graded'
    or private.can_grade_submission(submission_id)
    or (select private.has_permission('assignments.read', 'all'))
    or exists (select 1 from public.submission_grades g where g.submission_id = submission_events.submission_id and g.returned_at is not null)
  )
);

-- Writes that must go through the functions above.
revoke insert, update, delete on public.submissions, public.submission_grades, public.submission_events from authenticated;
grant update (answers, response_text) on public.submissions to authenticated;
revoke update on public.assignment_attachments, public.submission_files from authenticated;

revoke all on public.assignments, public.assignment_questions, public.assignment_answer_keys,
  public.assignment_attachments, public.submissions, public.submission_files, public.submission_grades,
  public.submission_events, public.upload_file_types from anon;

-- -----------------------------------------------------------------------------
-- Storage: assignment-files/assignments/<assignment_id>/<uuid>.<ext>
--          assignment-files/submissions/<submission_id>/<uuid>.<ext>
-- -----------------------------------------------------------------------------
create policy assignment_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files' and (
    ((storage.foldername(name))[1] = 'assignments'
      and exists (select 1 from public.assignments a where a.id::text = (storage.foldername(name))[2]))
    or ((storage.foldername(name))[1] = 'submissions'
      and exists (select 1 from public.submissions s where s.id::text = (storage.foldername(name))[2]))
  )
);
create policy assignment_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (
    ((storage.foldername(name))[1] = 'assignments' and private.can_edit_assignment_files((storage.foldername(name))[2]))
    or ((storage.foldername(name))[1] = 'submissions' and private.owns_open_submission((storage.foldername(name))[2]))
  )
);
create policy assignment_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'assignment-files' and (
    ((storage.foldername(name))[1] = 'assignments' and private.can_edit_assignment_files((storage.foldername(name))[2]))
    or ((storage.foldername(name))[1] = 'submissions' and private.owns_open_submission((storage.foldername(name))[2]))
  )
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
