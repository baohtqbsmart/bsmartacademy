-- =============================================================================
-- Communication: announcements, notifications (with preferences) and
-- teacher–parent messages.
--
--   announcements            to everyone, staff, parents, students or one class
--   notifications            one row per recipient; created only by the
--                            database (triggers and sync_my_notifications())
--   notification_preferences per user and kind; off = not created at all
--   message_threads/messages a teacher and a parent about one child, only while
--                            the teacher teaches the child
--
-- Delivery is in-app only: no e-mail, SMS or Zalo provider is connected.
-- =============================================================================

insert into public.permissions (code, description) values
  ('announcements.read',  'Read announcements'),
  ('announcements.write', 'Publish announcements'),
  ('messages.read',       'Read teacher–parent messages'),
  ('messages.write',      'Send teacher–parent messages');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'announcements.read',  'all'),
  ('super_admin', 'announcements.write', 'all'),
  ('admin',       'announcements.read',  'all'),
  ('admin',       'announcements.write', 'all'),
  ('teacher',     'announcements.read',  'assigned'),
  ('teacher',     'announcements.write', 'assigned'),
  ('student',     'announcements.read',  'own'),
  ('parent',      'announcements.read',  'children'),
  -- Administrators may read conversations (safeguarding); the pages say so.
  ('super_admin', 'messages.read',       'all'),
  ('admin',       'messages.read',       'all'),
  ('teacher',     'messages.read',       'assigned'),
  ('teacher',     'messages.write',      'assigned'),
  ('parent',      'messages.read',       'children'),
  ('parent',      'messages.write',      'children');

create type public.notification_kind as enum (
  'new_assignment', 'homework_due', 'new_grade', 'absence', 'schedule_change',
  'tuition_due', 'new_announcement', 'message', 'system'
);
create type public.announcement_audience as enum ('everyone', 'staff', 'parents', 'students', 'class');

-- -----------------------------------------------------------------------------
-- Notifications
-- -----------------------------------------------------------------------------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null,
  title      text not null check (btrim(title) <> '' and char_length(title) <= 200),
  body       text not null default '' check (char_length(body) <= 1000),
  -- Internal paths only (no external links, no javascript:).
  -- A single leading slash: "//host" would leave the site.
  link       text check (link ~ '^/([A-Za-z0-9_?=&%.-][A-Za-z0-9/_?=&%.-]*)?$' and char_length(link) <= 300),
  student_id uuid references public.students (id) on delete cascade,
  dedupe_key text not null default gen_random_uuid()::text,
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  unique (user_id, kind, dedupe_key)
);

comment on column public.notifications.student_id is 'The child the notification is about (parents with several children see whose it is).';
comment on column public.notifications.dedupe_key is 'The same event never notifies the same person twice.';

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

create table public.notification_preferences (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.notification_kind not null check (kind <> 'system'),
  enabled    boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

comment on table public.notification_preferences is 'Only switched-off kinds need a row; system notifications cannot be switched off.';

-- Creates one notification per recipient (skipping switched-off kinds,
-- inactive accounts and duplicates of the same event).
create or replace function private.notify(
  recipients uuid[],
  target_kind public.notification_kind,
  target_title text,
  target_body text,
  target_link text,
  target_student uuid,
  target_dedupe text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created integer;
begin
  insert into public.notifications (user_id, kind, title, body, link, student_id, dedupe_key)
  select distinct r, target_kind, left(target_title, 200), left(coalesce(target_body, ''), 1000), target_link, target_student, target_dedupe
  from unnest(recipients) r
  join public.profiles p on p.id = r and p.is_active
  where not exists (
    select 1 from public.notification_preferences np
    where np.user_id = r and np.kind = target_kind and not np.enabled
  )
  on conflict (user_id, kind, dedupe_key) do nothing;
  get diagnostics created = row_count;
  return created;
end;
$$;

-- The student's own account and their parents' accounts.
create or replace function private.family_of(target_student uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct x) filter (where x is not null), '{}')
  from (
    select s.profile_id as x from public.students s where s.id = target_student and s.deleted_at is null
    union all
    select p.profile_id from public.student_parents sp
    join public.parents p on p.id = sp.parent_id and p.deleted_at is null
    join public.students s on s.id = sp.student_id and s.deleted_at is null
    where sp.student_id = target_student
  ) f;
$$;

create or replace function private.active_students_of(target_class uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select e.student_id from public.enrollments e
  join public.students s on s.id = e.student_id and s.deleted_at is null
  where e.class_id = target_class and e.status = 'active';
$$;

-- -----------------------------------------------------------------------------
-- Announcements
-- -----------------------------------------------------------------------------
create table public.announcements (
  id          uuid primary key default gen_random_uuid(),
  audience    public.announcement_audience not null,
  class_id    uuid references public.classes (id) on delete cascade,
  title       text not null check (btrim(title) <> '' and char_length(title) <= 200),
  body        text not null check (btrim(body) <> '' and char_length(body) <= 5000),
  pinned      boolean not null default false,
  expires_at  timestamptz,
  created_by  uuid references public.profiles (id) on delete set null,
  author_name text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  check ((audience = 'class') = (class_id is not null)),
  check (expires_at is null or expires_at > created_at)
);

create index announcements_created_idx on public.announcements (created_at desc);
create index announcements_class_idx on public.announcements (class_id);

create trigger announcements_set_updated_at before update on public.announcements
  for each row execute function private.set_updated_at();

create or replace function private.can_publish_announcement(target_audience public.announcement_audience, target_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('announcements.write', 'all')
    or (target_audience = 'class' and private.has_permission('announcements.write', 'assigned') and private.is_class_teacher(target_class));
$$;

create or replace function private.can_see_announcement(a public.announcements)
returns boolean language sql stable security definer set search_path = '' as $$
  select a.created_by = (select auth.uid())
    or private.has_permission('announcements.read', 'all')
    or (a.archived_at is null and (a.expires_at is null or a.expires_at > now()) and case a.audience
      when 'everyone' then private.has_any_permission('announcements.read')
      when 'staff' then private.has_permission('announcements.read', 'assigned')
      when 'parents' then private.has_permission('announcements.read', 'children')
      when 'students' then private.has_permission('announcements.read', 'own')
      else private.is_class_teacher(a.class_id)
        or (private.has_permission('announcements.read', 'own') and private.is_class_student(a.class_id))
        or (private.has_permission('announcements.read', 'children') and private.is_class_of_child(a.class_id))
    end);
$$;

create or replace function private.prepare_announcement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.audience := old.audience;
    new.class_id := old.class_id;
  end if;
  new.author_name := coalesce((select full_name from public.profiles where id = new.created_by), '');
  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger announcements_prepare before insert or update on public.announcements
  for each row execute function private.prepare_announcement();

create or replace function private.announcement_recipients(a public.announcements)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct r) filter (where r is not null and r is distinct from a.created_by), '{}')
  from (
    select p.id as r from public.profiles p
    where a.audience <> 'class' and p.is_active and case a.audience
      when 'everyone' then true
      when 'staff' then p.role_code in ('super_admin', 'admin', 'teacher')
      when 'parents' then p.role_code = 'parent'
      else p.role_code = 'student'
    end
    union all
    select t.profile_id from public.class_members cm join public.teachers t on t.id = cm.teacher_id
    where a.audience = 'class' and cm.class_id = a.class_id
    union all
    select unnest(private.family_of(s)) from private.active_students_of(a.class_id) s
    where a.audience = 'class'
  ) x;
$$;

create or replace function private.announce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify(private.announcement_recipients(new), 'new_announcement', new.title,
    left(new.body, 200), '/announcements', null, 'announcement:' || new.id);
  return new;
end;
$$;

create trigger announcements_notify after insert on public.announcements
  for each row execute function private.announce();

-- -----------------------------------------------------------------------------
-- Messages
-- -----------------------------------------------------------------------------
create table public.message_threads (
  id                 uuid primary key default gen_random_uuid(),
  student_id         uuid not null references public.students (id) on delete cascade,
  teacher_profile_id uuid not null references public.profiles (id) on delete cascade,
  parent_profile_id  uuid not null references public.profiles (id) on delete cascade,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  last_message_at    timestamptz,
  teacher_read_at    timestamptz,
  parent_read_at     timestamptz,
  unique (student_id, teacher_profile_id, parent_profile_id)
);

create index message_threads_teacher_idx on public.message_threads (teacher_profile_id, last_message_at desc);
create index message_threads_parent_idx on public.message_threads (parent_profile_id, last_message_at desc);

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid not null references public.message_threads (id) on delete cascade,
  sender_id  uuid references public.profiles (id) on delete set null,
  body       text not null check (btrim(body) <> '' and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index messages_thread_idx on public.messages (thread_id, created_at);

-- May this teacher and this parent write to each other about this child? Only
-- while the teacher teaches the child and the parent is the child's parent.
create or replace function private.can_message_pair(target_student uuid, teacher_profile uuid, parent_profile uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.teachers t
      join public.class_members cm on cm.teacher_id = t.id
      join public.enrollments e on e.class_id = cm.class_id and e.student_id = target_student and e.status in ('active', 'pending')
      join public.classes c on c.id = cm.class_id and c.deleted_at is null
      where t.profile_id = teacher_profile and t.deleted_at is null
    )
    and exists (
      select 1 from public.parents p
      join public.student_parents sp on sp.parent_id = p.id and sp.student_id = target_student
      where p.profile_id = parent_profile and p.deleted_at is null
    )
    and exists (select 1 from public.students s where s.id = target_student and s.deleted_at is null);
$$;

create or replace function private.is_thread_participant(target_thread uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.message_threads t
    where t.id = target_thread and (select auth.uid()) in (t.teacher_profile_id, t.parent_profile_id)
  );
$$;

create or replace function private.prepare_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_by := (select auth.uid());
  new.created_at := now();
  new.last_message_at := null;
  new.teacher_read_at := null;
  new.parent_read_at := null;
  return new;
end;
$$;

create trigger message_threads_prepare before insert on public.message_threads
  for each row execute function private.prepare_thread();

create or replace function private.prepare_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender_id := (select auth.uid());
  new.created_at := now();
  new.body := btrim(new.body);
  return new;
end;
$$;

create trigger messages_prepare before insert on public.messages
  for each row execute function private.prepare_message();

create or replace function private.after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread public.message_threads;
  recipient uuid;
begin
  update public.message_threads set
    last_message_at = new.created_at,
    teacher_read_at = case when new.sender_id = teacher_profile_id then new.created_at else teacher_read_at end,
    parent_read_at = case when new.sender_id = parent_profile_id then new.created_at else parent_read_at end
  where id = new.thread_id
  returning * into thread;
  recipient := case when new.sender_id = thread.teacher_profile_id then thread.parent_profile_id else thread.teacher_profile_id end;
  perform private.notify(array[recipient], 'message',
    'New message from ' || coalesce((select full_name from public.profiles where id = new.sender_id), 'BSmart'),
    left(new.body, 140), '/messages/' || thread.id, thread.student_id, 'message:' || new.id);
  return new;
end;
$$;

create trigger messages_after_insert after insert on public.messages
  for each row execute function private.after_message();

create or replace function public.mark_thread_read(target_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.message_threads set
    teacher_read_at = case when teacher_profile_id = (select auth.uid()) then now() else teacher_read_at end,
    parent_read_at = case when parent_profile_id = (select auth.uid()) then now() else parent_read_at end
  where id = target_thread and (select auth.uid()) in (teacher_profile_id, parent_profile_id);
  update public.notifications set read_at = now()
  where user_id = (select auth.uid()) and kind = 'message' and read_at is null and link = '/messages/' || target_thread;
end;
$$;

-- -----------------------------------------------------------------------------
-- System notifications (triggers)
-- -----------------------------------------------------------------------------

-- New assignment (published now; scheduled ones are picked up by
-- sync_my_notifications() once released).
create or replace function private.notify_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') and new.archived_at is null then
    for s in select private.active_students_of(new.class_id) loop
      perform private.notify(private.family_of(s), 'new_assignment', 'New assignment: ' || new.title,
        case when new.due_at is not null then 'Due ' || to_char(new.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') else '' end,
        '/assignments/' || new.id, s, 'assignment:' || new.id);
    end loop;
  end if;
  return new;
end;
$$;

create trigger assignments_notify after insert or update of status on public.assignments
  for each row execute function private.notify_assignment();

create or replace function private.notify_assignment_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub record;
begin
  if new.returned_at is not null and (tg_op = 'INSERT' or old.returned_at is null) then
    select s.student_id, a.id as assignment_id, a.title, a.max_score into sub
    from public.submissions s join public.assignments a on a.id = s.assignment_id where s.id = new.submission_id;
    perform private.notify(private.family_of(sub.student_id), 'new_grade', 'Grade returned: ' || sub.title,
      trim(to_char(new.score, 'FM999990.##')) || ' / ' || trim(to_char(sub.max_score, 'FM999990.##')),
      '/assignments/' || sub.assignment_id, sub.student_id, 'grade:' || new.submission_id);
  end if;
  return new;
end;
$$;

create trigger submission_grades_notify after insert or update of returned_at on public.submission_grades
  for each row execute function private.notify_assignment_grade();

create or replace function private.notify_test_result()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  test public.tests;
begin
  if new.status = 'graded' and (tg_op = 'INSERT' or old.status is distinct from 'graded') then
    select * into test from public.tests where id = new.test_id;
    perform private.notify(private.family_of(new.student_id), 'new_grade', 'Test marked: ' || test.title,
      trim(to_char(new.score, 'FM999990.##')) || ' / ' || trim(to_char(test.total_score, 'FM999990.##')),
      '/tests/' || test.id, new.student_id, 'test:' || new.id);
  end if;
  return new;
end;
$$;

create trigger test_attempts_notify after insert or update of status on public.test_attempts
  for each row execute function private.notify_test_result();

create or replace function private.notify_assessment_grade()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sub record;
begin
  if new.returned_at is not null and (tg_op = 'INSERT' or old.returned_at is null) then
    select s.student_id, t.title into sub
    from public.assessment_submissions s join public.assessment_tasks t on t.id = s.task_id where s.id = new.submission_id;
    perform private.notify(private.family_of(sub.student_id), 'new_grade', 'Feedback returned: ' || sub.title, '',
      '/assessments/submissions/' || new.submission_id, sub.student_id, 'assessment:' || new.submission_id);
  end if;
  return new;
end;
$$;

create trigger assessment_grades_notify after insert or update of returned_at on public.assessment_grades
  for each row execute function private.notify_assessment_grade();

create or replace function private.notify_lesson_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson_title text;
begin
  if new.status = 'reviewed' and (tg_op = 'INSERT' or old.status is distinct from 'reviewed') then
    select title into lesson_title from public.lessons where id = new.lesson_id;
    perform private.notify(private.family_of(new.student_id), 'new_grade', 'English work reviewed: ' || lesson_title, '',
      '/english/lessons/' || new.lesson_id, new.student_id, 'lesson-review:' || new.id);
  end if;
  return new;
end;
$$;

create trigger lesson_submissions_notify after insert or update of status on public.lesson_submissions
  for each row execute function private.notify_lesson_review();

create or replace function private.notify_absence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  class_name text;
begin
  if new.status = 'absent' and (tg_op = 'INSERT' or old.status is distinct from 'absent') then
    select name into class_name from public.classes where id = new.class_id;
    perform private.notify(private.family_of(new.student_id), 'absence',
      'Absent: ' || class_name || ' on ' || to_char(new.session_date, 'DD/MM/YYYY'),
      'Marked absent by the class teacher. Contact the teacher if this is wrong.',
      '/attendance', new.student_id, 'absence:' || new.id);
  end if;
  return new;
end;
$$;

create trigger attendance_records_notify after insert or update of status on public.attendance_records
  for each row execute function private.notify_absence();

create or replace function private.notify_online_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s uuid;
  what text;
  class_name text;
begin
  if tg_op = 'INSERT' then
    what := 'Online lesson scheduled';
  elsif new.status = 'cancelled' and old.status <> 'cancelled' then
    what := 'Online lesson cancelled';
  elsif (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
    what := 'Online lesson moved';
  else
    return new;
  end if;
  select name into class_name from public.classes where id = new.class_id;
  for s in select private.active_students_of(new.class_id) loop
    perform private.notify(private.family_of(s), 'schedule_change', what || ': ' || class_name,
      new.title || ' · ' || to_char(new.starts_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI')
        || case when new.status = 'cancelled' then ' · ' || coalesce(new.cancelled_reason, '') else '' end,
      '/online/' || new.id, s, 'online:' || new.id || ':' || new.status || ':' || extract(epoch from new.starts_at)::bigint);
  end loop;
  return new;
end;
$$;

create trigger online_sessions_notify after insert or update of status, starts_at, ends_at on public.online_sessions
  for each row execute function private.notify_online_session();

create or replace function private.notify_timetable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_class uuid := coalesce(new.class_id, old.class_id);
  class_name text;
  s uuid;
begin
  select name into class_name from public.classes where id = target_class and status in ('planned', 'active') and deleted_at is null;
  if class_name is null then
    return null;
  end if;
  for s in select private.active_students_of(target_class) loop
    -- One notification per class per minute, however many slots change together.
    perform private.notify(private.family_of(s), 'schedule_change', 'Timetable changed: ' || class_name,
      'Check the new weekly times.', '/timetable', s, 'slots:' || target_class || ':' || to_char(now(), 'YYYYMMDDHH24MI'));
  end loop;
  return null;
end;
$$;

create trigger class_schedule_slots_notify after insert or update or delete on public.class_schedule_slots
  for each row execute function private.notify_timetable();

create or replace function private.notify_enrollment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  class_name text;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    select name into class_name from public.classes where id = new.class_id;
    perform private.notify(private.family_of(new.student_id), 'system', 'Enrolled: ' || class_name,
      'The class now appears in the timetable and class list.', '/classes/' || new.class_id, new.student_id,
      'enrolled:' || new.id || ':' || new.updated_at);
  end if;
  return new;
end;
$$;

create trigger enrollments_notify after insert or update of status on public.enrollments
  for each row execute function private.notify_enrollment();

-- -----------------------------------------------------------------------------
-- Time-based notifications, created for the caller when they open the app
-- (no background job is needed): homework due within 24 hours and not handed
-- in, assignments released on a schedule, tuition due within 7 days or overdue.
-- -----------------------------------------------------------------------------
create or replace function public.sync_my_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  created integer := 0;
  r record;
begin
  if me is null then
    return 0;
  end if;

  for r in
    with mine as (
      select s.id from public.students s where s.profile_id = me and s.deleted_at is null
      union
      select sp.student_id from public.student_parents sp
      join public.parents p on p.id = sp.parent_id and p.profile_id = me and p.deleted_at is null
      join public.students s on s.id = sp.student_id and s.deleted_at is null
    )
    select m.id as student_id, a.id, a.title, a.due_at, a.status, a.publish_at
    from mine m
    join public.enrollments e on e.student_id = m.id and e.status = 'active'
    join public.assignments a on a.class_id = e.class_id
    where private.assignment_released(a.status, a.publish_at) and a.archived_at is null
  loop
    if r.status = 'scheduled' then
      created := created + private.notify(array[me], 'new_assignment', 'New assignment: ' || r.title,
        case when r.due_at is not null then 'Due ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') else '' end,
        '/assignments/' || r.id, r.student_id, 'assignment:' || r.id);
    end if;
    if r.due_at between now() and now() + interval '24 hours' and not exists (
      select 1 from public.submissions s where s.assignment_id = r.id and s.student_id = r.student_id and s.status <> 'in_progress'
    ) then
      created := created + private.notify(array[me], 'homework_due', 'Due soon: ' || r.title,
        'Due ' || to_char(r.due_at at time zone 'Asia/Ho_Chi_Minh', 'DD/MM/YYYY HH24:MI') || ' and not handed in yet.',
        '/assignments/' || r.id, r.student_id, 'due:' || r.id || ':' || r.student_id);
    end if;
  end loop;

  -- Tuition: parents only.
  for r in
    select b.id, b.student_id, b.invoice_number, b.due_date, b.remaining, b.payment_status
    from public.invoice_balances b
    join public.student_parents sp on sp.student_id = b.student_id
    join public.parents p on p.id = sp.parent_id and p.profile_id = me and p.deleted_at is null
    where b.payment_status in ('unpaid', 'partially_paid', 'overdue')
      and b.due_date <= private.academy_today() + 7
  loop
    created := created + private.notify(array[me], 'tuition_due',
      case when r.payment_status = 'overdue' then 'Tuition overdue: ' else 'Tuition due: ' end || r.invoice_number,
      to_char(r.remaining, 'FM999G999G999G990') || ' đ due ' || to_char(r.due_date, 'DD/MM/YYYY'),
      '/tuition', r.student_id, 'invoice:' || r.id || ':' || case when r.payment_status = 'overdue' then 'overdue' else 'soon' end);
  end loop;

  return created;
end;
$$;

revoke all on function public.sync_my_notifications(), public.mark_thread_read(uuid) from public, anon;
grant execute on function public.sync_my_notifications(), public.mark_thread_read(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.announcements enable row level security;
alter table public.message_threads enable row level security;
alter table public.messages enable row level security;

create policy notifications_own_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_own_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

create policy notification_preferences_own on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy announcements_select on public.announcements for select to authenticated using (private.can_see_announcement(announcements));
create policy announcements_insert on public.announcements for insert to authenticated
  with check (private.can_publish_announcement(audience, class_id));
create policy announcements_update on public.announcements for update to authenticated
  using (created_by = (select auth.uid()) or (select private.has_permission('announcements.write', 'all')))
  with check (created_by = (select auth.uid()) or (select private.has_permission('announcements.write', 'all')));

create policy message_threads_select on public.message_threads for select to authenticated using (
  (select auth.uid()) in (teacher_profile_id, parent_profile_id)
  or (select private.has_permission('messages.read', 'all'))
);
create policy message_threads_insert on public.message_threads for insert to authenticated with check (
  (select private.has_any_permission('messages.write'))
  and (select auth.uid()) in (teacher_profile_id, parent_profile_id)
  and private.can_message_pair(student_id, teacher_profile_id, parent_profile_id)
);

create policy messages_select on public.messages for select to authenticated using (
  private.is_thread_participant(thread_id) or (select private.has_permission('messages.read', 'all'))
);
create policy messages_insert on public.messages for insert to authenticated with check (
  (select private.has_any_permission('messages.write'))
  and private.is_thread_participant(thread_id)
  and exists (
    select 1 from public.message_threads t
    where t.id = thread_id and private.can_message_pair(t.student_id, t.teacher_profile_id, t.parent_profile_id)
  )
);

-- Notifications are only created by the database; users mark them read.
revoke insert, update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke insert, update on public.announcements from authenticated;
grant insert (audience, class_id, title, body, pinned, expires_at) on public.announcements to authenticated;
grant update (title, body, pinned, expires_at, archived_at) on public.announcements to authenticated;
revoke delete on public.announcements from authenticated;
revoke insert, update, delete on public.message_threads from authenticated;
grant insert (student_id, teacher_profile_id, parent_profile_id) on public.message_threads to authenticated;
revoke update, delete on public.messages from authenticated;
revoke insert on public.messages from authenticated;
grant insert (thread_id, body) on public.messages to authenticated;
revoke all on public.notifications, public.notification_preferences, public.announcements,
  public.message_threads, public.messages from anon;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
