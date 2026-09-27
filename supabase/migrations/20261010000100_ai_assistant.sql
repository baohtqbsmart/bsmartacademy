-- =============================================================================
-- AI Teaching Assistant.
--
--   ai_drafts    what the AI produced for a teacher, and the teacher's edits.
--                draft -> approved (frozen) or discarded. A draft is private to
--                its teacher; nothing here is ever visible to students.
--   ai_requests  one row per call to the AI provider (usage, errors, limits).
--
-- The AI never publishes anything: saving an approved draft to the platform
-- creates a private lesson design or a *draft* assignment, which the teacher
-- publishes (or not) through the normal pages.
-- =============================================================================

insert into public.permissions (code, description) values
  ('ai.use', 'Use the AI teaching assistant');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'ai.use', 'all'),
  ('admin',       'ai.use', 'all'),
  ('teacher',     'ai.use', 'own');

create type public.ai_task as enum (
  'lesson', 'worksheet', 'vocabulary', 'grammar', 'reading',
  'listening', 'speaking', 'writing', 'differentiated', 'homework'
);
create type public.ai_draft_status as enum ('draft', 'approved', 'discarded');
create type public.ai_request_status as enum ('started', 'succeeded', 'failed');

-- -----------------------------------------------------------------------------
-- Usage and limits
-- -----------------------------------------------------------------------------
create table public.ai_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  task          public.ai_task not null,
  status        public.ai_request_status not null default 'started',
  provider      text check (char_length(provider) <= 40),
  model         text check (char_length(model) <= 100),
  error_code    text check (char_length(error_code) <= 40),
  input_tokens  integer check (input_tokens >= 0),
  output_tokens integer check (output_tokens >= 0),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index ai_requests_user_idx on public.ai_requests (user_id, created_at desc);

comment on table public.ai_requests is 'One row per AI call. Written only by begin_ai_request()/finish_ai_request().';

-- Starts a request if the caller is under their limits; returns its id.
create or replace function public.begin_ai_request(target_task public.ai_task)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  hourly_limit constant integer := 20;
  daily_limit constant integer := 100;
  used_hour integer;
  used_day integer;
  oldest timestamptz;
  request_id uuid;
begin
  if me is null or not private.has_any_permission('ai.use') then
    raise exception 'You do not have access to the AI assistant.' using errcode = '42501';
  end if;
  -- One at a time per person (a stuck request expires after 3 minutes).
  if exists (select 1 from public.ai_requests where user_id = me and status = 'started' and created_at > now() - interval '3 minutes') then
    raise exception 'Another AI request of yours is still running. Please wait for it to finish.' using errcode = '22023';
  end if;
  select count(*), min(created_at) into used_hour, oldest from public.ai_requests where user_id = me and created_at > now() - interval '1 hour';
  if used_hour >= hourly_limit then
    raise exception 'You have used the AI assistant % times in the last hour. Try again in % minutes.',
      hourly_limit, greatest(1, ceil(extract(epoch from (oldest + interval '1 hour' - now())) / 60)::integer) using errcode = '22023';
  end if;
  select count(*) into used_day from public.ai_requests where user_id = me and created_at > now() - interval '1 day';
  if used_day >= daily_limit then
    raise exception 'You have reached today''s limit of % AI requests. Try again tomorrow.', daily_limit using errcode = '22023';
  end if;
  insert into public.ai_requests (user_id, task) values (me, target_task) returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.finish_ai_request(
  target_request uuid,
  succeeded boolean,
  target_provider text,
  target_model text,
  target_error text,
  tokens_in integer,
  tokens_out integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.ai_requests set
    status = case when succeeded then 'succeeded'::public.ai_request_status else 'failed'::public.ai_request_status end,
    provider = left(target_provider, 40),
    model = left(target_model, 100),
    error_code = left(target_error, 40),
    input_tokens = greatest(tokens_in, 0),
    output_tokens = greatest(tokens_out, 0),
    finished_at = now()
  where id = target_request and user_id = (select auth.uid()) and status = 'started';
end;
$$;

-- -----------------------------------------------------------------------------
-- Drafts
-- -----------------------------------------------------------------------------
create table public.ai_drafts (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  owner_name       text not null default '',
  task             public.ai_task not null,
  title            text not null check (btrim(title) <> '' and char_length(title) <= 200),
  input            jsonb not null check (jsonb_typeof(input) = 'object'),
  content          jsonb not null check (jsonb_typeof(content) = 'object' and octet_length(content::text) <= 200000),
  -- Exactly what the AI returned (after validation), kept for comparison.
  original_content jsonb not null check (jsonb_typeof(original_content) = 'object'),
  provider         text not null check (char_length(provider) <= 40),
  model            text not null check (char_length(model) <= 100),
  request_id       uuid references public.ai_requests (id) on delete set null,
  status           public.ai_draft_status not null default 'draft',
  approved_at      timestamptz,
  approved_by_name text,
  -- Platform items created from the approved draft: [{"type": "design"|"assignment", "id": "..."}].
  saved_to         jsonb not null default '[]' check (jsonb_typeof(saved_to) = 'array'),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check ((status = 'approved') = (approved_at is not null) or status = 'discarded')
);

create index ai_drafts_owner_idx on public.ai_drafts (owner_id, created_at desc);

create trigger ai_drafts_set_updated_at before update on public.ai_drafts
  for each row execute function private.set_updated_at();

-- The AI output, the input and the provenance never change; content is
-- editable only while a draft; approved drafts are frozen.
create or replace function private.prepare_ai_draft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce((select auth.uid()), new.owner_id);
    new.status := 'draft';
    new.approved_at := null;
    new.approved_by_name := null;
    new.saved_to := '[]';
    new.original_content := new.content;
  else
    new.owner_id := old.owner_id;
    new.task := old.task;
    new.input := old.input;
    new.original_content := old.original_content;
    new.provider := old.provider;
    new.model := old.model;
    new.request_id := old.request_id;
    new.created_at := old.created_at;
    if old.status <> 'draft' and (new.content, new.title) is distinct from (old.content, old.title) then
      raise exception 'Approved or discarded drafts cannot be edited. Generate a new draft instead.' using errcode = '22023';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'draft' and new.status in ('approved', 'discarded'))
      or (old.status = 'approved' and new.status = 'discarded')
    ) then
      raise exception 'A draft cannot go from % to %.', old.status, new.status using errcode = '22023';
    end if;
    if new.status = 'approved' and old.status = 'draft' then
      new.approved_at := now();
      new.approved_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
    else
      new.approved_at := old.approved_at;
      new.approved_by_name := old.approved_by_name;
    end if;
    if new.saved_to is distinct from old.saved_to and old.status <> 'approved' then
      raise exception 'Approve the draft before saving it to the platform.' using errcode = '22023';
    end if;
  end if;
  new.owner_name := coalesce((select full_name from public.profiles where id = new.owner_id), '');
  new.title := btrim(new.title);
  return new;
end;
$$;

create trigger ai_drafts_prepare before insert or update on public.ai_drafts
  for each row execute function private.prepare_ai_draft();

-- -----------------------------------------------------------------------------
-- Row level security: teachers see their own; administrators may review all.
-- Students and parents have no access at all.
-- -----------------------------------------------------------------------------
alter table public.ai_drafts enable row level security;
alter table public.ai_requests enable row level security;

create policy ai_drafts_select on public.ai_drafts for select to authenticated using (
  (owner_id = (select auth.uid()) and (select private.has_any_permission('ai.use')))
  or (select private.has_permission('ai.use', 'all'))
);
create policy ai_drafts_insert on public.ai_drafts for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.has_any_permission('ai.use')));
create policy ai_drafts_update on public.ai_drafts for update to authenticated
  using (owner_id = (select auth.uid()) and (select private.has_any_permission('ai.use')))
  with check (owner_id = (select auth.uid()));

create policy ai_requests_select on public.ai_requests for select to authenticated using (
  user_id = (select auth.uid()) or (select private.has_permission('ai.use', 'all'))
);

revoke insert, update, delete on public.ai_drafts from authenticated;
grant insert (task, title, input, content, provider, model, request_id) on public.ai_drafts to authenticated;
grant update (title, content, status, saved_to) on public.ai_drafts to authenticated;
revoke insert, update, delete on public.ai_requests from authenticated;
revoke all on public.ai_drafts, public.ai_requests from anon;

revoke all on function public.begin_ai_request(public.ai_task), public.finish_ai_request(uuid, boolean, text, text, text, integer, integer) from public, anon;
grant execute on function public.begin_ai_request(public.ai_task), public.finish_ai_request(uuid, boolean, text, text, text, integer, integer) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
