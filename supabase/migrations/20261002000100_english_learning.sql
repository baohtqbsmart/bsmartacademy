-- =============================================================================
-- English learning.
--
--   vocabulary_words / vocabulary_sets     word bank and study sets
--   vocabulary_practice / vocabulary_progress
--                                          practice results and per-word
--                                          spaced repetition (Leitner boxes)
--   lessons                                grammar, reading, listening,
--                                          speaking, writing and pronunciation
--   lesson_private                         transcript and model answer (shown
--                                          to a student only after they have
--                                          done the lesson)
--   lesson_questions / lesson_question_keys exercises copied from the question
--                                          bank; keys staff-only, graded in SQL
--   lesson_attempts                        every exercise attempt
--   lesson_submissions                     speaking / writing / pronunciation
--                                          work with teacher feedback and rubric
--
-- Content (published words, sets and lessons) is a library open to every
-- signed-in user. Results follow the usual scopes: students their own,
-- parents their children's, teachers the students they teach.
-- =============================================================================

insert into public.permissions (code, description) values
  ('english.read',     'Use the English learning library'),
  ('english.write',    'Create and edit English learning content'),
  ('english.practice', 'Practise vocabulary, do exercises and submit work'),
  ('english.results',  'View English learning results'),
  ('english.review',   'Give feedback on speaking and writing');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'english.read',    'all'),
  ('super_admin', 'english.write',   'all'),
  ('super_admin', 'english.results', 'all'),
  ('super_admin', 'english.review',  'all'),
  ('admin',       'english.read',    'all'),
  ('admin',       'english.write',   'all'),
  ('admin',       'english.results', 'all'),
  ('admin',       'english.review',  'all'),
  ('teacher',     'english.read',    'all'),
  ('teacher',     'english.write',   'own'),
  ('teacher',     'english.results', 'assigned'),
  ('teacher',     'english.review',  'assigned'),
  ('student',     'english.read',    'all'),
  ('student',     'english.practice', 'own'),
  ('student',     'english.results', 'own'),
  ('parent',      'english.read',    'all'),
  ('parent',      'english.results', 'children');

create type public.english_skill as enum ('vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'pronunciation');
create type public.part_of_speech as enum (
  'noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'determiner',
  'interjection', 'phrasal_verb', 'phrase', 'idiom'
);
create type public.content_status as enum ('draft', 'published', 'archived');
create type public.vocabulary_activity as enum ('flashcards', 'matching', 'multiple_choice', 'fill_blank', 'spelling', 'pronunciation');
create type public.response_mode as enum ('text', 'audio', 'video', 'audio_or_video');
create type public.lesson_submission_status as enum ('submitted', 'reviewed');

-- Phone videos for speaking work.
insert into public.upload_file_types (mime_type, extensions, label) values ('video/quicktime', '{mov}', 'QuickTime video');
update storage.buckets set allowed_mime_types = array(select mime_type from public.upload_file_types) where id = 'assignment-files';

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------

-- Editing content: everything (all) or one's own (own).
create or replace function private.can_edit_english(owner uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('english.write', 'all')
    or (private.has_permission('english.write', 'own') and owner = (select auth.uid()));
$$;

create or replace function private.can_read_english_results(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('english.results', 'all')
    or (
      exists (select 1 from public.students s where s.id = target_student_id and s.deleted_at is null)
      and (
        (private.has_permission('english.results', 'assigned') and private.teaches_student(target_student_id))
        or (private.has_permission('english.results', 'own') and target_student_id = private.current_student_id())
        or (private.has_permission('english.results', 'children') and private.is_parent_of(target_student_id))
      )
    );
$$;

create or replace function private.can_review_english(target_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('english.review', 'all')
    or (private.has_permission('english.review', 'assigned') and private.teaches_student(target_student_id));
$$;

-- Word audio/pictures and lesson media: english-content/<uuid>.<ext>, uploaded.
create or replace function private.check_english_media(media text, kinds text)
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
  if media !~ ('^english-content/[0-9a-f-]{36}\.(' || kinds || ')$') then
    raise exception 'This media file is not an accepted type.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'assignment-files' and o.name = media) then
    raise exception 'The media file was not found. Upload it again.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function private.clean_text_list(items text[], max_items integer default 20)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array(
    select distinct on (lower(btrim(x))) btrim(x) from unnest(coalesce(items, '{}')) x
    where btrim(x) <> '' and char_length(btrim(x)) <= 200
    order by lower(btrim(x))
    limit max_items
  ), '{}');
$$;

-- Shared stamping for content tables: author set on insert, kept afterwards.
create or replace function private.stamp_english_content()
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
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Vocabulary
-- -----------------------------------------------------------------------------
create table public.vocabulary_words (
  id              uuid primary key default gen_random_uuid(),
  word            text not null check (btrim(word) <> '' and char_length(word) <= 100),
  ipa             text check (char_length(ipa) <= 100),
  part_of_speech  public.part_of_speech not null,
  meaning_vi      text not null check (btrim(meaning_vi) <> '' and char_length(meaning_vi) <= 500),
  definition_en   text check (char_length(definition_en) <= 1000),
  example         text check (char_length(example) <= 1000),
  audio_path      text,
  image_path      text,
  collocations    text[] not null default '{}',
  synonyms        text[] not null default '{}',
  antonyms        text[] not null default '{}',
  cefr_level      public.cefr_level,
  topic           text check (char_length(topic) <= 100),
  status          public.content_status not null default 'published',
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index vocabulary_words_unique on public.vocabulary_words (lower(word), part_of_speech);
create index vocabulary_words_topic_idx on public.vocabulary_words (topic);

create or replace function private.prepare_vocabulary_word()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.word := btrim(new.word);
  new.ipa := nullif(btrim(new.ipa), '');
  new.topic := nullif(btrim(new.topic), '');
  new.collocations := private.clean_text_list(new.collocations);
  new.synonyms := private.clean_text_list(new.synonyms);
  new.antonyms := private.clean_text_list(new.antonyms);
  perform private.check_english_media(new.audio_path, 'mp3|m4a|wav|webm');
  perform private.check_english_media(new.image_path, 'png|jpg|jpeg|webp');
  return new;
end;
$$;

create trigger vocabulary_words_stamp before insert or update on public.vocabulary_words
  for each row execute function private.stamp_english_content();
create trigger vocabulary_words_prepare before insert or update on public.vocabulary_words
  for each row execute function private.prepare_vocabulary_word();

create table public.vocabulary_sets (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (btrim(title) <> '' and char_length(title) <= 200),
  description     text check (char_length(description) <= 2000),
  cefr_level      public.cefr_level,
  topic           text check (char_length(topic) <= 100),
  status          public.content_status not null default 'draft',
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger vocabulary_sets_stamp before insert or update on public.vocabulary_sets
  for each row execute function private.stamp_english_content();

create table public.vocabulary_set_words (
  set_id   uuid not null references public.vocabulary_sets (id) on delete cascade,
  word_id  uuid not null references public.vocabulary_words (id) on delete restrict,
  position integer not null default 0,
  primary key (set_id, word_id)
);

create index vocabulary_set_words_word_idx on public.vocabulary_set_words (word_id);

-- Publishing a set needs at least 4 words (enough for every activity).
create or replace function private.check_vocabulary_set()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published'
     and (select count(*) from public.vocabulary_set_words w where w.set_id = new.id) < 4 then
    raise exception 'Add at least 4 words before publishing the set.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger vocabulary_sets_check before insert or update on public.vocabulary_sets
  for each row execute function private.check_vocabulary_set();

create table public.vocabulary_practice (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  set_id     uuid not null references public.vocabulary_sets (id) on delete restrict,
  activity   public.vocabulary_activity not null,
  correct    integer not null check (correct >= 0),
  total      integer not null check (total > 0 and correct <= total),
  created_at timestamptz not null default now()
);

create index vocabulary_practice_student_idx on public.vocabulary_practice (student_id, created_at desc);

-- Spaced repetition: box 1..5; a right answer moves the word up a box (review
-- later), a wrong one back to box 1 (review tomorrow).
create table public.vocabulary_progress (
  student_id        uuid not null references public.students (id) on delete cascade,
  word_id           uuid not null references public.vocabulary_words (id) on delete cascade,
  box               smallint not null default 1 check (box between 1 and 5),
  correct_count     integer not null default 0,
  wrong_count       integer not null default 0,
  last_practiced_at timestamptz not null default now(),
  next_review_on    date not null,
  primary key (student_id, word_id)
);

create index vocabulary_progress_due_idx on public.vocabulary_progress (student_id, next_review_on);

-- -----------------------------------------------------------------------------
-- Lessons (grammar, reading, listening, speaking, writing, pronunciation)
-- -----------------------------------------------------------------------------
create table public.lessons (
  id              uuid primary key default gen_random_uuid(),
  skill           public.english_skill not null check (skill <> 'vocabulary'),
  title           text not null check (btrim(title) <> '' and char_length(title) <= 200),
  cefr_level      public.cefr_level,
  topic           text check (char_length(topic) <= 100),
  summary         text check (char_length(summary) <= 1000),
  -- grammar: explanation; reading: passage; others: instructions / prompt
  body            text check (char_length(body) <= 20000),
  form            text check (char_length(form) <= 5000),
  usage           text check (char_length(usage) <= 5000),
  examples        text[] not null default '{}',
  -- [{ "incorrect": "...", "correct": "...", "note": "..." }]
  common_mistakes jsonb not null default '[]' check (jsonb_typeof(common_mistakes) = 'array'),
  media_path      text,
  response_mode   public.response_mode,
  min_words       integer check (min_words between 1 and 5000),
  max_words       integer check (max_words between 1 and 5000),
  -- [{ "criterion": "...", "description": "...", "max_points": n }]
  rubric          jsonb not null default '[]' check (jsonb_typeof(rubric) = 'array'),
  max_score       numeric(6, 2) not null default 10 check (max_score > 0 and max_score <= 1000),
  status          public.content_status not null default 'draft',
  published_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_by_name text not null default '',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (min_words is null or max_words is null or min_words <= max_words),
  -- speaking, writing and pronunciation collect work; the others do not
  check ((skill in ('speaking', 'writing', 'pronunciation')) = (response_mode is not null))
);

comment on column public.lessons.body is 'Grammar: explanation. Reading: the passage. Other skills: instructions or prompt.';
comment on column public.lessons.max_score is 'Maximum teacher score when the lesson has no rubric (with a rubric, the sum of its criteria).';

create index lessons_skill_idx on public.lessons (skill, status);

-- Words glossed with a reading (or any) lesson.
create table public.lesson_words (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  word_id   uuid not null references public.vocabulary_words (id) on delete restrict,
  primary key (lesson_id, word_id)
);

create table public.lesson_private (
  lesson_id    uuid primary key references public.lessons (id) on delete cascade,
  transcript   text check (char_length(transcript) <= 20000),
  model_answer text check (char_length(model_answer) <= 20000)
);

comment on table public.lesson_private is
  'Listening transcript and model answer: staff, or the student (and their parents) once they have done the lesson.';

create or replace function private.prepare_lesson()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.topic := nullif(btrim(new.topic), '');
  new.examples := array(select btrim(e) from unnest(new.examples) e where btrim(e) <> '');
  if exists (
    select 1 from jsonb_array_elements(new.common_mistakes) m
    where jsonb_typeof(m) <> 'object' or coalesce(btrim(m ->> 'incorrect'), '') = '' or coalesce(btrim(m ->> 'correct'), '') = ''
  ) then
    raise exception 'Each common mistake needs the wrong and the right version.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(new.rubric) r
    where jsonb_typeof(r) <> 'object' or coalesce(btrim(r ->> 'criterion'), '') = ''
       or coalesce(jsonb_typeof(r -> 'max_points'), '') <> 'number' or (r ->> 'max_points')::numeric <= 0
  ) then
    raise exception 'Each rubric criterion needs a name and positive points.' using errcode = '22023';
  end if;
  if jsonb_array_length(new.rubric) > 0 then
    new.max_score := (select sum((r ->> 'max_points')::numeric) from jsonb_array_elements(new.rubric) r);
  end if;
  perform private.check_english_media(new.media_path, 'mp3|m4a|wav|webm|png|jpg|jpeg|webp|mp4');

  if tg_op = 'UPDATE' and old.status = 'archived' and new.status = 'archived' then
    raise exception 'Restore the lesson before editing it.' using errcode = '22023';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    if coalesce(btrim(new.body), '') = '' then
      raise exception 'Write the lesson content before publishing.' using errcode = '22023';
    end if;
    if new.skill = 'listening' and new.media_path is null then
      raise exception 'Upload the listening audio before publishing.' using errcode = '22023';
    end if;
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger lessons_stamp before insert or update on public.lessons
  for each row execute function private.stamp_english_content();
create trigger lessons_prepare before insert or update on public.lessons
  for each row execute function private.prepare_lesson();

-- Exercises: copies of bank questions (like tests), marked automatically.
create table public.lesson_questions (
  id                 uuid primary key default gen_random_uuid(),
  lesson_id          uuid not null references public.lessons (id) on delete cascade,
  position           integer not null check (position > 0),
  source_question_id uuid references public.bank_questions (id) on delete set null,
  question_type      public.question_type not null,
  prompt             text not null,
  content            jsonb not null,
  media_path         text,
  points             numeric(6, 2) not null check (points > 0),
  constraint lesson_questions_position_unique unique (lesson_id, position) deferrable initially deferred,
  constraint lesson_questions_once unique (lesson_id, source_question_id)
);

create table public.lesson_question_keys (
  lesson_question_id uuid primary key references public.lesson_questions (id) on delete cascade,
  answer             jsonb not null,
  explanation        text
);

create table public.lesson_attempts (
  id         uuid primary key default gen_random_uuid(),
  lesson_id  uuid not null references public.lessons (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  responses  jsonb not null,
  -- { question_id: { "score": n, "points": n, "matched": bool } }
  results    jsonb not null,
  score      numeric(8, 2) not null,
  max_score  numeric(8, 2) not null,
  created_at timestamptz not null default now()
);

create index lesson_attempts_student_idx on public.lesson_attempts (student_id, created_at desc);
create index lesson_attempts_lesson_idx on public.lesson_attempts (lesson_id);

create table public.lesson_submissions (
  id             uuid primary key default gen_random_uuid(),
  lesson_id      uuid not null references public.lessons (id) on delete restrict,
  student_id     uuid not null references public.students (id) on delete restrict,
  attempt        integer not null check (attempt >= 1),
  text_response  text check (char_length(text_response) <= 20000),
  file_path      text,
  file_name      text,
  file_mime      text,
  file_size      bigint,
  status         public.lesson_submission_status not null default 'submitted',
  feedback       text check (char_length(feedback) <= 5000),
  -- [points per rubric criterion, in rubric order]
  rubric_scores  jsonb,
  score          numeric(8, 2),
  max_score      numeric(8, 2) not null,
  reviewed_by    uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  reviewed_at    timestamptz,
  submitted_at   timestamptz not null default now(),
  constraint lesson_submissions_attempt unique (lesson_id, student_id, attempt),
  check ((status = 'reviewed') = (reviewed_at is not null))
);

create index lesson_submissions_student_idx on public.lesson_submissions (student_id, submitted_at desc);
create index lesson_submissions_review_idx on public.lesson_submissions (status, submitted_at);

-- Exercises change only until someone has done them.
create or replace function private.guard_lesson_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid;
begin
  if tg_table_name = 'lesson_question_keys' then
    select q.lesson_id into target from public.lesson_questions q
    where q.id = coalesce(new.lesson_question_id, old.lesson_question_id);
  else
    target := coalesce(new.lesson_id, old.lesson_id);
  end if;
  if target is not null and exists (select 1 from public.lesson_attempts a where a.lesson_id = target) then
    raise exception 'Exercises cannot change once students have done them.' using errcode = '22023';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger lesson_questions_guard before insert or update or delete on public.lesson_questions
  for each row execute function private.guard_lesson_questions();
create trigger lesson_question_keys_guard before insert or update or delete on public.lesson_question_keys
  for each row execute function private.guard_lesson_questions();

-- -----------------------------------------------------------------------------
-- RPCs: content
-- -----------------------------------------------------------------------------

-- Copies bank questions (with keys) into a lesson. Only questions that can be
-- marked automatically are allowed: lessons are self-study.
create or replace function public.add_lesson_questions(target_lesson_id uuid, question_ids uuid[])
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
  if not exists (select 1 from public.lessons l where l.id = target_lesson_id and private.can_edit_english(l.created_by)) then
    raise exception 'You can only edit your own lessons.' using errcode = '42501';
  end if;
  if not private.has_any_permission('question_bank.read') then
    raise exception 'You do not have access to the question bank.' using errcode = '42501';
  end if;
  select coalesce(max(position), 0) into next_position from public.lesson_questions where lesson_id = target_lesson_id;

  for item in
    select q.*, k.answer, k.explanation
    from (select distinct on (x.id) x.id, x.n from unnest(question_ids) with ordinality as x (id, n) order by x.id, x.n) ord
    join public.bank_questions q on q.id = ord.id
    left join public.bank_question_keys k on k.question_id = q.id
    where not exists (select 1 from public.lesson_questions l where l.lesson_id = target_lesson_id and l.source_question_id = q.id)
    order by ord.n
  loop
    if item.status = 'archived' then
      raise exception 'Archived questions cannot be added.' using errcode = '22023';
    end if;
    if not (private.is_auto_graded(item.question_type, item.content)
            or item.question_type in ('short_answer', 'sentence_transformation', 'error_correction')) then
      raise exception 'Lesson exercises must be marked automatically; use a speaking or writing lesson for "%".', left(item.prompt, 60)
        using errcode = '22023';
    end if;
    if item.answer is null then
      raise exception 'Add an answer key to "%" before using it.', left(item.prompt, 60) using errcode = '22023';
    end if;
    perform private.check_question_key(item.question_type, item.content, item.answer);
    next_position := next_position + 1;
    insert into public.lesson_questions (lesson_id, position, source_question_id, question_type, prompt, content, media_path, points)
    values (target_lesson_id, next_position, item.id, item.question_type, item.prompt, item.content, item.media_path, item.points)
    returning id into copy_id;
    insert into public.lesson_question_keys (lesson_question_id, answer, explanation) values (copy_id, item.answer, item.explanation);
    added := added + 1;
  end loop;
  return added;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs: students
-- -----------------------------------------------------------------------------

-- Records a vocabulary practice round and moves each word between boxes.
-- results: [{ "word_id": uuid, "correct": bool }]
create or replace function public.record_vocabulary_practice(target_set_id uuid, target_activity public.vocabulary_activity, results jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  practice_id uuid;
  n integer;
  ok integer;
  intervals integer[] := array[1, 2, 4, 7, 14];
begin
  if me is null or not private.has_permission('english.practice', 'own') then
    raise exception 'Only students can record practice.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.vocabulary_sets s where s.id = target_set_id and s.status = 'published') then
    raise exception 'Word set not found.' using errcode = 'P0002';
  end if;
  if coalesce(jsonb_typeof(results), '') <> 'array' or jsonb_array_length(results) not between 1 and 200 then
    raise exception 'Nothing to record.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(results) r
    where coalesce(jsonb_typeof(r -> 'correct'), '') <> 'boolean'
       or not exists (
         select 1 from public.vocabulary_set_words w
         where w.set_id = target_set_id and w.word_id::text = r ->> 'word_id'
       )
  ) then
    raise exception 'The results refer to words outside this set.' using errcode = '22023';
  end if;

  select count(*), count(*) filter (where (r ->> 'correct')::boolean) into n, ok from jsonb_array_elements(results) r;
  insert into public.vocabulary_practice (student_id, set_id, activity, correct, total)
  values (me, target_set_id, target_activity, ok, n)
  returning id into practice_id;

  -- One move per word per round (the last answer for a word counts).
  insert into public.vocabulary_progress as p (student_id, word_id, box, correct_count, wrong_count, last_practiced_at, next_review_on)
  select me, w.word_id,
         case when w.correct then 2 else 1 end,
         case when w.correct then 1 else 0 end,
         case when w.correct then 0 else 1 end,
         now(),
         private.academy_today() + intervals[case when w.correct then 2 else 1 end]
  from (
    select distinct on (r ->> 'word_id') (r ->> 'word_id')::uuid as word_id, (r ->> 'correct')::boolean as correct
    from jsonb_array_elements(results) with ordinality as e (r, i)
    order by r ->> 'word_id', i desc
  ) w
  on conflict (student_id, word_id) do update set
    box = case when excluded.correct_count > 0 then least(p.box + 1, 5) else 1 end,
    correct_count = p.correct_count + excluded.correct_count,
    wrong_count = p.wrong_count + excluded.wrong_count,
    last_practiced_at = now(),
    next_review_on = private.academy_today()
      + intervals[case when excluded.correct_count > 0 then least(p.box + 1, 5) else 1 end];
  return practice_id;
end;
$$;

-- Marks a lesson's exercises against the keys (every attempt is kept).
-- responses: { lesson_question_id: <response in the question bank format> }
create or replace function public.submit_lesson_practice(target_lesson_id uuid, responses jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  q record;
  g_score numeric;
  g_review boolean;
  answer jsonb;
  results jsonb := '{}';
  total numeric := 0;
  maximum numeric := 0;
  attempt_id uuid;
begin
  if me is null or not private.has_permission('english.practice', 'own') then
    raise exception 'Only students can do lesson exercises.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.lessons l where l.id = target_lesson_id and l.status = 'published') then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if coalesce(jsonb_typeof(responses), '') <> 'object' then
    raise exception 'The answers are not in the expected format.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(responses) k
             where not exists (select 1 from public.lesson_questions x where x.lesson_id = target_lesson_id and x.id::text = k)) then
    raise exception 'The answers refer to a question outside this lesson.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.lesson_questions where lesson_id = target_lesson_id) then
    raise exception 'This lesson has no exercises.' using errcode = '22023';
  end if;

  for q in
    select lq.*, k.answer as key from public.lesson_questions lq
    join public.lesson_question_keys k on k.lesson_question_id = lq.id
    where lq.lesson_id = target_lesson_id order by lq.position
  loop
    answer := responses -> q.id::text;
    begin
      select g.score, g.needs_review into g_score, g_review
      from private.grade_response(q.question_type, q.content, q.key, answer, q.points) g;
    exception when others then
      -- A malformed answer simply earns nothing.
      g_score := 0;
      g_review := false;
    end;
    results := results || jsonb_build_object(q.id::text, jsonb_build_object(
      'score', coalesce(g_score, 0),
      'points', q.points,
      -- short answers not in the list: 0 here, flagged so the student can ask the teacher
      'unlisted', coalesce(g_review, false)
    ));
    total := total + coalesce(g_score, 0);
    maximum := maximum + q.points;
  end loop;

  insert into public.lesson_attempts (lesson_id, student_id, responses, results, score, max_score)
  values (target_lesson_id, me, responses, results, total, maximum)
  returning id into attempt_id;
  return attempt_id;
end;
$$;

-- Hands in speaking / writing / pronunciation work.
create or replace function public.submit_lesson_work(target_lesson_id uuid, response_text text default null, file jsonb default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  lesson public.lessons;
  mime text := file ->> 'mime';
  submission_id uuid;
begin
  if me is null or not private.has_permission('english.practice', 'own') then
    raise exception 'Only students can submit work.' using errcode = '42501';
  end if;
  select * into lesson from public.lessons where id = target_lesson_id and status = 'published';
  if not found or lesson.response_mode is null then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if lesson.response_mode = 'text' then
    if coalesce(btrim(response_text), '') = '' then
      raise exception 'Write your answer before submitting.' using errcode = '22023';
    end if;
  else
    if file is null then
      raise exception 'Upload your recording before submitting.' using errcode = '22023';
    end if;
    if not (
      (lesson.response_mode in ('audio', 'audio_or_video') and mime like 'audio/%')
      or (lesson.response_mode in ('video', 'audio_or_video') and mime like 'video/%')
    ) then
      raise exception 'This lesson needs % recording.',
        case lesson.response_mode when 'audio' then 'an audio' when 'video' then 'a video' else 'an audio or video' end
        using errcode = '22023';
    end if;
    perform private.validate_upload(file ->> 'path', 'english/' || me, file ->> 'name', mime, (file ->> 'size')::bigint);
  end if;

  insert into public.lesson_submissions (
    lesson_id, student_id, attempt, text_response, file_path, file_name, file_mime, file_size, max_score
  )
  values (
    lesson.id, me,
    coalesce((select max(attempt) from public.lesson_submissions where lesson_id = lesson.id and student_id = me), 0) + 1,
    nullif(btrim(response_text), ''),
    file ->> 'path', file ->> 'name', mime, (file ->> 'size')::bigint,
    lesson.max_score
  )
  returning id into submission_id;
  return submission_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPCs: teachers
-- -----------------------------------------------------------------------------

-- Feedback on speaking / writing work; with a rubric the score is the sum of
-- the criteria (each within its maximum).
create or replace function public.review_lesson_submission(
  target_submission_id uuid,
  review_feedback text,
  criterion_scores jsonb default null,
  overall_score numeric default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  work public.lesson_submissions;
  lesson public.lessons;
  total numeric;
  n integer;
begin
  select * into work from public.lesson_submissions where id = target_submission_id for update;
  if not found or not private.can_review_english(work.student_id) then
    raise exception 'You can only review work from students you teach.' using errcode = '42501';
  end if;
  select * into lesson from public.lessons where id = work.lesson_id;
  n := jsonb_array_length(lesson.rubric);

  if n > 0 then
    if coalesce(jsonb_typeof(criterion_scores), '') <> 'array' or jsonb_array_length(criterion_scores) <> n then
      raise exception 'Score every rubric criterion.' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements(criterion_scores) with ordinality as s (v, i)
      where coalesce(jsonb_typeof(v), '') <> 'number' or (v #>> '{}')::numeric < 0
         or (v #>> '{}')::numeric > (lesson.rubric -> (i::integer - 1) ->> 'max_points')::numeric
    ) then
      raise exception 'Each criterion must be scored between 0 and its maximum.' using errcode = '22023';
    end if;
    total := (select sum((v #>> '{}')::numeric) from jsonb_array_elements(criterion_scores) v);
  else
    if overall_score is null or overall_score < 0 or overall_score > work.max_score then
      raise exception 'The score must be between 0 and %.', trim_scale(work.max_score) using errcode = '22023';
    end if;
    total := overall_score;
    criterion_scores := null;
  end if;
  if coalesce(btrim(review_feedback), '') = '' then
    raise exception 'Write some feedback for the student.' using errcode = '22023';
  end if;

  update public.lesson_submissions set
    status = 'reviewed',
    feedback = btrim(review_feedback),
    rubric_scores = criterion_scores,
    score = round(total, 2),
    reviewed_by = (select auth.uid()),
    reviewed_by_name = coalesce((select full_name from public.profiles where id = (select auth.uid())), ''),
    reviewed_at = now()
  where id = work.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Reading results
-- -----------------------------------------------------------------------------

-- One exercise attempt question by question, with the correct answers (the
-- student has already handed it in; lessons are practice).
create or replace function public.lesson_attempt_review(target_attempt_id uuid)
returns table (
  lesson_question_id uuid,
  question_position integer,
  question_type public.question_type,
  prompt text,
  content jsonb,
  points numeric,
  response jsonb,
  score numeric,
  unlisted boolean,
  correct_answer jsonb,
  explanation text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  attempt public.lesson_attempts;
begin
  select * into attempt from public.lesson_attempts where id = target_attempt_id;
  if not found or not private.can_read_english_results(attempt.student_id) then
    raise exception 'Attempt not found.' using errcode = 'P0002';
  end if;
  return query
  select q.id, q.position, q.question_type, q.prompt, q.content, q.points,
         attempt.responses -> q.id::text,
         (attempt.results -> q.id::text ->> 'score')::numeric,
         coalesce((attempt.results -> q.id::text ->> 'unlisted')::boolean, false),
         k.answer, k.explanation
  from public.lesson_questions q
  left join public.lesson_question_keys k on k.lesson_question_id = q.id
  where q.lesson_id = attempt.lesson_id
  order by q.position;
end;
$$;

-- Performance by skill (security invoker: only rows the caller may read).
-- Sources: vocabulary practice, lesson exercises, reviewed speaking/writing
-- work, and returned assignment grades whose skill is an English skill.
create or replace function public.english_skill_performance(target_student_ids uuid[] default null)
returns table (
  student_id uuid,
  skill public.english_skill,
  activities bigint,
  average_percent numeric,
  last_activity timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  with results as (
    select p.student_id, 'vocabulary'::public.english_skill as skill, p.correct::numeric / p.total as share, p.created_at as at
    from public.vocabulary_practice p
    union all
    select a.student_id, l.skill, case when a.max_score > 0 then a.score / a.max_score end, a.created_at
    from public.lesson_attempts a join public.lessons l on l.id = a.lesson_id
    union all
    select s.student_id, l.skill, s.score / s.max_score, s.reviewed_at
    from public.lesson_submissions s join public.lessons l on l.id = s.lesson_id
    where s.status = 'reviewed'
    union all
    select s.student_id, a.skill::text::public.english_skill, g.score / a.max_score, g.returned_at
    from public.submission_grades g
    join public.submissions s on s.id = g.submission_id
    join public.assignments a on a.id = s.assignment_id
    where g.returned_at is not null
      and a.skill::text in ('vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'pronunciation')
  )
  select r.student_id, r.skill, count(*), round(avg(r.share) * 100, 1), max(r.at)
  from results r
  where r.share is not null
    and (target_student_ids is null or r.student_id = any (target_student_ids))
  group by r.student_id, r.skill
  order by r.student_id, r.skill;
$$;

do $$
declare
  signature text;
begin
  foreach signature in array array[
    'public.add_lesson_questions(uuid, uuid[])',
    'public.record_vocabulary_practice(uuid, public.vocabulary_activity, jsonb)',
    'public.submit_lesson_practice(uuid, jsonb)',
    'public.submit_lesson_work(uuid, text, jsonb)',
    'public.review_lesson_submission(uuid, text, jsonb, numeric)',
    'public.lesson_attempt_review(uuid)',
    'public.english_skill_performance(uuid[])'
  ] loop
    execute format('revoke all on function %s from public, anon', signature);
    execute format('grant execute on function %s to authenticated', signature);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.vocabulary_words enable row level security;
alter table public.vocabulary_sets enable row level security;
alter table public.vocabulary_set_words enable row level security;
alter table public.vocabulary_practice enable row level security;
alter table public.vocabulary_progress enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_words enable row level security;
alter table public.lesson_private enable row level security;
alter table public.lesson_questions enable row level security;
alter table public.lesson_question_keys enable row level security;
alter table public.lesson_attempts enable row level security;
alter table public.lesson_submissions enable row level security;

-- Content: published items for every reader; everything for content editors.
create policy vocabulary_words_select on public.vocabulary_words for select to authenticated using (
  (select private.has_any_permission('english.write'))
  or (status = 'published' and (select private.has_any_permission('english.read')))
);
create policy vocabulary_words_insert on public.vocabulary_words for insert to authenticated
  with check ((select private.has_any_permission('english.write')));
create policy vocabulary_words_update on public.vocabulary_words for update to authenticated
  using (private.can_edit_english(created_by)) with check (private.can_edit_english(created_by));

create policy vocabulary_sets_select on public.vocabulary_sets for select to authenticated using (
  (select private.has_any_permission('english.write'))
  or (status = 'published' and (select private.has_any_permission('english.read')))
);
create policy vocabulary_sets_insert on public.vocabulary_sets for insert to authenticated
  with check ((select private.has_any_permission('english.write')));
create policy vocabulary_sets_update on public.vocabulary_sets for update to authenticated
  using (private.can_edit_english(created_by)) with check (private.can_edit_english(created_by));

create policy vocabulary_set_words_select on public.vocabulary_set_words for select to authenticated
  using (exists (select 1 from public.vocabulary_sets s where s.id = set_id));
create policy vocabulary_set_words_write on public.vocabulary_set_words for all to authenticated
  using (exists (select 1 from public.vocabulary_sets s where s.id = set_id and private.can_edit_english(s.created_by)))
  with check (exists (select 1 from public.vocabulary_sets s where s.id = set_id and private.can_edit_english(s.created_by)));

create policy lessons_select on public.lessons for select to authenticated using (
  (select private.has_any_permission('english.write'))
  or (status = 'published' and (select private.has_any_permission('english.read')))
);
create policy lessons_insert on public.lessons for insert to authenticated
  with check ((select private.has_any_permission('english.write')));
create policy lessons_update on public.lessons for update to authenticated
  using (private.can_edit_english(created_by)) with check (private.can_edit_english(created_by));
create policy lessons_delete on public.lessons for delete to authenticated
  using (status = 'draft' and published_at is null and private.can_edit_english(created_by));

create policy lesson_words_select on public.lesson_words for select to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id));
create policy lesson_words_write on public.lesson_words for all to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and private.can_edit_english(l.created_by)))
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and private.can_edit_english(l.created_by)));

-- Transcripts / model answers: staff, or once the student has done the lesson.
create policy lesson_private_select on public.lesson_private for select to authenticated using (
  (select private.has_any_permission('english.write'))
  or exists (select 1 from public.lesson_attempts a where a.lesson_id = lesson_private.lesson_id)
  or exists (select 1 from public.lesson_submissions s where s.lesson_id = lesson_private.lesson_id)
);
create policy lesson_private_write on public.lesson_private for all to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and private.can_edit_english(l.created_by)))
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and private.can_edit_english(l.created_by)));

create policy lesson_questions_select on public.lesson_questions for select to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id));
create policy lesson_questions_write on public.lesson_questions for all to authenticated
  using (exists (select 1 from public.lessons l where l.id = lesson_id and private.can_edit_english(l.created_by)))
  with check (exists (select 1 from public.lessons l where l.id = lesson_id and private.can_edit_english(l.created_by)));

-- Keys: content editors only; students get them through lesson_attempt_review()
-- after handing in.
create policy lesson_question_keys_select on public.lesson_question_keys for select to authenticated
  using ((select private.has_any_permission('english.write')));
create policy lesson_question_keys_write on public.lesson_question_keys for all to authenticated
  using (exists (select 1 from public.lesson_questions q join public.lessons l on l.id = q.lesson_id
                 where q.id = lesson_question_id and private.can_edit_english(l.created_by)))
  with check (exists (select 1 from public.lesson_questions q join public.lessons l on l.id = q.lesson_id
                      where q.id = lesson_question_id and private.can_edit_english(l.created_by)));

-- Results: own / children / taught students / everyone (admins).
create policy vocabulary_practice_select on public.vocabulary_practice for select to authenticated
  using (private.can_read_english_results(student_id));
create policy vocabulary_progress_select on public.vocabulary_progress for select to authenticated
  using (private.can_read_english_results(student_id));
create policy lesson_attempts_select on public.lesson_attempts for select to authenticated
  using (private.can_read_english_results(student_id));
create policy lesson_submissions_select on public.lesson_submissions for select to authenticated
  using (private.can_read_english_results(student_id));

-- Results are written only by the functions above; content is archived, not deleted.
revoke insert, update, delete on public.vocabulary_practice, public.vocabulary_progress,
  public.lesson_attempts, public.lesson_submissions from authenticated;
revoke delete on public.vocabulary_words, public.vocabulary_sets from authenticated;

revoke all on public.vocabulary_words, public.vocabulary_sets, public.vocabulary_set_words, public.vocabulary_practice,
  public.vocabulary_progress, public.lessons, public.lesson_words, public.lesson_private, public.lesson_questions,
  public.lesson_question_keys, public.lesson_attempts, public.lesson_submissions from anon;

-- -----------------------------------------------------------------------------
-- Storage (same validated bucket):
--   assignment-files/english-content/<uuid>.<ext>   word audio / pictures, lesson media
--   assignment-files/english/<student_id>/<uuid>.<ext> students' recordings and files
-- -----------------------------------------------------------------------------
-- Folder names are text; only a well-formed student id is looked up.
create or replace function private.can_read_english_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case when folder ~ '^[0-9a-f-]{36}$' then private.can_read_english_results(folder::uuid) else false end;
$$;

create policy english_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files' and (
    ((storage.foldername(name))[1] = 'english-content' and (select private.has_any_permission('english.read')))
    or ((storage.foldername(name))[1] = 'english' and private.can_read_english_folder((storage.foldername(name))[2]))
  )
);
create policy english_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (
    ((storage.foldername(name))[1] = 'english-content' and (select private.has_any_permission('english.write')))
    or ((storage.foldername(name))[1] = 'english'
        and (select private.has_permission('english.practice', 'own'))
        and (storage.foldername(name))[2] = private.current_student_id()::text)
  )
);
create policy english_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'english-content'
  and (select private.has_any_permission('english.write'))
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
