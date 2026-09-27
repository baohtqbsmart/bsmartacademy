-- =============================================================================
-- Student progress analytics.
--
-- Read-only, security invoker functions over the existing modules: every row
-- they return is one the caller could already read, so RLS decides who sees
-- whose results (students: their own; parents: their children's; teachers:
-- their classes'; admins: all). Nothing here stores or changes data.
--
--   progress_results()    one row per published result, with the raw score,
--                         the maximum, the percentage (or an IELTS-style band,
--                         never converted to a percentage) and who marked it
--   homework_completion() per student and class: set, handed in, late, missing
--   vocabulary_mastery()  words per spaced-repetition box
--
-- Only published results count: returned assignment grades, graded test
-- attempts (the best per test), reviewed English work, returned writing and
-- speaking grades, and practice results. Grades a teacher has not returned
-- are never included, for anyone.
-- =============================================================================

insert into public.permissions (code, description) values
  ('analytics.read', 'View student progress analytics');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'analytics.read', 'all'),
  ('admin',       'analytics.read', 'all'),
  ('teacher',     'analytics.read', 'assigned'),
  ('student',     'analytics.read', 'own'),
  ('parent',      'analytics.read', 'children');

create or replace function public.progress_results(
  date_from date,
  date_to date,
  student_filter uuid default null,
  class_filter uuid default null
)
returns table (
  student_id  uuid,
  class_id    uuid,
  occurred_on date,
  source      text,
  skill       text,
  item_id     uuid,
  title       text,
  raw_score   numeric,
  max_score   numeric,
  percent     numeric,
  band        numeric,
  assessed_by text,
  assessor    text
)
language sql
stable
security invoker
set search_path = ''
as $$
  with results as (
    -- Assignments: the latest returned attempt of each assignment.
    select * from (
      select distinct on (s.assignment_id, s.student_id)
        s.student_id, a.class_id,
        (coalesce(s.submitted_at, g.returned_at) at time zone 'Asia/Ho_Chi_Minh')::date as occurred_on,
        case a.assignment_type when 'quiz' then 'quiz' when 'test' then 'test' else 'assignment' end as source,
        a.skill::text as skill, a.id as item_id, a.title,
        g.score as raw_score, a.max_score,
        round(g.score / a.max_score * 100, 1) as percent,
        null::numeric as band, 'teacher' as assessed_by, g.graded_by_name as assessor
      from public.submission_grades g
      join public.submissions s on s.id = g.submission_id
      join public.assignments a on a.id = s.assignment_id
      where g.returned_at is not null
      order by s.assignment_id, s.student_id, s.attempt desc
    ) latest_assignments
    union all
    -- Tests: the best graded attempt of each test.
    select * from (
      select distinct on (t.id, at.student_id)
        at.student_id, t.class_id,
        (coalesce(at.submitted_at, at.graded_at) at time zone 'Asia/Ho_Chi_Minh')::date,
        'test', null::text, t.id, t.title,
        at.score, t.total_score, round(at.score / t.total_score * 100, 1),
        null::numeric, 'test_engine', null::text
      from public.test_attempts at
      join public.tests t on t.id = at.test_id
      where at.status = 'graded' and at.score is not null
      order by t.id, at.student_id, at.score desc, at.attempt_number
    ) best_tests
    union all
    -- English lesson exercises, marked automatically (every practice counts).
    select la.student_id, null::uuid, (la.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
      'lesson_practice', l.skill::text, l.id, l.title,
      la.score, la.max_score, round(la.score / la.max_score * 100, 1),
      null::numeric, 'automatic', null::text
    from public.lesson_attempts la
    join public.lessons l on l.id = la.lesson_id
    where la.max_score > 0
    union all
    -- English speaking/writing work reviewed by a teacher.
    select ls.student_id, null::uuid, (ls.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date,
      'lesson_review', l.skill::text, l.id, l.title,
      ls.score, ls.max_score, round(ls.score / ls.max_score * 100, 1),
      null::numeric, 'teacher', ls.reviewed_by_name
    from public.lesson_submissions ls
    join public.lessons l on l.id = ls.lesson_id
    where ls.status = 'reviewed' and ls.score is not null and ls.max_score > 0
    union all
    -- Writing & speaking assessment: the latest returned attempt of each task.
    -- IELTS-style bands stay bands; they are not turned into percentages.
    select * from (
      select distinct on (sub.task_id, sub.student_id)
        sub.student_id, t.class_id, (sub.submitted_at at time zone 'Asia/Ho_Chi_Minh')::date,
        'assessment', t.kind::text, t.id, t.title,
        g.total_score, t.max_score,
        case when t.scoring = 'points' then round(g.total_score / t.max_score * 100, 1) end,
        case when t.scoring = 'ielts_band' then g.total_score end,
        'teacher', g.graded_by_name
      from public.assessment_grades g
      join public.assessment_submissions sub on sub.id = g.submission_id
      join public.assessment_tasks t on t.id = sub.task_id
      where g.returned_at is not null
      order by sub.task_id, sub.student_id, sub.attempt desc
    ) latest_assessments
    union all
    -- Vocabulary practice sessions (correct answers out of the words practised).
    select vp.student_id, null::uuid, (vp.created_at at time zone 'Asia/Ho_Chi_Minh')::date,
      'vocabulary_practice', 'vocabulary', vs.id, vs.title,
      vp.correct::numeric, vp.total::numeric, round(vp.correct::numeric / vp.total * 100, 1),
      null::numeric, 'automatic', null::text
    from public.vocabulary_practice vp
    join public.vocabulary_sets vs on vs.id = vp.set_id
  )
  select r.*
  from results r
  -- Archived students are left out of analytics for everyone.
  join public.students st on st.id = r.student_id and st.deleted_at is null
  where r.occurred_on between date_from and date_to
    and (student_filter is null or r.student_id = student_filter)
    and (
      class_filter is null
      or r.class_id = class_filter
      -- Self-study English results count for the class's (non-withdrawn) students.
      or (r.class_id is null and exists (
        select 1 from public.enrollments e
        where e.class_id = class_filter and e.student_id = r.student_id and e.status <> 'withdrawn'
      ))
    );
$$;

comment on function public.progress_results(date, date, uuid, uuid) is
  'Published results in a date range (Vietnam dates), as the caller may see them. percent is null for IELTS-style bands.';

-- Homework: assignments (not quizzes or tests) with a due date in the range,
-- for students enrolled in the class on the due date.
create or replace function public.homework_completion(
  date_from date,
  date_to date,
  student_filter uuid default null,
  class_filter uuid default null
)
returns table (
  student_id uuid,
  class_id   uuid,
  set_count  bigint,
  handed_in  bigint,
  late       bigint,
  missing    bigint,
  not_due    bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select e.student_id, a.class_id,
    count(*),
    count(*) filter (where h.submitted),
    count(*) filter (where h.submitted and h.late),
    count(*) filter (where not h.submitted and a.due_at < now()),
    count(*) filter (where not h.submitted and a.due_at >= now())
  from public.assignments a
  join public.enrollments e
    on e.class_id = a.class_id
   and e.status <> 'pending'
   and e.enrolled_on <= (a.due_at at time zone 'Asia/Ho_Chi_Minh')::date
   and (e.ended_on is null or e.ended_on >= (a.due_at at time zone 'Asia/Ho_Chi_Minh')::date)
  join public.students st on st.id = e.student_id and st.deleted_at is null
  cross join lateral (
    select
      exists (select 1 from public.submissions s where s.assignment_id = a.id and s.student_id = e.student_id and s.status <> 'in_progress') as submitted,
      exists (select 1 from public.submissions s where s.assignment_id = a.id and s.student_id = e.student_id and s.status <> 'in_progress' and s.is_late) as late
  ) h
  where a.status in ('published', 'closed')
    and a.assignment_type not in ('quiz', 'test')
    and a.due_at is not null
    and (a.due_at at time zone 'Asia/Ho_Chi_Minh')::date between date_from and date_to
    and (student_filter is null or e.student_id = student_filter)
    and (class_filter is null or a.class_id = class_filter)
  group by e.student_id, a.class_id;
$$;

create or replace function public.vocabulary_mastery(student_filter uuid default null)
returns table (student_id uuid, box smallint, words bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select vp.student_id, vp.box, count(*)
  from public.vocabulary_progress vp
  where student_filter is null or vp.student_id = student_filter
  group by vp.student_id, vp.box;
$$;

revoke all on function public.progress_results(date, date, uuid, uuid), public.homework_completion(date, date, uuid, uuid),
  public.vocabulary_mastery(uuid) from public, anon;
grant execute on function public.progress_results(date, date, uuid, uuid), public.homework_completion(date, date, uuid, uuid),
  public.vocabulary_mastery(uuid) to authenticated;
