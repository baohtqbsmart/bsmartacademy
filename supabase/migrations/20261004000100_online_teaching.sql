-- =============================================================================
-- Online Teaching Center.
--
-- No video conferencing of our own: a session points to a meeting on Google
-- Meet, Zoom or Microsoft Teams. Today teachers paste the link (link_source
-- 'manual'); a future provider integration creates the meeting through the
-- provider's API and stores its id (link_source 'api', external_meeting_id).
--
--   online_sessions            class, teacher, time, provider + meeting link
--   online_session_materials   files and links for the lesson
--   online_session_homework    assignments set for the lesson (assignments module)
--   online_session_notes       the teacher's private teaching notes
--   online_session_joins       who opened the meeting from BSmart (a hint for
--                              attendance, never attendance itself)
--
-- Attendance is the class register for the session's date (attendance
-- module); on a day with an online session, students may be marked as having
-- attended online even in an in-person class.
-- =============================================================================

insert into public.permissions (code, description) values
  ('online.read',  'View online sessions'),
  ('online.write', 'Schedule and run online sessions');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'online.read',  'all'),
  ('super_admin', 'online.write', 'all'),
  ('admin',       'online.read',  'all'),
  ('admin',       'online.write', 'all'),
  ('teacher',     'online.read',  'assigned'),
  ('teacher',     'online.write', 'assigned'),
  ('student',     'online.read',  'own'),
  ('parent',      'online.read',  'children');

create type public.meeting_provider as enum ('google_meet', 'zoom', 'microsoft_teams', 'other');
create type public.meeting_link_source as enum ('manual', 'api');
create type public.online_session_status as enum ('scheduled', 'live', 'ended', 'cancelled');
create type public.material_kind as enum ('file', 'link');

-- Links must belong to the chosen provider (mirrored in src/lib/meetings).
create or replace function private.meeting_url_valid(provider public.meeting_provider, url text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select url ~ '^https://[^\s]+$' and char_length(url) <= 500 and case provider
    when 'google_meet' then url ~ '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}([?#].*)?$'
    when 'zoom' then url ~ '^https://([a-z0-9-]+\.)?zoom\.(us|com)/(j|w|my|s)/[A-Za-z0-9._-]+([?#].*)?$'
    when 'microsoft_teams' then url ~ '^https://teams\.(microsoft|live)\.com/[^\s]+$'
    else true
  end;
$$;

create table public.online_sessions (
  id                  uuid primary key default gen_random_uuid(),
  class_id            uuid not null references public.classes (id) on delete restrict,
  teacher_id          uuid not null references public.teachers (id) on delete restrict,
  title               text not null check (btrim(title) <> '' and char_length(title) <= 200),
  agenda              text check (char_length(agenda) <= 5000),
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  session_date        date not null,
  provider            public.meeting_provider not null,
  meeting_url         text,
  meeting_code        text check (char_length(meeting_code) <= 100),
  passcode            text check (char_length(passcode) <= 100),
  link_source         public.meeting_link_source not null default 'manual',
  external_meeting_id text check (char_length(external_meeting_id) <= 200),
  recording_url       text check (recording_url is null or (recording_url ~ '^https://[^\s]+$' and char_length(recording_url) <= 500)),
  status              public.online_session_status not null default 'scheduled',
  started_at          timestamptz,
  ended_at            timestamptz,
  cancelled_reason    text check (char_length(cancelled_reason) <= 500),
  created_by          uuid references public.profiles (id) on delete set null,
  created_by_name     text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (ends_at > starts_at and ends_at <= starts_at + interval '8 hours'),
  check (meeting_url is null or private.meeting_url_valid(provider, meeting_url)),
  check (status <> 'cancelled' or cancelled_reason is not null),
  -- A provider meeting id is stored once (an API retry cannot create a duplicate session).
  constraint online_sessions_external_unique unique (provider, external_meeting_id)
);

comment on column public.online_sessions.session_date is 'The academy (Vietnam) date of starts_at; links the session to the class register.';
comment on column public.online_sessions.link_source is '"manual": pasted by the teacher; "api": created through the provider integration.';

create index online_sessions_class_idx on public.online_sessions (class_id, starts_at);
create index online_sessions_teacher_idx on public.online_sessions (teacher_id, starts_at);
create index online_sessions_date_idx on public.online_sessions (session_date);

create trigger online_sessions_set_updated_at before update on public.online_sessions
  for each row execute function private.set_updated_at();

create or replace function private.can_write_class_online(target_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_permission('online.write', 'all')
    or (private.has_permission('online.write', 'assigned') and private.is_class_teacher(target_class_id));
$$;

-- Class and teacher rules, the academy date, lifecycle, no double-booking.
create or replace function private.prepare_online_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  klass public.classes;
begin
  select * into klass from public.classes where id = new.class_id;
  if tg_op = 'INSERT' then
    if not found or klass.deleted_at is not null or klass.status not in ('planned', 'active') then
      raise exception 'Online sessions can only be scheduled for planned or running classes.' using errcode = '22023';
    end if;
    new.created_by := (select auth.uid());
    new.created_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    new.status := 'scheduled';
    new.started_at := null;
    new.ended_at := null;
  else
    new.created_by := old.created_by;
    new.created_by_name := old.created_by_name;
    new.created_at := old.created_at;
    new.class_id := old.class_id;
    if old.status = 'cancelled' and new.status = 'cancelled' and (new.starts_at, new.ends_at) is distinct from (old.starts_at, old.ends_at) then
      raise exception 'This session was cancelled; schedule a new one instead.' using errcode = '22023';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'scheduled' and new.status in ('live', 'cancelled'))
      or (old.status = 'live' and new.status in ('ended', 'cancelled'))
      or (old.status = 'ended' and new.status = 'live')
      or (old.status = 'cancelled' and new.status = 'scheduled')
    ) then
      raise exception 'A session cannot go from % to %.', old.status, new.status using errcode = '22023';
    end if;
    if new.status = 'live' and old.status <> 'live' then
      new.started_at := coalesce(old.started_at, now());
      new.ended_at := null;
    elsif new.status = 'ended' and old.status <> 'ended' then
      new.ended_at := now();
    elsif new.status = 'scheduled' then
      new.cancelled_reason := null;
    end if;
  end if;

  if not exists (select 1 from public.class_members cm where cm.class_id = new.class_id and cm.teacher_id = new.teacher_id) then
    raise exception 'The teacher must teach this class.' using errcode = '22023';
  end if;
  new.session_date := (new.starts_at at time zone 'Asia/Ho_Chi_Minh')::date;
  if klass.start_date is not null and new.session_date < klass.start_date
     or klass.end_date is not null and new.session_date > klass.end_date then
    raise exception 'The session must fall within the class dates.' using errcode = '22023';
  end if;

  if new.status <> 'cancelled' and exists (
    select 1 from public.online_sessions o
    where o.teacher_id = new.teacher_id and o.id <> new.id and o.status <> 'cancelled'
      and o.starts_at < new.ends_at and new.starts_at < o.ends_at
  ) then
    raise exception 'The teacher already has an online session at that time.' using errcode = '22023';
  end if;

  new.title := btrim(new.title);
  new.meeting_code := nullif(btrim(new.meeting_code), '');
  new.passcode := nullif(btrim(new.passcode), '');
  return new;
end;
$$;

create trigger online_sessions_prepare before insert or update on public.online_sessions
  for each row execute function private.prepare_online_session();

-- -----------------------------------------------------------------------------
-- Materials, homework, teaching notes, joins
-- -----------------------------------------------------------------------------
create table public.online_session_materials (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.online_sessions (id) on delete cascade,
  kind                public.material_kind not null,
  title               text not null check (btrim(title) <> '' and char_length(title) <= 200),
  url                 text check (url is null or (url ~ '^https://[^\s]+$' and char_length(url) <= 1000)),
  object_path         text unique,
  file_name           text,
  mime_type           text references public.upload_file_types (mime_type),
  size_bytes          bigint check (size_bytes between 1 and 20971520),
  visible_to_students boolean not null default true,
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  check ((kind = 'link') = (url is not null)),
  check ((kind = 'file') = (object_path is not null and file_name is not null and mime_type is not null and size_bytes is not null))
);

create index online_session_materials_session_idx on public.online_session_materials (session_id);

create or replace function private.prepare_online_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    new.session_id := old.session_id;
    new.kind := old.kind;
    new.object_path := old.object_path;
    new.file_name := old.file_name;
    new.mime_type := old.mime_type;
    new.size_bytes := old.size_bytes;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    return new;
  end if;
  new.created_by := (select auth.uid());
  if new.kind = 'file' then
    perform private.validate_upload(new.object_path, 'online-sessions/' || new.session_id, new.file_name, new.mime_type, new.size_bytes);
  end if;
  if (select count(*) from public.online_session_materials where session_id = new.session_id) >= 20 then
    raise exception 'A session can have at most 20 materials.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger online_session_materials_prepare before insert or update on public.online_session_materials
  for each row execute function private.prepare_online_material();

create table public.online_session_homework (
  session_id    uuid not null references public.online_sessions (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (session_id, assignment_id)
);

create or replace function private.check_online_homework()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.online_sessions o join public.assignments a on a.class_id = o.class_id
    where o.id = new.session_id and a.id = new.assignment_id
  ) then
    raise exception 'Homework must be an assignment of the same class.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger online_session_homework_check before insert on public.online_session_homework
  for each row execute function private.check_online_homework();

create table public.online_session_notes (
  session_id      uuid primary key references public.online_sessions (id) on delete cascade,
  notes           text not null default '' check (char_length(notes) <= 20000),
  updated_by_name text not null default '',
  updated_at      timestamptz not null default now()
);

comment on table public.online_session_notes is 'Private teaching notes (lesson plan, what happened); staff of the class only.';

create or replace function private.stamp_online_notes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  new.updated_at := now();
  return new;
end;
$$;

create trigger online_session_notes_stamp before insert or update on public.online_session_notes
  for each row execute function private.stamp_online_notes();

create table public.online_session_joins (
  session_id      uuid not null references public.online_sessions (id) on delete cascade,
  student_id      uuid not null references public.students (id) on delete cascade,
  first_joined_at timestamptz not null default now(),
  last_joined_at  timestamptz not null default now(),
  join_count      integer not null default 1,
  primary key (session_id, student_id)
);

comment on table public.online_session_joins is
  'Students who opened the meeting from BSmart. A hint for the teacher when taking attendance, not proof of presence.';

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

-- A student opens the meeting: logs the click and returns the link. The
-- meeting opens from 15 minutes before the start until the end.
create or replace function public.join_online_session(target_session_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := private.current_student_id();
  session public.online_sessions;
begin
  if me is null or not private.has_permission('online.read', 'own') then
    raise exception 'Only students join from here; teachers open the meeting from the session page.' using errcode = '42501';
  end if;
  select * into session from public.online_sessions where id = target_session_id;
  if not found or not private.is_class_student(session.class_id) then
    raise exception 'Session not found.' using errcode = 'P0002';
  end if;
  if session.status = 'cancelled' then
    raise exception 'This session was cancelled.' using errcode = '22023';
  end if;
  if session.meeting_url is null then
    raise exception 'The meeting link has not been added yet.' using errcode = '22023';
  end if;
  if now() < session.starts_at - interval '15 minutes' then
    raise exception 'The meeting opens 15 minutes before the start.' using errcode = '22023';
  end if;
  if now() > session.ends_at and session.status <> 'live' then
    raise exception 'This session has finished.' using errcode = '22023';
  end if;

  insert into public.online_session_joins (session_id, student_id) values (session.id, me)
  on conflict (session_id, student_id) do update set last_joined_at = now(), join_count = public.online_session_joins.join_count + 1;
  return session.meeting_url;
end;
$$;

revoke all on function public.join_online_session(uuid) from public, anon;
grant execute on function public.join_online_session(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Attendance on online days: a student may attend online even in an
-- in-person class, and online is the default that day.
-- -----------------------------------------------------------------------------
create or replace function private.prepare_attendance_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  session public.attendance_sessions;
  mode public.delivery_mode;
  online_day boolean;
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
  online_day := exists (
    select 1 from public.online_sessions o
    where o.class_id = new.class_id and o.session_date = new.session_date and o.status <> 'cancelled'
  );
  if online_day and mode = 'in_person' then
    mode := 'hybrid';
  end if;

  if new.status in ('absent', 'excused') then
    new.attended_via := null;
  else
    new.attended_via := coalesce(
      new.attended_via,
      case when online_day or mode = 'online' then 'online' else 'in_person' end::public.delivery_mode
    );
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

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.online_sessions enable row level security;
alter table public.online_session_materials enable row level security;
alter table public.online_session_homework enable row level security;
alter table public.online_session_notes enable row level security;
alter table public.online_session_joins enable row level security;

create policy online_sessions_select on public.online_sessions for select to authenticated using (
  private.can_write_class_online(class_id)
  or (select private.has_permission('online.read', 'all'))
  or ((select private.has_permission('online.read', 'assigned')) and private.is_class_teacher(class_id))
  or ((select private.has_permission('online.read', 'own')) and private.is_class_student(class_id))
  or ((select private.has_permission('online.read', 'children')) and private.is_class_of_child(class_id))
);
create policy online_sessions_insert on public.online_sessions for insert to authenticated
  with check (private.can_write_class_online(class_id));
create policy online_sessions_update on public.online_sessions for update to authenticated
  using (private.can_write_class_online(class_id)) with check (private.can_write_class_online(class_id));
-- Sessions are cancelled, never deleted.

-- Materials: everything for the class's staff; students and parents only
-- what is visible to students.
create policy online_session_materials_select on public.online_session_materials for select to authenticated using (
  exists (select 1 from public.online_sessions o where o.id = session_id and private.can_write_class_online(o.class_id))
  or (select private.has_permission('online.read', 'all'))
  or (visible_to_students and exists (select 1 from public.online_sessions o where o.id = session_id))
);
create policy online_session_materials_write on public.online_session_materials for all to authenticated
  using (exists (select 1 from public.online_sessions o where o.id = session_id and private.can_write_class_online(o.class_id)))
  with check (exists (select 1 from public.online_sessions o where o.id = session_id and private.can_write_class_online(o.class_id)));

create policy online_session_homework_select on public.online_session_homework for select to authenticated
  using (exists (select 1 from public.online_sessions o where o.id = session_id));
create policy online_session_homework_write on public.online_session_homework for all to authenticated
  using (exists (select 1 from public.online_sessions o where o.id = session_id and private.can_write_class_online(o.class_id)))
  with check (exists (select 1 from public.online_sessions o where o.id = session_id and private.can_write_class_online(o.class_id)));

create policy online_session_notes_all on public.online_session_notes for all to authenticated
  using (exists (select 1 from public.online_sessions o where o.id = session_id
                 and (private.can_write_class_online(o.class_id) or private.has_permission('online.read', 'all'))))
  with check (exists (select 1 from public.online_sessions o where o.id = session_id and private.can_write_class_online(o.class_id)));

create policy online_session_joins_select on public.online_session_joins for select to authenticated using (
  exists (select 1 from public.online_sessions o where o.id = session_id
          and (private.can_write_class_online(o.class_id) or private.has_permission('online.read', 'all')))
  or student_id = private.current_student_id()
);

revoke delete on public.online_sessions from authenticated;
revoke insert, update, delete on public.online_session_joins from authenticated;
revoke all on public.online_sessions, public.online_session_materials, public.online_session_homework,
  public.online_session_notes, public.online_session_joins from anon;

-- -----------------------------------------------------------------------------
-- Storage: assignment-files/online-sessions/<session_id>/<uuid>.<ext>
-- -----------------------------------------------------------------------------
create or replace function private.can_edit_online_files(target_session_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.online_sessions o
    where o.id::text = target_session_id and private.can_write_class_online(o.class_id)
  );
$$;

create policy online_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'online-sessions'
  and (
    private.can_edit_online_files((storage.foldername(name))[2])
    or exists (select 1 from public.online_session_materials m where m.object_path = name)
  )
);
create policy online_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (storage.foldername(name))[1] = 'online-sessions'
  and private.can_edit_online_files((storage.foldername(name))[2])
);
create policy online_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'online-sessions'
  and private.can_edit_online_files((storage.foldername(name))[2])
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
