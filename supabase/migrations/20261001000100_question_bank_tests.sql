-- =============================================================================
-- Question bank and test engine.
--
--   bank_questions / bank_question_keys   reusable questions; keys (correct
--                                         answers, explanations) are staff-only
--   tests                                 a test for one class: timing,
--                                         attempts, randomisation, total score
--   test_questions / test_question_keys   questions COPIED from the bank when
--                                         added, so later bank edits never
--                                         change a published test or its results
--   test_attempts / test_answers          every attempt and every answer
--
-- Security model:
--   * students never read keys directly: grading runs in security-definer SQL;
--   * students see a test's questions only once they have started an attempt;
--   * per-question marks, feedback and correct answers reach students and
--     parents only when the test's review policy allows (never / after the
--     student's last attempt / after the test closes); scores in test_answers
--     are withheld from the API by column privileges and served by
--     attempt_details(), which applies that policy;
--   * answers can only be written to the student's own open attempt before its
--     deadline; everything else goes through the functions below.
-- =============================================================================

insert into public.permissions (code, description) values
  ('question_bank.read',  'View the question bank and answer keys'),
  ('question_bank.write', 'Create and edit bank questions'),
  ('tests.read',          'View tests and results'),
  ('tests.write',         'Build, publish and grade tests'),
  ('test_attempts.write', 'Take tests');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'question_bank.read',  'all'),
  ('super_admin', 'question_bank.write', 'all'),
  ('super_admin', 'tests.read',          'all'),
  ('super_admin', 'tests.write',         'all'),
  ('admin',       'question_bank.read',  'all'),
  ('admin',       'question_bank.write', 'all'),
  ('admin',       'tests.read',          'all'),
  ('admin',       'tests.write',         'all'),
  -- The bank is shared: every teacher reuses it; each edits their own questions.
  ('teacher',     'question_bank.read',  'all'),
  ('teacher',     'question_bank.write', 'own'),
  ('teacher',     'tests.read',          'assigned'),
  ('teacher',     'tests.write',         'assigned'),
  ('student',     'tests.read',          'own'),
  ('student',     'test_attempts.write', 'own'),
  ('parent',      'tests.read',          'children');

create type public.question_type as enum (
  'multiple_choice', 'multiple_response', 'true_false', 'matching', 'fill_blank',
  'short_answer', 'essay', 'listening', 'speaking', 'sentence_transformation', 'error_correction'
);
create type public.cefr_level as enum ('pre_a1', 'a1', 'a2', 'b1', 'b2', 'c1', 'c2');
create type public.question_difficulty as enum ('easy', 'medium', 'hard');
create type public.bank_question_status as enum ('active', 'archived');
create type public.test_status as enum ('draft', 'published', 'closed', 'archived');
create type public.test_review_policy as enum ('never', 'after_last_attempt', 'after_close');
create type public.test_attempt_status as enum ('in_progress', 'submitted', 'graded');

-- -----------------------------------------------------------------------------
-- Question content, keys and responses (shared by bank and test copies)
--
--   type                         content                       key (answer)                 response
--   multiple_choice              {options: [..]}               {correct: i}                 {choice: i}
--   multiple_response            {options: [..]}               {correct: [i..]}             {choices: [i..]}
--   true_false                   {}                            {correct: bool}              {value: bool}
--   matching                     {left: [..], right: [..]}     {pairs: [right index per left]} {pairs: [..]}
--   fill_blank (prompt has ___)  {blank_count: n}              {blanks: [[accepted..]..], case_sensitive}  {blanks: [..]}
--   short_answer                 {}                            {accepted: [..]}             {text}
--   sentence_transformation      {source_text}                 {accepted: [..]}             {text}
--   error_correction             {source_text}                 {accepted: [..]}             {text}
--   essay                        {min_words?, max_words?}      {}                           {text}
--   listening (audio in media)   {format: choice|text, options?} {correct: i} when choice   {choice} | {text}
--   speaking                     {max_seconds?}                {}                           {file: {path, name, mime, size}}
-- -----------------------------------------------------------------------------

create or replace function private.is_choice_question(qtype public.question_type, content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select qtype in ('multiple_choice', 'multiple_response')
      or (qtype = 'listening' and content ->> 'format' = 'choice');
$$;

-- Questions whose key must exist before a test can use them (graded automatically).
create or replace function private.is_auto_graded(qtype public.question_type, content jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select qtype in ('multiple_choice', 'multiple_response', 'true_false', 'matching', 'fill_blank')
      or (qtype = 'listening' and content ->> 'format' = 'choice');
$$;

create or replace function private.is_string_array(value jsonb, min_items integer, max_items integer, max_length integer default 500)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(value) = 'array', false)
     and jsonb_array_length(value) between min_items and max_items
     and not exists (
       select 1 from jsonb_array_elements(value) e
       where jsonb_typeof(e) <> 'string' or btrim(e #>> '{}') = '' or char_length(e #>> '{}') > max_length
     );
$$;

create or replace function private.is_index_array(value jsonb, upper_bound integer, allow_missing boolean default false)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_typeof(value) = 'array', false)
     and not exists (
       select 1 from jsonb_array_elements(value) e
       where case
         when jsonb_typeof(e) <> 'number' then true
         when (e #>> '{}')::numeric <> floor((e #>> '{}')::numeric) then true
         else (e #>> '{}')::numeric >= upper_bound
           or (e #>> '{}')::numeric < case when allow_missing then -1 else 0 end
       end
     );
$$;

-- Normalises the question's public content (fills blank_count from the prompt).
create or replace function private.prepare_question_content(qtype public.question_type, prompt text, content jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  c jsonb := coalesce(content, '{}');
  n integer;
begin
  if coalesce(jsonb_typeof(c), '') <> 'object' then
    raise exception 'Question content must be an object.' using errcode = '22023';
  end if;

  if private.is_choice_question(qtype, c) then
    if not private.is_string_array(c -> 'options', 2, 8) then
      raise exception 'Give between 2 and 8 non-empty options.' using errcode = '22023';
    end if;
  end if;

  case qtype
    when 'listening' then
      if coalesce(c ->> 'format', '') not in ('choice', 'text') then
        raise exception 'Choose how students answer the listening question.' using errcode = '22023';
      end if;
    when 'matching' then
      if not private.is_string_array(c -> 'left', 2, 10) or not private.is_string_array(c -> 'right', 2, 10)
         or jsonb_array_length(c -> 'left') <> jsonb_array_length(c -> 'right') then
        raise exception 'Matching needs 2 to 10 complete pairs.' using errcode = '22023';
      end if;
    when 'fill_blank' then
      n := (char_length(prompt) - char_length(replace(prompt, '___', ''))) / 3;
      if n < 1 or n > 20 then
        raise exception 'Mark each blank in the question with ___ (1 to 20 blanks).' using errcode = '22023';
      end if;
      c := jsonb_set(c, '{blank_count}', to_jsonb(n));
    when 'sentence_transformation', 'error_correction' then
      if coalesce(btrim(c ->> 'source_text'), '') = '' then
        raise exception 'Give the sentence the student works on.' using errcode = '22023';
      end if;
    else
      null;
  end case;
  return c;
end;
$$;

create or replace function private.check_question_key(qtype public.question_type, content jsonb, answer jsonb)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  k jsonb := coalesce(answer, '{}');
  n integer;
begin
  if coalesce(jsonb_typeof(k), '') <> 'object' then
    raise exception 'The answer key must be an object.' using errcode = '22023';
  end if;
  if qtype = 'multiple_choice' or (qtype = 'listening' and content ->> 'format' = 'choice') then
    if coalesce(jsonb_typeof(k -> 'correct'), '') <> 'number'
       or not private.is_index_array(jsonb_build_array(k -> 'correct'), jsonb_array_length(content -> 'options')) then
      raise exception 'Mark the correct option.' using errcode = '22023';
    end if;
  elsif qtype = 'multiple_response' then
    if not private.is_index_array(k -> 'correct', jsonb_array_length(content -> 'options'))
       or coalesce(jsonb_array_length(k -> 'correct'), 0) = 0
       or (select count(distinct e) from jsonb_array_elements(k -> 'correct') e) <> jsonb_array_length(k -> 'correct') then
      raise exception 'Mark at least one correct option.' using errcode = '22023';
    end if;
  elsif qtype = 'true_false' then
    if coalesce(jsonb_typeof(k -> 'correct'), '') <> 'boolean' then
      raise exception 'Choose true or false as the correct answer.' using errcode = '22023';
    end if;
  elsif qtype = 'matching' then
    n := jsonb_array_length(content -> 'left');
    if not private.is_index_array(k -> 'pairs', n) or coalesce(jsonb_array_length(k -> 'pairs'), -1) <> n
       or (select count(distinct e) from jsonb_array_elements(k -> 'pairs') e) <> n then
      raise exception 'Each item must match exactly one answer.' using errcode = '22023';
    end if;
  elsif qtype = 'fill_blank' then
    n := (content ->> 'blank_count')::integer;
    if coalesce(jsonb_typeof(k -> 'blanks'), '') <> 'array' or jsonb_array_length(k -> 'blanks') <> n
       or exists (select 1 from jsonb_array_elements(k -> 'blanks') b where not private.is_string_array(b, 1, 20, 200)) then
      raise exception 'Give at least one accepted answer for every blank.' using errcode = '22023';
    end if;
  elsif qtype in ('short_answer', 'sentence_transformation', 'error_correction') then
    if k ? 'accepted' and not private.is_string_array(k -> 'accepted', 0, 50, 1000) then
      raise exception 'Accepted answers must be non-empty text.' using errcode = '22023';
    end if;
  end if;
end;
$$;

-- "  The Cat  sat. " -> "the cat sat" (case kept when case_sensitive).
create or replace function private.normalize_answer(value text, case_sensitive boolean default false)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when case_sensitive then v else lower(v) end
  from (select regexp_replace(regexp_replace(btrim(coalesce(value, '')), '\s+', ' ', 'g'), '\s*[.!?]+$', '') as v) x;
$$;

-- Grades one response. score NULL + needs_review = a teacher must mark it.
create or replace function private.grade_response(
  qtype public.question_type,
  content jsonb,
  answer jsonb,
  response jsonb,
  points numeric,
  out score numeric,
  out needs_review boolean
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  correct_set integer[];
  chosen integer[];
  hits integer;
  total integer;
  ok integer := 0;
  cs boolean;
begin
  needs_review := false;
  -- Unanswered questions score 0 and need nobody's attention.
  if response is null or response = '{}'::jsonb
     or (response ? 'text' and btrim(coalesce(response ->> 'text', '')) = '')
     or (response ? 'choices' and jsonb_array_length(response -> 'choices') = 0) then
    score := 0;
    return;
  end if;

  if qtype = 'multiple_choice' or (qtype = 'listening' and content ->> 'format' = 'choice') then
    score := case when (response ->> 'choice')::integer = (answer ->> 'correct')::integer then points else 0 end;
  elsif qtype = 'true_false' then
    score := case when response -> 'value' = answer -> 'correct' then points else 0 end;
  elsif qtype = 'multiple_response' then
    -- Partial credit: right choices minus wrong choices, never below zero.
    correct_set := array(select (jsonb_array_elements_text(answer -> 'correct'))::integer);
    chosen := array(select distinct (jsonb_array_elements_text(response -> 'choices'))::integer);
    hits := cardinality(array(select unnest(chosen) intersect select unnest(correct_set)));
    score := round(points * greatest(0, hits - (cardinality(chosen) - hits))::numeric / cardinality(correct_set), 2);
  elsif qtype = 'matching' then
    total := jsonb_array_length(answer -> 'pairs');
    for i in 0 .. total - 1 loop
      if (response -> 'pairs' ->> i)::integer = (answer -> 'pairs' ->> i)::integer then
        ok := ok + 1;
      end if;
    end loop;
    score := round(points * ok / total, 2);
  elsif qtype = 'fill_blank' then
    cs := coalesce((answer ->> 'case_sensitive')::boolean, false);
    total := jsonb_array_length(answer -> 'blanks');
    for i in 0 .. total - 1 loop
      if exists (
        select 1 from jsonb_array_elements_text(answer -> 'blanks' -> i) a
        where private.normalize_answer(a, cs) = private.normalize_answer(response -> 'blanks' ->> i, cs)
          and btrim(coalesce(response -> 'blanks' ->> i, '')) <> ''
      ) then
        ok := ok + 1;
      end if;
    end loop;
    score := round(points * ok / total, 2);
  elsif qtype in ('short_answer', 'sentence_transformation', 'error_correction') then
    -- A listed answer earns full marks automatically; anything else goes to the teacher.
    if exists (
      select 1 from jsonb_array_elements_text(coalesce(answer -> 'accepted', '[]')) a
      where private.normalize_answer(a) = private.normalize_answer(response ->> 'text')
    ) then
      score := points;
    else
      score := null;
      needs_review := true;
    end if;
  else
    -- essay, speaking, listening with a written answer
    score := null;
    needs_review := true;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Question bank
-- -----------------------------------------------------------------------------
create table public.bank_questions (
  id              uuid primary key default gen_random_uuid(),
  subject_id      uuid not null references public.subjects (id) on delete restrict,
  question_type   public.question_type not null,
  skill           public.assignment_skill,
  cefr_level      public.cefr_level,
  topic           text check (char_length(topic) <= 100),
  difficulty      public.question_difficulty not null default 'medium',
  prompt          text not null check (btrim(prompt) <> '' and char_length(prompt) <= 5000),
  content         jsonb not null default '{}',
  media_path      text,
  points          numeric(6, 2) not null default 1 check (points > 0 and points <= 100),
  tags            text[] not null default '{}',
  status          public.bank_question_status not null default 'active',
  version         integer not null default 1,
  duplicated_from uuid references public.bank_questions (id) on delete set null,
  archived_at     timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (cardinality(tags) <= 20)
);

create index bank_questions_subject_idx on public.bank_questions (subject_id);
create index bank_questions_type_idx on public.bank_questions (question_type);
create index bank_questions_tags_idx on public.bank_questions using gin (tags);

create trigger bank_questions_set_updated_at
  before update on public.bank_questions
  for each row execute function private.set_updated_at();

create table public.bank_question_keys (
  question_id uuid primary key references public.bank_questions (id) on delete cascade,
  answer      jsonb not null default '{}',
  explanation text check (char_length(explanation) <= 5000),
  updated_at  timestamptz not null default now()
);

comment on table public.bank_question_keys is 'Correct answers and explanations; staff only.';

-- Media (listening audio, pictures) must be an uploaded object under questions/.
create or replace function private.check_question_media(media text, qtype public.question_type)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if media is null then
    return;
  end if;
  if media !~ '^questions/[0-9a-f-]{36}/[0-9a-f-]{36}\.(mp3|m4a|wav|webm|png|jpg|jpeg|webp)$' then
    raise exception 'Question media must be an uploaded audio file or picture.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'assignment-files' and o.name = media) then
    raise exception 'The question''s media file was not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function private.prepare_bank_question()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    new.version := 1;
    new.status := 'active';
    new.archived_at := null;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.duplicated_from := old.duplicated_from;
    if old.status = 'archived' and new.status = 'archived' then
      raise exception 'Restore the question before editing it.' using errcode = '22023';
    end if;
    new.archived_at := case when new.status = 'archived' then coalesce(old.archived_at, now()) end;
    if (new.question_type, new.prompt, new.content, new.media_path, new.points)
       is distinct from (old.question_type, old.prompt, old.content, old.media_path, old.points) then
      new.version := old.version + 1;
    else
      new.version := old.version;
    end if;
  end if;

  new.content := private.prepare_question_content(new.question_type, new.prompt, new.content);
  perform private.check_question_media(new.media_path, new.question_type);
  -- Tags: lower-case, trimmed, unique, at most 40 characters each.
  new.tags := array(
    select distinct lower(btrim(t)) from unnest(new.tags) t
    where btrim(t) <> '' and char_length(btrim(t)) <= 40
    order by 1
  );
  new.topic := nullif(btrim(new.topic), '');
  return new;
end;
$$;

create trigger bank_questions_prepare
  before insert or update on public.bank_questions
  for each row execute function private.prepare_bank_question();

create or replace function private.prepare_bank_question_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  question public.bank_questions;
begin
  select * into question from public.bank_questions where id = new.question_id;
  perform private.check_question_key(question.question_type, question.content, new.answer);
  new.explanation := nullif(btrim(new.explanation), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger bank_question_keys_prepare
  before insert or update on public.bank_question_keys
  for each row execute function private.prepare_bank_question_key();

-- Editing a question: every one (all) or one's own (own).
create or replace function private.can_edit_bank_question(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('question_bank.write', 'all')
    or (private.has_permission('question_bank.write', 'own') and owner = (select auth.uid()));
$$;

-- Creates or updates a question and its key in one transaction.
create or replace function public.save_bank_question(
  target_question_id uuid,
  fields jsonb,
  answer jsonb,
  answer_explanation text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved uuid;
begin
  if not private.has_any_permission('question_bank.write') then
    raise exception 'You do not have permission to edit the question bank.' using errcode = '42501';
  end if;

  if target_question_id is null then
    insert into public.bank_questions (subject_id, question_type, skill, cefr_level, topic, difficulty, prompt, content, media_path, points, tags)
    values (
      (fields ->> 'subject_id')::uuid,
      (fields ->> 'question_type')::public.question_type,
      (fields ->> 'skill')::public.assignment_skill,
      (fields ->> 'cefr_level')::public.cefr_level,
      fields ->> 'topic',
      coalesce((fields ->> 'difficulty')::public.question_difficulty, 'medium'),
      fields ->> 'prompt',
      coalesce(fields -> 'content', '{}'),
      fields ->> 'media_path',
      coalesce((fields ->> 'points')::numeric, 1),
      array(select jsonb_array_elements_text(coalesce(fields -> 'tags', '[]')))
    )
    returning id into saved;
  else
    update public.bank_questions set
      subject_id = (fields ->> 'subject_id')::uuid,
      question_type = (fields ->> 'question_type')::public.question_type,
      skill = (fields ->> 'skill')::public.assignment_skill,
      cefr_level = (fields ->> 'cefr_level')::public.cefr_level,
      topic = fields ->> 'topic',
      difficulty = coalesce((fields ->> 'difficulty')::public.question_difficulty, 'medium'),
      prompt = fields ->> 'prompt',
      content = coalesce(fields -> 'content', '{}'),
      media_path = fields ->> 'media_path',
      points = coalesce((fields ->> 'points')::numeric, 1),
      tags = array(select jsonb_array_elements_text(coalesce(fields -> 'tags', '[]')))
    where id = target_question_id
    returning id into saved;
    if saved is null then
      raise exception 'Question not found, or you may not edit it.' using errcode = 'P0002';
    end if;
  end if;

  insert into public.bank_question_keys (question_id, answer, explanation)
  values (saved, coalesce(answer, '{}'), answer_explanation)
  on conflict (question_id) do update set answer = excluded.answer, explanation = excluded.explanation;
  return saved;
end;
$$;

-- A copy owned by the caller (for adapting someone else's question).
create or replace function public.duplicate_bank_question(source_question_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  copy_id uuid;
begin
  if not private.has_any_permission('question_bank.write') then
    raise exception 'You do not have permission to edit the question bank.' using errcode = '42501';
  end if;
  insert into public.bank_questions (
    subject_id, question_type, skill, cefr_level, topic, difficulty, prompt, content, media_path, points, tags, duplicated_from
  )
  select subject_id, question_type, skill, cefr_level, topic, difficulty, prompt, content, media_path, points, tags, id
  from public.bank_questions where id = source_question_id
  returning id into copy_id;
  if copy_id is null then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;
  insert into public.bank_question_keys (question_id, answer, explanation)
  select copy_id, answer, explanation from public.bank_question_keys where question_id = source_question_id;
  return copy_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tests
-- -----------------------------------------------------------------------------
create table public.tests (
  id                 uuid primary key default gen_random_uuid(),
  class_id           uuid not null references public.classes (id) on delete restrict,
  title              text not null check (btrim(title) <> '' and char_length(title) <= 200),
  description        text check (char_length(description) <= 5000),
  instructions       text check (char_length(instructions) <= 10000),
  status             public.test_status not null default 'draft',
  available_from     timestamptz,
  available_until    timestamptz,
  time_limit_minutes integer check (time_limit_minutes between 1 and 600),
  max_attempts       integer not null default 1 check (max_attempts between 1 and 20),
  shuffle_questions  boolean not null default false,
  shuffle_options    boolean not null default false,
  total_score        numeric(6, 2) not null default 10 check (total_score > 0 and total_score <= 1000),
  review_policy      public.test_review_policy not null default 'after_last_attempt',
  published_at       timestamptz,
  closed_at          timestamptz,
  archived_at        timestamptz,
  created_by         uuid references public.profiles (id) on delete set null,
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (available_from is null or available_until is null or available_until > available_from)
);

comment on column public.tests.total_score is 'Scores are scaled to this total (raw points / all points x total).';
comment on column public.tests.review_policy is
  'When students and parents may see per-question marks, correct answers and explanations.';

create index tests_class_idx on public.tests (class_id);

create trigger tests_set_updated_at
  before update on public.tests
  for each row execute function private.set_updated_at();

create table public.test_questions (
  id                 uuid primary key default gen_random_uuid(),
  test_id            uuid not null references public.tests (id) on delete cascade,
  position           integer not null check (position > 0),
  source_question_id uuid references public.bank_questions (id) on delete set null,
  source_version     integer,
  question_type      public.question_type not null,
  prompt             text not null,
  content            jsonb not null,
  media_path         text,
  points             numeric(6, 2) not null check (points > 0 and points <= 100),
  constraint test_questions_position_unique unique (test_id, position) deferrable initially deferred,
  constraint test_questions_once_per_test unique (test_id, source_question_id)
);

create index test_questions_source_idx on public.test_questions (source_question_id);

create table public.test_question_keys (
  test_question_id uuid primary key references public.test_questions (id) on delete cascade,
  answer           jsonb not null,
  explanation      text
);

create table public.test_attempts (
  id              uuid primary key default gen_random_uuid(),
  test_id         uuid not null references public.tests (id) on delete restrict,
  student_id      uuid not null references public.students (id) on delete restrict,
  attempt_number  integer not null check (attempt_number >= 1),
  status          public.test_attempt_status not null default 'in_progress',
  question_order  uuid[] not null,
  option_orders   jsonb not null default '{}',
  started_at      timestamptz not null default now(),
  deadline_at     timestamptz,
  submitted_at    timestamptz,
  auto_submitted  boolean not null default false,
  raw_score       numeric(8, 2),
  raw_max         numeric(8, 2),
  score           numeric(8, 2),
  graded_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint test_attempts_numbered unique (test_id, student_id, attempt_number),
  check ((status = 'in_progress') = (submitted_at is null))
);

comment on column public.test_attempts.option_orders is
  'Per-question display order of options / matching answers for this attempt; responses always use the original indices.';

create unique index test_attempts_one_open on public.test_attempts (test_id, student_id) where status = 'in_progress';
create index test_attempts_student_idx on public.test_attempts (student_id);

create trigger test_attempts_set_updated_at
  before update on public.test_attempts
  for each row execute function private.set_updated_at();

create table public.test_answers (
  attempt_id       uuid not null references public.test_attempts (id) on delete cascade,
  test_question_id uuid not null references public.test_questions (id) on delete restrict,
  response         jsonb,
  auto_score       numeric(6, 2),
  manual_score     numeric(6, 2) check (manual_score >= 0),
  needs_review     boolean not null default false,
  feedback         text check (char_length(feedback) <= 5000),
  graded_by        uuid references public.profiles (id) on delete set null,
  graded_by_name   text,
  graded_at        timestamptz,
  updated_at       timestamptz not null default now(),
  primary key (attempt_id, test_question_id)
);

-- -----------------------------------------------------------------------------
-- Access helpers
-- -----------------------------------------------------------------------------
create or replace function private.can_write_class_tests(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('tests.write', 'all')
    or (private.has_permission('tests.write', 'assigned') and private.is_class_teacher(target_class_id));
$$;

create or replace function private.can_edit_test(target_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.tests t where t.id = target_test_id and private.can_write_class_tests(t.class_id));
$$;

-- Reading one student's attempts on one test.
create or replace function private.can_read_test_attempt(target_student_id uuid, target_test_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('tests.read', 'all')
    or (
      exists (select 1 from public.students s where s.id = target_student_id and s.deleted_at is null)
      and (
        (private.has_permission('tests.read', 'assigned')
          and exists (select 1 from public.tests t where t.id = target_test_id and private.is_class_teacher(t.class_id))
          and private.teaches_student(target_student_id))
        or (private.has_permission('tests.read', 'own') and target_student_id = private.current_student_id())
        or (private.has_permission('tests.read', 'children') and private.is_parent_of(target_student_id))
      )
    );
$$;

-- Grading an attempt: an editor of the test's class who can see the student.
create or replace function private.can_grade_attempt(target_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.test_attempts a join public.tests t on t.id = a.test_id
    where a.id = target_attempt_id
      and private.can_write_class_tests(t.class_id)
      and (private.has_permission('tests.write', 'all') or private.teaches_student(a.student_id))
  );
$$;

-- The caller's own attempt, open and within its time.
create or replace function private.owns_open_attempt(target_attempt_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('test_attempts.write', 'own') and exists (
    select 1 from public.test_attempts a
    where a.id::text = target_attempt_id
      and a.status = 'in_progress'
      and a.student_id = private.current_student_id()
      and (a.deadline_at is null or now() <= a.deadline_at + interval '30 seconds')
  );
$$;

-- May students/parents see per-question marks and keys for this attempt?
create or replace function private.review_open(target_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.test_attempts a join public.tests t on t.id = a.test_id
    where a.id = target_attempt_id
      and a.status <> 'in_progress'
      and case t.review_policy
        when 'never' then false
        when 'after_close' then t.status in ('closed', 'archived')
        else t.status in ('closed', 'archived') or (
          -- no attempts left and nothing in progress
          (select count(*) from public.test_attempts x where x.test_id = t.id and x.student_id = a.student_id) >= t.max_attempts
          and not exists (select 1 from public.test_attempts x
                          where x.test_id = t.id and x.student_id = a.student_id and x.status = 'in_progress')
        )
      end
  );
$$;

-- -----------------------------------------------------------------------------
-- Test rules
-- -----------------------------------------------------------------------------

-- Totals from the answers; graded once nothing is waiting for a teacher.
create or replace function private.recompute_attempt(target_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  raw numeric;
  maximum numeric;
  total numeric;
  pending boolean;
begin
  select coalesce(sum(coalesce(ans.manual_score, ans.auto_score, 0)), 0),
         bool_or(ans.needs_review and ans.manual_score is null)
  into raw, pending
  from public.test_answers ans where ans.attempt_id = target_attempt_id;

  select coalesce(sum(q.points), 0), t.total_score into maximum, total
  from public.test_attempts a
  join public.tests t on t.id = a.test_id
  join public.test_questions q on q.id = any (a.question_order)
  where a.id = target_attempt_id
  group by t.total_score;

  update public.test_attempts set
    raw_score = raw,
    raw_max = maximum,
    score = case when maximum > 0 then round(raw / maximum * total, 2) else 0 end,
    status = case when coalesce(pending, false) then 'submitted' else 'graded' end::public.test_attempt_status,
    graded_at = case when coalesce(pending, false) then null else coalesce(graded_at, now()) end
  where id = target_attempt_id;
end;
$$;

-- Hands in an attempt: every question gets an answer row and is graded
-- against the key (objective questions) or queued for the teacher.
create or replace function private.finalize_attempt(target_attempt_id uuid, automatic boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts;
begin
  select * into attempt from public.test_attempts where id = target_attempt_id for update;
  if attempt.status <> 'in_progress' then
    return;
  end if;

  insert into public.test_answers (attempt_id, test_question_id)
  select attempt.id, q from unnest(attempt.question_order) q
  on conflict do nothing;

  update public.test_answers ans set
    auto_score = g.score,
    needs_review = g.needs_review
  from (
    select a2.test_question_id, r.score, r.needs_review
    from public.test_answers a2
    join public.test_questions q on q.id = a2.test_question_id
    left join public.test_question_keys k on k.test_question_id = q.id
    cross join lateral private.grade_response(q.question_type, q.content, coalesce(k.answer, '{}'), a2.response, q.points) r
    where a2.attempt_id = attempt.id
  ) g
  where ans.attempt_id = attempt.id and ans.test_question_id = g.test_question_id;

  update public.test_attempts set
    status = 'submitted',
    submitted_at = case when automatic and deadline_at is not null then least(now(), deadline_at) else now() end,
    auto_submitted = automatic
  where id = attempt.id;

  perform private.recompute_attempt(attempt.id);
end;
$$;

-- Lifecycle: draft -> published -> closed -> archived (published <-> closed;
-- archived -> closed if it was ever published, else draft). Settings that
-- change results freeze once anyone has started.
create or replace function private.prepare_test()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  klass public.classes;
  started boolean;
begin
  if tg_op = 'INSERT' then
    select * into klass from public.classes where id = new.class_id;
    if not found or klass.deleted_at is not null or klass.status not in ('planned', 'active') then
      raise exception 'Tests can only be set for planned or running classes.' using errcode = '22023';
    end if;
    if new.status <> 'draft' then
      raise exception 'New tests start as drafts.' using errcode = '22023';
    end if;
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    new.published_at := null;
    new.closed_at := null;
    new.archived_at := null;
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_by_name := old.created_by_name;
  new.created_at := old.created_at;
  started := exists (select 1 from public.test_attempts a where a.test_id = old.id);

  if old.status = 'archived' and new.status = 'archived' then
    raise exception 'Restore the test before editing it.' using errcode = '22023';
  end if;
  if new.class_id <> old.class_id and old.published_at is not null then
    raise exception 'The class cannot change once the test has been published.' using errcode = '22023';
  end if;
  if started and (new.total_score, new.shuffle_questions, new.shuffle_options)
                 is distinct from (old.total_score, old.shuffle_questions, old.shuffle_options) then
    raise exception 'Scoring and randomisation cannot change once students have started.' using errcode = '22023';
  end if;
  if started and new.max_attempts < old.max_attempts then
    raise exception 'The number of attempts can only go up once students have started.' using errcode = '22023';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'draft' and new.status in ('published', 'archived'))
      or (old.status = 'published' and new.status in ('closed', 'archived'))
      or (old.status = 'closed' and new.status in ('published', 'archived'))
      or (old.status = 'archived' and ((new.status = 'closed' and old.published_at is not null)
                                        or (new.status = 'draft' and old.published_at is null)))
    ) then
      raise exception 'A test cannot go from % to %.', old.status, new.status using errcode = '22023';
    end if;

    if new.status = 'published' and old.status = 'draft' then
      if not exists (select 1 from public.test_questions q where q.test_id = old.id) then
        raise exception 'Add at least one question before publishing.' using errcode = '22023';
      end if;
      if new.available_until is not null and new.available_until <= now() then
        raise exception 'The closing time must be in the future.' using errcode = '22023';
      end if;
    end if;

    case new.status
      when 'published' then new.published_at := coalesce(old.published_at, now()); new.closed_at := null; new.archived_at := null;
      when 'closed' then new.closed_at := now(); new.archived_at := null;
      when 'archived' then new.archived_at := now();
      else new.archived_at := null;
    end case;
  end if;
  return new;
end;
$$;

create trigger tests_prepare
  before insert or update on public.tests
  for each row execute function private.prepare_test();

-- Closing a test hands in every attempt still open.
create or replace function private.finalize_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  open_attempt uuid;
begin
  if new.status in ('closed', 'archived') and old.status = 'published' then
    for open_attempt in select id from public.test_attempts where test_id = new.id and status = 'in_progress' loop
      perform private.finalize_attempt(open_attempt, true);
    end loop;
  end if;
  return null;
end;
$$;

create trigger tests_finalize_on_close
  after update of status on public.tests
  for each row execute function private.finalize_on_close();

-- A test's questions change only while it is a draft.
create or replace function private.guard_test_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if tg_table_name = 'test_question_keys' then
    select q.test_id into target from public.test_questions q
    where q.id = coalesce(new.test_question_id, old.test_question_id);
  else
    target := coalesce(new.test_id, old.test_id);
    if tg_op = 'UPDATE' and new.test_id <> old.test_id then
      raise exception 'Questions cannot move to another test.' using errcode = '22023';
    end if;
  end if;
  if target is not null and exists (select 1 from public.tests t where t.id = target and t.status <> 'draft') then
    raise exception 'Questions can only change while the test is a draft.' using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger test_questions_guard
  before insert or update or delete on public.test_questions
  for each row execute function private.guard_test_questions();
create trigger test_question_keys_guard
  before insert or update or delete on public.test_question_keys
  for each row execute function private.guard_test_questions();

-- Answers: only for this attempt's questions, in the question's format, and
-- (speaking) with a validated uploaded recording.
create or replace function private.check_test_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts;
  q public.test_questions;
  r jsonb := new.response;
  n integer;
begin
  if tg_op = 'UPDATE' then
    new.attempt_id := old.attempt_id;
    new.test_question_id := old.test_question_id;
  end if;
  select * into attempt from public.test_attempts where id = new.attempt_id;
  if not (new.test_question_id = any (attempt.question_order)) then
    raise exception 'This question is not part of the attempt.' using errcode = '22023';
  end if;

  -- Graders and the hand-in function change scores, never responses; an
  -- empty row (added when an attempt is handed in) carries no answer.
  if (tg_op = 'UPDATE' and new.response is not distinct from old.response)
     or (tg_op = 'INSERT' and new.response is null) then
    return new;
  end if;
  if attempt.status <> 'in_progress' then
    raise exception 'This attempt has been handed in and can no longer be changed.' using errcode = '42501';
  end if;
  if attempt.deadline_at is not null and now() > attempt.deadline_at + interval '30 seconds' then
    raise exception 'Time is up for this attempt.' using errcode = '22023';
  end if;
  new.updated_at := now();
  if r is null or r = '{}'::jsonb then
    return new;
  end if;

  select * into q from public.test_questions where id = new.test_question_id;
  if coalesce(jsonb_typeof(r), '') <> 'object' then
    raise exception 'The answer is not in the expected format.' using errcode = '22023';
  end if;

  if q.question_type = 'multiple_choice' or (q.question_type = 'listening' and q.content ->> 'format' = 'choice') then
    if coalesce(jsonb_typeof(r -> 'choice'), '') <> 'number'
       or not private.is_index_array(jsonb_build_array(r -> 'choice'), jsonb_array_length(q.content -> 'options')) then
      raise exception 'Choose one of the options.' using errcode = '22023';
    end if;
  elsif q.question_type = 'multiple_response' then
    if not private.is_index_array(r -> 'choices', jsonb_array_length(q.content -> 'options')) then
      raise exception 'Choose among the options.' using errcode = '22023';
    end if;
  elsif q.question_type = 'true_false' then
    if coalesce(jsonb_typeof(r -> 'value'), '') <> 'boolean' then
      raise exception 'Answer true or false.' using errcode = '22023';
    end if;
  elsif q.question_type = 'matching' then
    n := jsonb_array_length(q.content -> 'left');
    if not private.is_index_array(r -> 'pairs', n, true) or coalesce(jsonb_array_length(r -> 'pairs'), -1) <> n then
      raise exception 'The matching answer is not in the expected format.' using errcode = '22023';
    end if;
  elsif q.question_type = 'fill_blank' then
    if coalesce(jsonb_typeof(r -> 'blanks'), '') <> 'array' or jsonb_array_length(r -> 'blanks') > (q.content ->> 'blank_count')::integer
       or exists (select 1 from jsonb_array_elements(r -> 'blanks') b where jsonb_typeof(b) <> 'string' or char_length(b #>> '{}') > 200) then
      raise exception 'The answer is not in the expected format.' using errcode = '22023';
    end if;
  elsif q.question_type = 'speaking' then
    if coalesce(jsonb_typeof(r -> 'file'), '') <> 'object' or coalesce(r -> 'file' ->> 'mime', '') not like 'audio/%' then
      raise exception 'Upload an audio recording.' using errcode = '22023';
    end if;
    perform private.validate_upload(
      r -> 'file' ->> 'path', 'test-attempts/' || new.attempt_id, r -> 'file' ->> 'name',
      r -> 'file' ->> 'mime', (r -> 'file' ->> 'size')::bigint
    );
  else
    if coalesce(jsonb_typeof(r -> 'text'), '') <> 'string' or char_length(r ->> 'text') > 10000 then
      raise exception 'Answers can be at most 10,000 characters.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger test_answers_check
  before insert or update on public.test_answers
  for each row execute function private.check_test_answer();

-- -----------------------------------------------------------------------------
-- Teacher RPCs
-- -----------------------------------------------------------------------------

-- Copies bank questions (content, points and key) into a draft test.
create or replace function public.add_test_questions(target_test_id uuid, question_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item record;
  next_position integer;
  added integer := 0;
  copy_id uuid;
begin
  if not private.can_edit_test(target_test_id) then
    raise exception 'You can only build tests for classes you teach.' using errcode = '42501';
  end if;
  if not private.has_any_permission('question_bank.read') then
    raise exception 'You do not have access to the question bank.' using errcode = '42501';
  end if;
  select coalesce(max(position), 0) into next_position from public.test_questions where test_id = target_test_id;

  for item in
    select q.*, k.answer, k.explanation, ord.n
    -- Each question once, in the order given (first occurrence wins).
    from (select distinct on (x.id) x.id, x.n from unnest(question_ids) with ordinality as x (id, n) order by x.id, x.n) ord
    join public.bank_questions q on q.id = ord.id
    left join public.bank_question_keys k on k.question_id = q.id
    where not exists (select 1 from public.test_questions t where t.test_id = target_test_id and t.source_question_id = q.id)
    order by ord.n
  loop
    if item.status = 'archived' then
      raise exception 'Archived questions cannot be added.' using errcode = '22023';
    end if;
    if private.is_auto_graded(item.question_type, item.content) then
      if item.answer is null then
        raise exception 'Add an answer key to "%" before using it in a test.', left(item.prompt, 80) using errcode = '22023';
      end if;
      perform private.check_question_key(item.question_type, item.content, item.answer);
    end if;
    next_position := next_position + 1;
    insert into public.test_questions (test_id, position, source_question_id, source_version, question_type, prompt, content, media_path, points)
    values (target_test_id, next_position, item.id, item.version, item.question_type, item.prompt, item.content, item.media_path, item.points)
    returning id into copy_id;
    insert into public.test_question_keys (test_question_id, answer, explanation)
    values (copy_id, coalesce(item.answer, '{}'), item.explanation);
    added := added + 1;
  end loop;
  if added = 0 and cardinality(question_ids) > 0
     and exists (select 1 from unnest(question_ids) x where not exists (select 1 from public.bank_questions b where b.id = x)) then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;
  return added;
end;
$$;

create or replace function public.move_test_question(target_question_id uuid, direction text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current public.test_questions;
  neighbour public.test_questions;
begin
  select * into current from public.test_questions where id = target_question_id;
  if not found or not private.can_edit_test(current.test_id) then
    raise exception 'Question not found.' using errcode = 'P0002';
  end if;
  if direction = 'up' then
    select * into neighbour from public.test_questions
    where test_id = current.test_id and position < current.position order by position desc limit 1;
  else
    select * into neighbour from public.test_questions
    where test_id = current.test_id and position > current.position order by position limit 1;
  end if;
  if not found then
    return;
  end if;
  update public.test_questions set position = neighbour.position where id = current.id;
  update public.test_questions set position = current.position where id = neighbour.id;
end;
$$;

-- Marks one answer (essay, speaking...) or overrides an automatic mark.
create or replace function public.grade_test_answer(
  target_attempt_id uuid,
  target_question_id uuid,
  new_score numeric,
  new_feedback text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts;
  maximum numeric;
begin
  if not private.can_grade_attempt(target_attempt_id) then
    raise exception 'You can only grade tests from classes you teach.' using errcode = '42501';
  end if;
  select * into attempt from public.test_attempts where id = target_attempt_id for update;
  if attempt.status = 'in_progress' then
    raise exception 'This attempt has not been handed in yet.' using errcode = '22023';
  end if;
  select points into maximum from public.test_questions where id = target_question_id and id = any (attempt.question_order);
  if not found then
    raise exception 'This question is not part of the attempt.' using errcode = 'P0002';
  end if;
  if new_score is null or new_score < 0 or new_score > maximum then
    raise exception 'The score must be between 0 and %.', trim_scale(maximum) using errcode = '22023';
  end if;

  update public.test_answers set
    manual_score = new_score,
    needs_review = false,
    feedback = nullif(btrim(new_feedback), ''),
    graded_by = (select auth.uid()),
    graded_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), ''),
    graded_at = now()
  where attempt_id = target_attempt_id and test_question_id = target_question_id;
  perform private.recompute_attempt(target_attempt_id);
end;
$$;

-- Hands in attempts whose time ran out without the student submitting.
create or replace function public.close_expired_attempts(target_test_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired uuid;
  closed integer := 0;
begin
  if not private.can_edit_test(target_test_id) and not private.has_permission('tests.read', 'all') then
    raise exception 'You can only manage tests from classes you teach.' using errcode = '42501';
  end if;
  for expired in
    select id from public.test_attempts
    where test_id = target_test_id and status = 'in_progress' and deadline_at < now() - interval '30 seconds'
  loop
    perform private.finalize_attempt(expired, true);
    closed := closed + 1;
  end loop;
  return closed;
end;
$$;

-- -----------------------------------------------------------------------------
-- Student RPCs
-- -----------------------------------------------------------------------------

-- Starts (or continues) an attempt: questions in random order if the test
-- says so, option order shuffled per attempt, deadline from the time limit
-- and the closing time.
create or replace function public.start_test(target_test_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  test public.tests;
  open_attempt public.test_attempts;
  taken integer;
  ordering uuid[];
  orders jsonb;
  new_id uuid;
begin
  if me is null or not private.has_permission('test_attempts.write', 'own') then
    raise exception 'Only students can take tests.' using errcode = '42501';
  end if;
  select * into test from public.tests where id = target_test_id;
  if not found or test.status not in ('published', 'closed') or not private.is_class_student(test.class_id) then
    raise exception 'Test not found.' using errcode = 'P0002';
  end if;

  -- An attempt left open past its deadline is handed in first.
  select * into open_attempt from public.test_attempts
  where test_id = test.id and student_id = me and status = 'in_progress' for update;
  if found then
    if open_attempt.deadline_at is null or now() <= open_attempt.deadline_at + interval '30 seconds' then
      return open_attempt.id;
    end if;
    perform private.finalize_attempt(open_attempt.id, true);
  end if;

  if test.status <> 'published' then
    raise exception 'This test is closed.' using errcode = '22023';
  end if;
  if test.available_from is not null and now() < test.available_from then
    raise exception 'This test opens at %.', to_char(test.available_from at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
      using errcode = '22023';
  end if;
  if test.available_until is not null and now() >= test.available_until then
    raise exception 'This test has closed.' using errcode = '22023';
  end if;
  select count(*) into taken from public.test_attempts where test_id = test.id and student_id = me;
  if taken >= test.max_attempts then
    raise exception 'You have used all % attempt(s) for this test.', test.max_attempts using errcode = '22023';
  end if;

  ordering := array(
    select q.id from public.test_questions q where q.test_id = test.id
    order by case when test.shuffle_questions then random() end, q.position
  );
  select coalesce(jsonb_object_agg(q.id, (
           select jsonb_agg(i - 1 order by case when test.shuffle_options then random() end, i)
           from generate_series(1, jsonb_array_length(coalesce(q.content -> 'options', q.content -> 'right'))) i
         )), '{}')
  into orders
  from public.test_questions q
  where q.test_id = test.id and (q.content ? 'options' or q.content ? 'right');

  insert into public.test_attempts (test_id, student_id, attempt_number, question_order, option_orders, deadline_at)
  values (
    test.id, me, taken + 1, ordering, orders,
    nullif(least(
      coalesce(now() + make_interval(mins => test.time_limit_minutes), 'infinity'::timestamptz),
      coalesce(test.available_until, 'infinity'::timestamptz)
    ), 'infinity'::timestamptz)
  )
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.submit_test_attempt(target_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts;
begin
  select * into attempt from public.test_attempts where id = target_attempt_id;
  if not found or attempt.student_id is distinct from private.current_student_id()
     or not private.has_permission('test_attempts.write', 'own') then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  if attempt.status <> 'in_progress' then
    raise exception 'This attempt has already been handed in.' using errcode = '22023';
  end if;
  perform private.finalize_attempt(attempt.id, false);
end;
$$;

-- -----------------------------------------------------------------------------
-- Reading answers and results (the policy lives here)
-- -----------------------------------------------------------------------------

-- An attempt's questions (in the attempt's order) with the response, and -
-- for graders, or for students/parents once review is open - marks, feedback,
-- correct answers and explanations.
create or replace function public.attempt_details(target_attempt_id uuid)
returns table (
  test_question_id uuid,
  question_position integer,
  question_type public.question_type,
  prompt text,
  content jsonb,
  media_path text,
  points numeric,
  response jsonb,
  auto_score numeric,
  manual_score numeric,
  needs_review boolean,
  feedback text,
  correct_answer jsonb,
  explanation text,
  review_open boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  attempt public.test_attempts;
  grader boolean;
  reviewing boolean;
begin
  select * into attempt from public.test_attempts where id = target_attempt_id;
  if not found or not private.can_read_test_attempt(attempt.student_id, attempt.test_id) then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  grader := private.can_grade_attempt(attempt.id) or private.has_permission('tests.read', 'all');
  reviewing := grader or private.review_open(attempt.id);

  return query
  select q.id, o.n::integer, q.question_type, q.prompt, q.content, q.media_path, q.points,
         ans.response,
         case when reviewing then ans.auto_score end,
         case when reviewing then ans.manual_score end,
         case when reviewing then coalesce(ans.needs_review, false) end,
         case when reviewing then ans.feedback end,
         case when reviewing and attempt.status <> 'in_progress' or grader then k.answer end,
         case when reviewing and attempt.status <> 'in_progress' or grader then k.explanation end,
         reviewing
  from unnest(attempt.question_order) with ordinality as o (id, n)
  join public.test_questions q on q.id = o.id
  left join public.test_answers ans on ans.attempt_id = attempt.id and ans.test_question_id = q.id
  left join public.test_question_keys k on k.test_question_id = q.id
  order by o.n;
end;
$$;

-- Per-question results over handed-in attempts (for the test's teachers).
create or replace function public.test_question_stats(target_test_id uuid)
returns table (
  test_question_id uuid,
  question_position integer,
  question_type public.question_type,
  prompt text,
  points numeric,
  answered bigint,
  attempts bigint,
  average_score numeric,
  full_marks bigint,
  awaiting_review bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.can_edit_test(target_test_id) and not private.has_permission('tests.read', 'all') then
    raise exception 'You can only see results for tests from classes you teach.' using errcode = '42501';
  end if;
  return query
  select q.id, q.position, q.question_type, q.prompt, q.points,
         count(ans.response) filter (where ans.response is not null and ans.response <> '{}'::jsonb),
         count(ans.attempt_id),
         round(avg(coalesce(ans.manual_score, ans.auto_score)), 2),
         count(*) filter (where coalesce(ans.manual_score, ans.auto_score) >= q.points),
         count(*) filter (where ans.needs_review and ans.manual_score is null)
  from public.test_questions q
  left join public.test_answers ans on ans.test_question_id = q.id
    and exists (select 1 from public.test_attempts a where a.id = ans.attempt_id and a.status <> 'in_progress'
                and (private.has_permission('tests.write', 'all') or private.has_permission('tests.read', 'all')
                     or private.teaches_student(a.student_id)))
  where q.test_id = target_test_id
  group by q.id
  order by q.position;
end;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.save_bank_question(uuid, jsonb, jsonb, text)',
    'public.duplicate_bank_question(uuid)',
    'public.add_test_questions(uuid, uuid[])',
    'public.move_test_question(uuid, text)',
    'public.grade_test_answer(uuid, uuid, numeric, text)',
    'public.close_expired_attempts(uuid)',
    'public.start_test(uuid)',
    'public.submit_test_attempt(uuid)',
    'public.attempt_details(uuid)',
    'public.test_question_stats(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.bank_questions enable row level security;
alter table public.bank_question_keys enable row level security;
alter table public.tests enable row level security;
alter table public.test_questions enable row level security;
alter table public.test_question_keys enable row level security;
alter table public.test_attempts enable row level security;
alter table public.test_answers enable row level security;

-- The bank is staff-only; students and parents never read it.
create policy bank_questions_select on public.bank_questions for select to authenticated
  using ((select private.has_any_permission('question_bank.read')));
create policy bank_questions_insert on public.bank_questions for insert to authenticated
  with check ((select private.has_any_permission('question_bank.write')));
create policy bank_questions_update on public.bank_questions for update to authenticated
  using (private.can_edit_bank_question(created_by))
  with check (private.can_edit_bank_question(created_by));

create policy bank_question_keys_select on public.bank_question_keys for select to authenticated
  using ((select private.has_any_permission('question_bank.read')));
create policy bank_question_keys_write on public.bank_question_keys for all to authenticated
  using (exists (select 1 from public.bank_questions q where q.id = question_id and private.can_edit_bank_question(q.created_by)))
  with check (exists (select 1 from public.bank_questions q where q.id = question_id and private.can_edit_bank_question(q.created_by)));

-- Questions are archived, never deleted (tests keep their own copies anyway).
revoke delete on public.bank_questions, public.bank_question_keys from authenticated;

create policy tests_select on public.tests for select to authenticated using (
  private.can_write_class_tests(class_id)
  or (select private.has_permission('tests.read', 'all'))
  or ((select private.has_permission('tests.read', 'assigned')) and private.is_class_teacher(class_id))
  or (status in ('published', 'closed') and (
       ((select private.has_permission('tests.read', 'own')) and private.is_class_student(class_id))
    or ((select private.has_permission('tests.read', 'children')) and private.is_class_of_child(class_id))
  ))
);
create policy tests_insert on public.tests for insert to authenticated
  with check (private.can_write_class_tests(class_id));
create policy tests_update on public.tests for update to authenticated
  using (private.can_write_class_tests(class_id))
  with check (private.can_write_class_tests(class_id));
create policy tests_delete on public.tests for delete to authenticated
  using (status = 'draft' and published_at is null and private.can_write_class_tests(class_id));

-- Students see a test's questions only once they have started it (no preview);
-- parents once a child has.
create policy test_questions_select on public.test_questions for select to authenticated using (
  private.can_edit_test(test_id)
  or (select private.has_permission('tests.read', 'all'))
  or exists (
    select 1 from public.test_attempts a where a.test_id = test_questions.test_id
      and (a.student_id = private.current_student_id()
           or ((select private.has_permission('tests.read', 'children')) and private.is_parent_of(a.student_id)))
  )
  or ((select private.has_permission('tests.read', 'assigned'))
      and exists (select 1 from public.tests t where t.id = test_id and private.is_class_teacher(t.class_id)))
);
create policy test_questions_write on public.test_questions for all to authenticated
  using (private.can_edit_test(test_id))
  with check (private.can_edit_test(test_id));

-- Keys: the test's editors only. Students get correct answers exclusively
-- through attempt_details(), when the review policy allows.
create policy test_question_keys_all on public.test_question_keys for all to authenticated
  using (exists (select 1 from public.test_questions q where q.id = test_question_id and private.can_edit_test(q.test_id)))
  with check (exists (select 1 from public.test_questions q where q.id = test_question_id and private.can_edit_test(q.test_id)));

create policy test_attempts_select on public.test_attempts for select to authenticated
  using (private.can_read_test_attempt(student_id, test_id));

create policy test_answers_select on public.test_answers for select to authenticated
  using (exists (select 1 from public.test_attempts a where a.id = attempt_id));
create policy test_answers_insert on public.test_answers for insert to authenticated
  with check (private.owns_open_attempt(attempt_id::text));
create policy test_answers_update on public.test_answers for update to authenticated
  using (private.owns_open_attempt(attempt_id::text))
  with check (private.owns_open_attempt(attempt_id::text));

-- Attempts are created, handed in and graded only by the functions above.
revoke insert, update, delete on public.test_attempts from authenticated;
-- Marks are not readable through the API (attempt_details() applies the
-- review policy); students write only their response.
revoke all on public.test_answers from authenticated;
grant select (attempt_id, test_question_id, response, updated_at) on public.test_answers to authenticated;
grant insert (attempt_id, test_question_id, response) on public.test_answers to authenticated;
grant update (response) on public.test_answers to authenticated;

revoke all on public.bank_questions, public.bank_question_keys, public.tests, public.test_questions,
  public.test_question_keys, public.test_attempts, public.test_answers from anon;

-- -----------------------------------------------------------------------------
-- Storage (same validated bucket as assignments):
--   assignment-files/questions/<bank_question_id>/<uuid>.<ext>   question media
--   assignment-files/test-attempts/<attempt_id>/<uuid>.<ext>     spoken answers
-- -----------------------------------------------------------------------------
create or replace function private.can_edit_question_media(target_question_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.bank_questions q
    where q.id::text = target_question_id and q.status = 'active' and private.can_edit_bank_question(q.created_by)
  );
$$;

create policy question_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files' and (
    ((storage.foldername(name))[1] = 'questions' and (
      (select private.has_any_permission('question_bank.read'))
      or exists (select 1 from public.test_questions tq where tq.media_path = name)
    ))
    or ((storage.foldername(name))[1] = 'test-attempts'
      and exists (select 1 from public.test_attempts a where a.id::text = (storage.foldername(name))[2]))
  )
);
create policy question_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (
    ((storage.foldername(name))[1] = 'questions' and private.can_edit_question_media((storage.foldername(name))[2]))
    or ((storage.foldername(name))[1] = 'test-attempts' and private.owns_open_attempt((storage.foldername(name))[2]))
  )
);
create policy question_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'assignment-files' and (
    ((storage.foldername(name))[1] = 'questions' and private.can_edit_question_media((storage.foldername(name))[2]))
    or ((storage.foldername(name))[1] = 'test-attempts' and private.owns_open_attempt((storage.foldername(name))[2]))
  )
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
