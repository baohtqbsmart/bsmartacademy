-- =============================================================================
-- Writing and speaking assessment.
--
--   assessment_rubrics      reusable rubric templates (general, IELTS-style...)
--   assessment_tasks        a writing or speaking task set for a class, with its
--                           own copy of the rubric (templates can change freely)
--   assessment_submissions  every attempt: online text, a document, or a recording
--   assessment_grades       per-criterion scores, total / band, overall feedback;
--                           students and parents see them once returned
--   assessment_annotations  highlighted text (with comment and suggested
--                           correction), time-stamped comments on recordings,
--                           or general comments; returned with the grade
--   feedback_comments       reusable comments for teachers
--   assessment_events       the history of each submission
--
-- Scores are always a teacher's: grades are written only by
-- grade_assessment(), which records the teacher. Annotations carry a source;
-- anything other than 'teacher' (e.g. a future AI helper) must be shown as
-- "AI-assisted feedback" and never counts towards a score.
-- =============================================================================

insert into public.permissions (code, description) values
  ('assessments.read',   'View writing and speaking assessments'),
  ('assessments.write',  'Set and grade writing and speaking assessments'),
  ('assessments.submit', 'Hand in writing and speaking assessments');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'assessments.read',  'all'),
  ('super_admin', 'assessments.write', 'all'),
  ('admin',       'assessments.read',  'all'),
  ('admin',       'assessments.write', 'all'),
  ('teacher',     'assessments.read',  'assigned'),
  ('teacher',     'assessments.write', 'assigned'),
  ('student',     'assessments.read',  'own'),
  ('student',     'assessments.submit', 'own'),
  ('parent',      'assessments.read',  'children');

create type public.assessment_kind as enum ('writing', 'speaking');
create type public.assessment_scoring as enum ('points', 'ielts_band');
create type public.assessment_response as enum ('online_text', 'document', 'online_or_document', 'audio', 'video', 'audio_or_video');
create type public.assessment_submission_status as enum ('submitted', 'graded', 'returned');
create type public.annotation_anchor as enum ('text', 'time', 'general');
create type public.annotation_category as enum (
  'grammar', 'vocabulary', 'spelling', 'punctuation', 'organization', 'content',
  'pronunciation', 'fluency', 'interaction', 'other'
);
create type public.feedback_source as enum ('teacher', 'ai_assisted');
create type public.assessment_event as enum ('submitted', 'returned', 'resubmission_allowed', 'resubmission_revoked');

-- -----------------------------------------------------------------------------
-- Rubrics: [{ "name": "...", "description": "...", "max_points": n }]
-- IELTS-style rubrics score every criterion as a band from 0 to 9.
-- -----------------------------------------------------------------------------
create or replace function private.check_criteria(criteria jsonb, scoring public.assessment_scoring)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(criteria), '') <> 'array' or jsonb_array_length(criteria) not between 1 and 10 then
    raise exception 'A rubric needs between 1 and 10 criteria.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(criteria) c
    where jsonb_typeof(c) <> 'object'
       or coalesce(btrim(c ->> 'name'), '') = '' or char_length(c ->> 'name') > 100
       or char_length(coalesce(c ->> 'description', '')) > 1000
       or coalesce(jsonb_typeof(c -> 'max_points'), '') <> 'number'
       or (c ->> 'max_points')::numeric <= 0 or (c ->> 'max_points')::numeric > 100
       or (scoring = 'ielts_band' and (c ->> 'max_points')::numeric <> 9)
  ) then
    raise exception 'Each criterion needs a name and points between 1 and 100 (9 for IELTS-style bands).' using errcode = '22023';
  end if;
  if (select count(distinct lower(btrim(c ->> 'name'))) from jsonb_array_elements(criteria) c) <> jsonb_array_length(criteria) then
    raise exception 'Criterion names must be different.' using errcode = '22023';
  end if;
end;
$$;

-- Points: the sum of the criteria. IELTS-style: 9 (the overall band).
create or replace function private.rubric_maximum(criteria jsonb, scoring public.assessment_scoring)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when scoring = 'ielts_band' then 9
              else (select sum((c ->> 'max_points')::numeric) from jsonb_array_elements(criteria) c) end;
$$;

create table public.assessment_rubrics (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (btrim(name) <> '' and char_length(name) <= 150),
  kind            public.assessment_kind not null,
  scoring         public.assessment_scoring not null default 'points',
  criteria        jsonb not null,
  description     text check (char_length(description) <= 2000),
  is_system       boolean not null default false,
  archived_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create or replace function private.prepare_assessment_rubric()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.check_criteria(new.criteria, new.scoring);
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    -- Built-in templates come from migrations only.
    if (select auth.uid()) is not null then
      new.is_system := false;
    end if;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.is_system := old.is_system;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger assessment_rubrics_prepare before insert or update on public.assessment_rubrics
  for each row execute function private.prepare_assessment_rubric();

insert into public.assessment_rubrics (name, kind, scoring, is_system, description, criteria) values
  ('General writing', 'writing', 'points', true,
   'Four criteria, 5 points each.',
   '[{"name": "Content", "description": "Covers the task fully with relevant ideas", "max_points": 5},
     {"name": "Organization", "description": "Clear paragraphs, logical order, linking words", "max_points": 5},
     {"name": "Vocabulary", "description": "Range and accuracy of words", "max_points": 5},
     {"name": "Grammar", "description": "Range and accuracy of structures", "max_points": 5}]'),
  ('IELTS-style Writing (bands 0–9)', 'writing', 'ielts_band', true,
   'Practice marking with the four IELTS Writing criteria. Not an official IELTS score.',
   '[{"name": "Task Response", "description": "Addresses all parts of the task with a clear position", "max_points": 9},
     {"name": "Coherence and Cohesion", "description": "Logical organisation, paragraphing, cohesive devices", "max_points": 9},
     {"name": "Lexical Resource", "description": "Range, precision and accuracy of vocabulary", "max_points": 9},
     {"name": "Grammatical Range and Accuracy", "description": "Variety and accuracy of sentence structures", "max_points": 9}]'),
  ('Speaking', 'speaking', 'points', true,
   'Six criteria, 5 points each.',
   '[{"name": "Fluency", "description": "Speaks at length without unnatural pauses", "max_points": 5},
     {"name": "Pronunciation", "description": "Clear sounds, stress and intonation", "max_points": 5},
     {"name": "Vocabulary", "description": "Range and accuracy of words", "max_points": 5},
     {"name": "Grammar", "description": "Range and accuracy of structures", "max_points": 5},
     {"name": "Interaction", "description": "Responds to the prompt or partner appropriately", "max_points": 5},
     {"name": "Content", "description": "Relevant, developed ideas", "max_points": 5}]');

-- -----------------------------------------------------------------------------
-- Tasks
-- -----------------------------------------------------------------------------
create table public.assessment_tasks (
  id                   uuid primary key default gen_random_uuid(),
  class_id             uuid not null references public.classes (id) on delete restrict,
  kind                 public.assessment_kind not null,
  title                text not null check (btrim(title) <> '' and char_length(title) <= 200),
  cefr_level           public.cefr_level,
  task                 text not null check (btrim(task) <> '' and char_length(task) <= 10000),
  instructions         text check (char_length(instructions) <= 10000),
  media_path           text,
  response_mode        public.assessment_response not null,
  min_words            integer check (min_words between 1 and 5000),
  max_words            integer check (max_words between 1 and 5000),
  max_duration_seconds integer check (max_duration_seconds between 10 and 1800),
  rubric_id            uuid references public.assessment_rubrics (id) on delete set null,
  scoring              public.assessment_scoring not null default 'points',
  criteria             jsonb not null,
  max_score            numeric(6, 2) not null,
  max_attempts         integer not null default 1 check (max_attempts between 1 and 10),
  due_at               timestamptz,
  allow_late           boolean not null default true,
  status               public.content_status not null default 'draft',
  published_at         timestamptz,
  closed_at            timestamptz,
  created_by           uuid references public.profiles (id) on delete set null,
  created_by_name      text not null default '',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (min_words is null or max_words is null or min_words <= max_words),
  check ((kind = 'writing') = (response_mode in ('online_text', 'document', 'online_or_document'))),
  check (kind = 'writing' or (min_words is null and max_words is null)),
  check (kind = 'speaking' or max_duration_seconds is null)
);

comment on column public.assessment_tasks.criteria is 'Copied from the rubric template when the task is set; grading uses this copy.';
comment on column public.assessment_tasks.status is 'draft -> published; "closed" is closed_at on a published task; archived hides it.';

create index assessment_tasks_class_idx on public.assessment_tasks (class_id);

create or replace function private.can_write_class_assessments(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('assessments.write', 'all')
    or (private.has_permission('assessments.write', 'assigned') and private.is_class_teacher(target_class_id));
$$;

create or replace function private.prepare_assessment_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  klass public.classes;
  started boolean := false;
begin
  if tg_op = 'INSERT' then
    select * into klass from public.classes where id = new.class_id;
    if not found or klass.deleted_at is not null or klass.status not in ('planned', 'active') then
      raise exception 'Assessments can only be set for planned or running classes.' using errcode = '22023';
    end if;
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    started := exists (select 1 from public.assessment_submissions s where s.task_id = old.id);
    if old.status = 'archived' and new.status = 'archived' then
      raise exception 'Restore the task before editing it.' using errcode = '22023';
    end if;
    if new.class_id <> old.class_id and old.published_at is not null then
      raise exception 'The class cannot change once the task has been published.' using errcode = '22023';
    end if;
    if new.kind <> old.kind then
      raise exception 'A task cannot change between writing and speaking.' using errcode = '22023';
    end if;
    -- The rubric is what earlier work was graded with: frozen once anyone has handed in.
    if started and (new.criteria, new.scoring) is distinct from (old.criteria, old.scoring) then
      raise exception 'The rubric cannot change once students have handed in work.' using errcode = '22023';
    end if;
    if started and new.max_attempts < old.max_attempts then
      raise exception 'The number of attempts can only go up once students have handed in work.' using errcode = '22023';
    end if;
  end if;

  perform private.check_criteria(new.criteria, new.scoring);
  new.max_score := private.rubric_maximum(new.criteria, new.scoring);
  perform private.check_english_media(new.media_path, 'png|jpg|jpeg|webp|mp3|m4a|wav|webm|mp4');

  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if new.status = 'draft' and tg_op = 'UPDATE' and old.published_at is not null then
    raise exception 'A published task cannot go back to draft; close or archive it.' using errcode = '22023';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger assessment_tasks_prepare before insert or update on public.assessment_tasks
  for each row execute function private.prepare_assessment_task();

-- -----------------------------------------------------------------------------
-- Submissions, grades, annotations, events
-- -----------------------------------------------------------------------------
create table public.assessment_submissions (
  id                   uuid primary key default gen_random_uuid(),
  task_id              uuid not null references public.assessment_tasks (id) on delete restrict,
  student_id           uuid not null references public.students (id) on delete restrict,
  attempt              integer not null check (attempt >= 1),
  text_response        text check (char_length(text_response) <= 50000),
  word_count           integer,
  file_path            text,
  file_name            text,
  file_mime            text,
  file_size            bigint,
  status               public.assessment_submission_status not null default 'submitted',
  is_late              boolean not null default false,
  resubmission_allowed boolean not null default false,
  submitted_at         timestamptz not null default now(),
  constraint assessment_submissions_attempt unique (task_id, student_id, attempt),
  check (text_response is not null or file_path is not null)
);

create index assessment_submissions_student_idx on public.assessment_submissions (student_id, submitted_at desc);

create table public.assessment_grades (
  submission_id   uuid primary key references public.assessment_submissions (id) on delete cascade,
  criterion_scores jsonb not null,
  total_score     numeric(6, 2) not null,
  feedback        text check (char_length(feedback) <= 10000),
  graded_by       uuid not null references public.profiles (id) on delete restrict,
  graded_by_name  text not null,
  graded_at       timestamptz not null default now(),
  returned_at     timestamptz
);

comment on table public.assessment_grades is
  'Official teacher scores only (graded_by is always a person). Students and parents see them once returned_at is set.';

create table public.assessment_annotations (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references public.assessment_submissions (id) on delete cascade,
  anchor          public.annotation_anchor not null,
  start_offset    integer,
  end_offset      integer,
  quote           text,
  time_seconds    numeric(8, 2),
  category        public.annotation_category not null default 'other',
  comment         text check (char_length(comment) <= 2000),
  suggestion      text check (char_length(suggestion) <= 2000),
  source          public.feedback_source not null default 'teacher',
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  check ((anchor = 'text') = (start_offset is not null and end_offset is not null)),
  check (start_offset is null or (start_offset >= 0 and end_offset > start_offset)),
  check ((anchor = 'time') = (time_seconds is not null)),
  check (coalesce(btrim(comment), '') <> '' or coalesce(btrim(suggestion), '') <> '')
);

comment on column public.assessment_annotations.source is
  '"teacher" for teachers'' comments. Anything else must be displayed as "AI-assisted feedback" and never contributes to a score.';

create index assessment_annotations_submission_idx on public.assessment_annotations (submission_id);

create table public.assessment_events (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.assessment_submissions (id) on delete cascade,
  event         public.assessment_event not null,
  actor_name    text not null default '',
  created_at    timestamptz not null default now()
);

create index assessment_events_submission_idx on public.assessment_events (submission_id);

create table public.feedback_comments (
  id              uuid primary key default gen_random_uuid(),
  kind            public.assessment_kind,
  category        public.annotation_category not null default 'other',
  body            text not null check (btrim(body) <> '' and char_length(body) <= 1000),
  shared          boolean not null default false,
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now()
);

comment on column public.feedback_comments.kind is 'NULL: usable for writing and speaking.';

create or replace function private.stamp_feedback_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
  end if;
  new.body := btrim(new.body);
  return new;
end;
$$;

create trigger feedback_comments_stamp before insert or update on public.feedback_comments
  for each row execute function private.stamp_feedback_comment();

insert into public.feedback_comments (kind, category, body, shared) values
  ('writing', 'grammar', 'Check the verb tense here.', true),
  ('writing', 'grammar', 'Subject–verb agreement: he/she/it + verb-s.', true),
  ('writing', 'vocabulary', 'Try a more precise word.', true),
  ('writing', 'organization', 'Start a new paragraph for a new idea.', true),
  ('writing', 'organization', 'Use a linking word (however, therefore, in addition...).', true),
  ('writing', 'content', 'Develop this idea with an example.', true),
  ('writing', 'spelling', 'Spelling.', true),
  ('writing', 'punctuation', 'Punctuation: full stop or comma needed.', true),
  ('speaking', 'pronunciation', 'Stress the right syllable in this word.', true),
  ('speaking', 'pronunciation', 'Pronounce the final consonant clearly.', true),
  ('speaking', 'fluency', 'Good pace; try to avoid long pauses.', true),
  ('speaking', 'interaction', 'Answer the question directly, then add a reason.', true),
  (null, 'content', 'Well done – clear and relevant.', true);

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------
create or replace function private.can_read_assessment(target_student_id uuid, target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('assessments.read', 'all')
    or (
      exists (select 1 from public.students s where s.id = target_student_id and s.deleted_at is null)
      and (
        (private.has_permission('assessments.read', 'assigned')
          and exists (select 1 from public.assessment_tasks t where t.id = target_task_id and private.is_class_teacher(t.class_id))
          and private.teaches_student(target_student_id))
        or (private.has_permission('assessments.read', 'own') and target_student_id = private.current_student_id())
        or (private.has_permission('assessments.read', 'children') and private.is_parent_of(target_student_id))
      )
    );
$$;

-- Grading: an editor of the task's class who can see the student.
create or replace function private.can_grade_assessment(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.assessment_submissions s join public.assessment_tasks t on t.id = s.task_id
    where s.id = target_submission_id
      and private.can_write_class_assessments(t.class_id)
      and (private.has_permission('assessments.write', 'all') or private.teaches_student(s.student_id))
  );
$$;

create or replace function private.assessment_returned(target_submission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.assessment_grades g where g.submission_id = target_submission_id and g.returned_at is not null);
$$;

-- A file in assessments/<student_id>/: its owner (also before handing in), or
-- anyone who may read the submission it belongs to (checked per file, so a
-- teacher of one class never reaches the student's work for another).
create or replace function private.can_read_assessment_file(object_name text, folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select folder = private.current_student_id()::text
    or exists (
      select 1 from public.assessment_submissions s
      where s.file_path = object_name and private.can_read_assessment(s.student_id, s.task_id)
    );
$$;

create or replace function private.log_assessment_event(target uuid, what public.assessment_event)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.assessment_events (submission_id, event, actor_name)
  values (target, what, coalesce((select full_name from public.profiles where id = (select auth.uid())), ''));
$$;

-- -----------------------------------------------------------------------------
-- Annotation rules: text highlights must match the submitted text and not
-- overlap; comments are always a person's (source 'teacher').
-- -----------------------------------------------------------------------------
create or replace function private.prepare_assessment_annotation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  body text;
begin
  if tg_op = 'UPDATE' then
    new.submission_id := old.submission_id;
    new.anchor := old.anchor;
    new.start_offset := old.start_offset;
    new.end_offset := old.end_offset;
    new.quote := old.quote;
    new.time_seconds := old.time_seconds;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.source := old.source;
  else
    -- Through the API, comments are always a person's.
    new.source := 'teacher';
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    if new.anchor = 'text' then
      select text_response into body from public.assessment_submissions where id = new.submission_id;
      if body is null or new.end_offset > char_length(body) then
        raise exception 'The highlighted text is not part of the answer.' using errcode = '22023';
      end if;
      new.quote := substring(body from new.start_offset + 1 for new.end_offset - new.start_offset);
      if exists (
        select 1 from public.assessment_annotations a
        where a.submission_id = new.submission_id and a.anchor = 'text'
          and a.start_offset < new.end_offset and new.start_offset < a.end_offset
      ) then
        raise exception 'This text is already highlighted; edit that comment instead.' using errcode = '22023';
      end if;
    else
      new.quote := null;
    end if;
  end if;
  new.comment := nullif(btrim(new.comment), '');
  new.suggestion := nullif(btrim(new.suggestion), '');
  return new;
end;
$$;

create trigger assessment_annotations_prepare before insert or update on public.assessment_annotations
  for each row execute function private.prepare_assessment_annotation();

-- -----------------------------------------------------------------------------
-- Student RPC
-- -----------------------------------------------------------------------------

-- Hands in an attempt: online text, a document, or a recording (per the task).
-- A new attempt needs an attempt left or the teacher's permission.
create or replace function public.submit_assessment(target_task_id uuid, response_text text default null, file jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  task public.assessment_tasks;
  latest public.assessment_submissions;
  has_latest boolean;
  taken integer;
  mime text := file ->> 'mime';
  late boolean;
  words integer;
  submission_id uuid;
begin
  if me is null or not private.has_permission('assessments.submit', 'own') then
    raise exception 'Only students can hand in assessments.' using errcode = '42501';
  end if;
  select * into task from public.assessment_tasks where id = target_task_id;
  if not found or task.status <> 'published' or not private.is_class_student(task.class_id) then
    raise exception 'Assessment not found.' using errcode = 'P0002';
  end if;
  if task.closed_at is not null then
    raise exception 'This assessment is closed.' using errcode = '22023';
  end if;

  select * into latest from public.assessment_submissions
  where task_id = task.id and student_id = me order by attempt desc limit 1 for update;
  has_latest := found;
  select count(*) into taken from public.assessment_submissions where task_id = task.id and student_id = me;
  if has_latest and taken >= task.max_attempts and not latest.resubmission_allowed then
    raise exception 'You have already handed this in. Ask your teacher if you may resubmit.' using errcode = '22023';
  end if;

  late := task.due_at is not null and now() > task.due_at;
  if late and not task.allow_late then
    raise exception 'The due date has passed; late work is not accepted.' using errcode = '22023';
  end if;

  response_text := nullif(btrim(response_text), '');
  if task.response_mode = 'online_text' and response_text is null then
    raise exception 'Write your answer before handing in.' using errcode = '22023';
  end if;
  if task.response_mode in ('document', 'audio', 'video', 'audio_or_video') and file is null then
    raise exception 'Upload your file before handing in.' using errcode = '22023';
  end if;
  if task.response_mode = 'online_or_document' and response_text is null and file is null then
    raise exception 'Write your answer or upload a document.' using errcode = '22023';
  end if;
  if file is not null then
    if not (
      (task.response_mode in ('document', 'online_or_document') and mime in (
        'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'))
      or (task.response_mode in ('audio', 'audio_or_video') and mime like 'audio/%')
      or (task.response_mode in ('video', 'audio_or_video') and mime like 'video/%')
    ) then
      raise exception 'This file type is not accepted for this task.' using errcode = '22023';
    end if;
    perform private.validate_upload(file ->> 'path', 'assessments/' || me, file ->> 'name', mime, (file ->> 'size')::bigint);
  end if;
  if task.kind = 'speaking' then
    response_text := null;
  end if;
  words := case when response_text is null then null
                else coalesce(array_length(regexp_split_to_array(response_text, '\s+'), 1), 0) end;

  -- A resubmission uses up the teacher's permission on the previous attempt.
  if has_latest and latest.resubmission_allowed then
    update public.assessment_submissions set resubmission_allowed = false where id = latest.id;
  end if;

  insert into public.assessment_submissions (
    task_id, student_id, attempt, text_response, word_count, file_path, file_name, file_mime, file_size, is_late
  )
  values (
    task.id, me, taken + 1, response_text, words,
    file ->> 'path', file ->> 'name', mime, (file ->> 'size')::bigint, late
  )
  returning id into submission_id;
  perform private.log_assessment_event(submission_id, 'submitted');
  return submission_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Teacher RPCs
-- -----------------------------------------------------------------------------

-- Scores every criterion; points add up, IELTS-style bands average to the
-- nearest half band. publish = also return it to the student.
create or replace function public.grade_assessment(
  target_submission_id uuid,
  scores jsonb,
  overall_feedback text default null,
  publish boolean default false
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  task public.assessment_tasks;
  total numeric;
begin
  if not private.can_grade_assessment(target_submission_id) then
    raise exception 'You can only grade work from students you teach.' using errcode = '42501';
  end if;
  select t.* into task from public.assessment_tasks t join public.assessment_submissions s on s.task_id = t.id
  where s.id = target_submission_id;

  if coalesce(jsonb_typeof(scores), '') <> 'array' or jsonb_array_length(scores) <> jsonb_array_length(task.criteria) then
    raise exception 'Score every criterion.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(scores) with ordinality as s (v, i)
    where coalesce(jsonb_typeof(v), '') <> 'number'
       or (v #>> '{}')::numeric < 0
       or (v #>> '{}')::numeric > (task.criteria -> (i::integer - 1) ->> 'max_points')::numeric
       or (task.scoring = 'ielts_band' and (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric))
       or (task.scoring = 'points' and (v #>> '{}')::numeric * 2 <> floor((v #>> '{}')::numeric * 2))
  ) then
    raise exception 'Each criterion must be scored within its range (whole bands 0–9 for IELTS-style criteria; points in steps of 0.5).'
      using errcode = '22023';
  end if;

  total := case task.scoring
    when 'ielts_band' then floor((select avg((v #>> '{}')::numeric) from jsonb_array_elements(scores) v) * 2 + 0.5) / 2
    else (select sum((v #>> '{}')::numeric) from jsonb_array_elements(scores) v)
  end;

  insert into public.assessment_grades (submission_id, criterion_scores, total_score, feedback, graded_by, graded_by_name, returned_at)
  values (
    target_submission_id, scores, total, nullif(btrim(overall_feedback), ''), (select auth.uid()),
    coalesce((select full_name from public.profiles where id = (select auth.uid())), ''),
    case when publish then now() end
  )
  on conflict (submission_id) do update set
    criterion_scores = excluded.criterion_scores,
    total_score = excluded.total_score,
    feedback = excluded.feedback,
    graded_by = excluded.graded_by,
    graded_by_name = excluded.graded_by_name,
    graded_at = now(),
    returned_at = case when publish then coalesce(public.assessment_grades.returned_at, now()) else public.assessment_grades.returned_at end;

  update public.assessment_submissions
  set status = case when private.assessment_returned(id) then 'returned' else 'graded' end::public.assessment_submission_status
  where id = target_submission_id;
  if publish then
    perform private.log_assessment_event(target_submission_id, 'returned');
  end if;
  return total;
end;
$$;

-- Returns graded work: one submission or every graded one of a task.
create or replace function public.return_assessment_grades(target_task_id uuid, target_submission_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item uuid;
  n integer := 0;
begin
  for item in
    select s.id from public.assessment_submissions s join public.assessment_grades g on g.submission_id = s.id
    where s.task_id = target_task_id and (target_submission_id is null or s.id = target_submission_id) and s.status = 'graded'
  loop
    if not private.can_grade_assessment(item) then
      raise exception 'You can only grade work from students you teach.' using errcode = '42501';
    end if;
    update public.assessment_grades set returned_at = now() where submission_id = item;
    update public.assessment_submissions set status = 'returned' where id = item;
    perform private.log_assessment_event(item, 'returned');
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.set_assessment_resubmission(target_submission_id uuid, allowed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  work public.assessment_submissions;
begin
  if not private.can_grade_assessment(target_submission_id) then
    raise exception 'You can only manage work from students you teach.' using errcode = '42501';
  end if;
  select * into work from public.assessment_submissions where id = target_submission_id for update;
  if exists (select 1 from public.assessment_submissions s
             where s.task_id = work.task_id and s.student_id = work.student_id and s.attempt > work.attempt) then
    raise exception 'Only the latest attempt can be reopened.' using errcode = '22023';
  end if;
  update public.assessment_submissions set resubmission_allowed = allowed where id = work.id;
  perform private.log_assessment_event(work.id,
    (case when allowed then 'resubmission_allowed' else 'resubmission_revoked' end)::public.assessment_event);
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.submit_assessment(uuid, text, jsonb)',
    'public.grade_assessment(uuid, jsonb, text, boolean)',
    'public.return_assessment_grades(uuid, uuid)',
    'public.set_assessment_resubmission(uuid, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.assessment_rubrics enable row level security;
alter table public.assessment_tasks enable row level security;
alter table public.assessment_submissions enable row level security;
alter table public.assessment_grades enable row level security;
alter table public.assessment_annotations enable row level security;
alter table public.assessment_events enable row level security;
alter table public.feedback_comments enable row level security;

-- Rubric templates: staff who set assessments; built-in ones are read-only.
create policy assessment_rubrics_select on public.assessment_rubrics for select to authenticated
  using ((select private.has_any_permission('assessments.write')));
create policy assessment_rubrics_insert on public.assessment_rubrics for insert to authenticated
  with check ((select private.has_any_permission('assessments.write')));
create policy assessment_rubrics_update on public.assessment_rubrics for update to authenticated
  using (not is_system and (created_by = (select auth.uid()) or (select private.has_permission('assessments.write', 'all'))))
  with check (not is_system and (created_by = (select auth.uid()) or (select private.has_permission('assessments.write', 'all'))));

create policy assessment_tasks_select on public.assessment_tasks for select to authenticated using (
  private.can_write_class_assessments(class_id)
  or (select private.has_permission('assessments.read', 'all'))
  or ((select private.has_permission('assessments.read', 'assigned')) and private.is_class_teacher(class_id))
  or (status = 'published' and (
       ((select private.has_permission('assessments.read', 'own')) and private.is_class_student(class_id))
    or ((select private.has_permission('assessments.read', 'children')) and private.is_class_of_child(class_id))
  ))
);
create policy assessment_tasks_insert on public.assessment_tasks for insert to authenticated
  with check (private.can_write_class_assessments(class_id));
create policy assessment_tasks_update on public.assessment_tasks for update to authenticated
  using (private.can_write_class_assessments(class_id)) with check (private.can_write_class_assessments(class_id));
create policy assessment_tasks_delete on public.assessment_tasks for delete to authenticated
  using (status = 'draft' and published_at is null and private.can_write_class_assessments(class_id));

create policy assessment_submissions_select on public.assessment_submissions for select to authenticated
  using (private.can_read_assessment(student_id, task_id));

-- Grades and annotations: graders and academy-wide readers always; students
-- and parents once the grade has been returned.
create policy assessment_grades_select on public.assessment_grades for select to authenticated using (
  private.can_grade_assessment(submission_id)
  or (select private.has_permission('assessments.read', 'all'))
  or (returned_at is not null and exists (select 1 from public.assessment_submissions s where s.id = submission_id))
);

create policy assessment_annotations_select on public.assessment_annotations for select to authenticated using (
  private.can_grade_assessment(submission_id)
  or (select private.has_permission('assessments.read', 'all'))
  or (private.assessment_returned(submission_id) and exists (select 1 from public.assessment_submissions s where s.id = submission_id))
);
create policy assessment_annotations_insert on public.assessment_annotations for insert to authenticated
  with check (private.can_grade_assessment(submission_id));
create policy assessment_annotations_update on public.assessment_annotations for update to authenticated
  using (private.can_grade_assessment(submission_id)) with check (private.can_grade_assessment(submission_id));
create policy assessment_annotations_delete on public.assessment_annotations for delete to authenticated
  using (private.can_grade_assessment(submission_id));

create policy assessment_events_select on public.assessment_events for select to authenticated
  using (exists (select 1 from public.assessment_submissions s where s.id = submission_id));

-- Reusable comments: shared ones for every grader, private ones for their author.
create policy feedback_comments_select on public.feedback_comments for select to authenticated
  using ((select private.has_any_permission('assessments.write')) and (shared or created_by = (select auth.uid())));
create policy feedback_comments_insert on public.feedback_comments for insert to authenticated
  with check ((select private.has_any_permission('assessments.write')));
create policy feedback_comments_update on public.feedback_comments for update to authenticated
  using (created_by = (select auth.uid())) with check (created_by = (select auth.uid()));
create policy feedback_comments_delete on public.feedback_comments for delete to authenticated
  using (created_by = (select auth.uid()));

-- Written only by the functions above (the annotation trigger sets the source).
revoke insert, update, delete on public.assessment_submissions, public.assessment_grades, public.assessment_events from authenticated;
revoke delete on public.assessment_rubrics from authenticated;

revoke all on public.assessment_rubrics, public.assessment_tasks, public.assessment_submissions, public.assessment_grades,
  public.assessment_annotations, public.assessment_events, public.feedback_comments from anon;

-- -----------------------------------------------------------------------------
-- Storage: assignment-files/assessments/<student_id>/<uuid>.<ext>
-- -----------------------------------------------------------------------------
create policy assessment_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'assessments'
  and private.can_read_assessment_file(name, (storage.foldername(name))[2])
);
create policy assessment_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (storage.foldername(name))[1] = 'assessments'
  and (select private.has_permission('assessments.submit', 'own'))
  and (storage.foldername(name))[2] = private.current_student_id()::text
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
