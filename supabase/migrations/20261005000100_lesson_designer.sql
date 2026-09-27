-- =============================================================================
-- Lesson Designer.
--
-- Teachers design slides, worksheets, flashcards, vocabulary cards, grammar
-- activities, quizzes and exit tickets in a page editor. A design is one JSON
-- document (pages of positioned elements), validated here with the same rules
-- as src/features/designer/model.ts.
--
--   design_templates   built-in starting points (read-only reference data)
--   designs            one per design, owned by its author; optional share link
--   design_assets      images, audio and video uploaded into a design
--
-- Sharing: a share token (random uuid) lets any signed-in BSmart user open a
-- read-only copy through shared_design(); turning sharing off or resetting the
-- link invalidates the old token. There is no anonymous access.
-- =============================================================================

insert into public.permissions (code, description) values
  ('designs.read',  'Open lesson designs'),
  ('designs.write', 'Create and edit lesson designs');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'designs.read',  'all'),
  ('super_admin', 'designs.write', 'all'),
  ('admin',       'designs.read',  'all'),
  ('admin',       'designs.write', 'all'),
  ('teacher',     'designs.read',  'own'),
  ('teacher',     'designs.write', 'own');

create type public.design_kind as enum ('presentation', 'worksheet', 'flashcards', 'vocabulary_cards', 'grammar_activity', 'quiz', 'exit_ticket');
create type public.design_template_category as enum ('vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'ielts', 'cambridge', 'review');

-- -----------------------------------------------------------------------------
-- Content validation
-- -----------------------------------------------------------------------------
create or replace function private.dj_num(v jsonb, lo numeric, hi numeric)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'number' and v::numeric between lo and hi, false);
$$;

create or replace function private.dj_int(v jsonb, lo integer, hi integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'number' and v::numeric = trunc(v::numeric) and v::numeric between lo and hi, false);
$$;

create or replace function private.dj_text(v jsonb, max_length integer, required boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= max_length and (not required or btrim(v #>> '{}') <> ''), false);
$$;

create or replace function private.dj_bool(v jsonb, optional boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select case when v is null then optional else jsonb_typeof(v) = 'boolean' end;
$$;

create or replace function private.dj_color(v jsonb, allow_transparent boolean default false)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and ((v #>> '{}') ~ '^#[0-9A-Fa-f]{6}$' or (allow_transparent and v #>> '{}' = 'transparent')), false);
$$;

create or replace function private.dj_enum(v jsonb, allowed text[])
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and (v #>> '{}') = any(allowed), false);
$$;

create or replace function private.dj_https(v jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(jsonb_typeof(v) = 'string' and char_length(v #>> '{}') <= 1000 and (v #>> '{}') ~ '^https://[^\s<>"]+$', false);
$$;

create or replace function private.dj_string_array(v jsonb, max_items integer, max_length integer)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(
    jsonb_typeof(v) = 'array' and jsonb_array_length(v) <= max_items
    and not exists (select 1 from jsonb_array_elements(v) x where not private.dj_text(x.value, max_length)),
    false);
$$;

-- An element's problem, or null. page_ids: the design's pages (button targets).
create or replace function private.design_element_problem(el jsonb, page_ids text[], target_design_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  kind text := el ->> 'type';
  n_options integer;
  n_cols integer;
begin
  if jsonb_typeof(el) is distinct from 'object' or coalesce(el ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$' then
    return 'Every element needs an id.';
  end if;
  if not (private.dj_num(el -> 'x', -5000, 5000) and private.dj_num(el -> 'y', -5000, 5000)
          and private.dj_num(el -> 'w', 1, 5000) and private.dj_num(el -> 'h', 1, 5000)
          and private.dj_bool(el -> 'hidden', true)) then
    return 'An element has an invalid position or size.';
  end if;

  case kind
  when 'text' then
    if not (private.dj_text(el -> 'text', 5000) and private.dj_num(el -> 'fontSize', 8, 200)
            and private.dj_enum(el -> 'fontFamily', array['sans', 'serif', 'rounded', 'mono'])
            and private.dj_bool(el -> 'bold') and private.dj_bool(el -> 'italic') and private.dj_bool(el -> 'underline')
            and private.dj_enum(el -> 'align', array['left', 'center', 'right'])
            and private.dj_color(el -> 'color') and private.dj_color(el -> 'fill', true)) then
      return 'A text box has invalid settings.';
    end if;
  when 'image' then
    if not (private.dj_enum(el -> 'fit', array['cover', 'contain']) and private.dj_num(el -> 'radius', 0, 1000) and private.dj_text(el -> 'alt', 300)) then
      return 'An image has invalid settings.';
    end if;
    if not exists (select 1 from public.design_assets a where a.id::text = el ->> 'assetId' and a.design_id = target_design_id and a.media = 'image') then
      return 'An image must be a picture uploaded to this design.';
    end if;
  when 'shape' then
    if not (private.dj_enum(el -> 'shape', array['rect', 'ellipse', 'triangle', 'line', 'arrow'])
            and private.dj_color(el -> 'fill', true) and private.dj_color(el -> 'stroke', true)
            and private.dj_num(el -> 'strokeWidth', 0, 40) and private.dj_num(el -> 'radius', 0, 1000)) then
      return 'A shape has invalid settings.';
    end if;
  when 'table' then
    if jsonb_typeof(el -> 'rows') is distinct from 'array' or jsonb_array_length(el -> 'rows') not between 1 and 12 then
      return 'A table has 1 to 12 rows.';
    end if;
    n_cols := case when jsonb_typeof(el -> 'rows' -> 0) = 'array' then jsonb_array_length(el -> 'rows' -> 0) end;
    if n_cols is null or n_cols not between 1 and 8 or exists (
      select 1 from jsonb_array_elements(el -> 'rows') r
      where jsonb_typeof(r.value) is distinct from 'array' or jsonb_array_length(r.value) <> n_cols or not private.dj_string_array(r.value, 8, 500)
    ) then
      return 'A table has 1 to 8 columns, the same in every row, and short cells.';
    end if;
    if not (private.dj_bool(el -> 'header') and private.dj_num(el -> 'fontSize', 8, 72) and private.dj_color(el -> 'color')
            and private.dj_color(el -> 'borderColor') and private.dj_color(el -> 'headerFill', true)) then
      return 'A table has invalid settings.';
    end if;
  when 'icon' then
    if coalesce(el ->> 'icon', '') !~ '^[a-z0-9-]{1,40}$' or not private.dj_color(el -> 'color') then
      return 'An icon has invalid settings.';
    end if;
  when 'audio' then
    if not private.dj_text(el -> 'label', 200) then
      return 'An audio clip has invalid settings.';
    end if;
    if not exists (select 1 from public.design_assets a where a.id::text = el ->> 'assetId' and a.design_id = target_design_id and a.media = 'audio') then
      return 'Audio must be a recording uploaded to this design.';
    end if;
  when 'video' then
    if not private.dj_text(el -> 'label', 200) then
      return 'A video has invalid settings.';
    end if;
    if jsonb_typeof(el -> 'assetId') = 'string' and jsonb_typeof(el -> 'url') = 'null' then
      if not exists (select 1 from public.design_assets a where a.id::text = el ->> 'assetId' and a.design_id = target_design_id and a.media = 'video') then
        return 'A video must be uploaded to this design or be an https:// link.';
      end if;
    elsif not (jsonb_typeof(el -> 'assetId') = 'null' and private.dj_https(el -> 'url')) then
      return 'A video must be uploaded to this design or be an https:// link.';
    end if;
  when 'question' then
    if not (private.dj_enum(el -> 'questionType', array['multiple_choice', 'true_false', 'short_answer'])
            and private.dj_text(el -> 'prompt', 1000, true)
            and private.dj_string_array(el -> 'options', 8, 300) and private.dj_string_array(el -> 'answers', 10, 200)
            and jsonb_typeof(el -> 'correct') = 'array' and jsonb_array_length(el -> 'correct') <= 8
            and private.dj_text(el -> 'explanation', 1000) and private.dj_num(el -> 'fontSize', 8, 72)
            and private.dj_color(el -> 'color') and private.dj_color(el -> 'fill', true)) then
      return 'A question has invalid settings.';
    end if;
    n_options := jsonb_array_length(el -> 'options');
    if exists (select 1 from jsonb_array_elements(el -> 'correct') c where not private.dj_int(c.value, 0, n_options - 1)) then
      return 'A question marks an option that does not exist.';
    end if;
    if el ->> 'questionType' = 'multiple_choice' and (n_options < 2 or jsonb_array_length(el -> 'correct') < 1
       or exists (select 1 from jsonb_array_elements_text(el -> 'options') o where btrim(o.value) = '')) then
      return 'A multiple-choice question needs at least two options and a correct answer.';
    elsif el ->> 'questionType' = 'true_false' and (n_options <> 2 or jsonb_array_length(el -> 'correct') <> 1) then
      return 'A true/false question needs its answer.';
    elsif el ->> 'questionType' = 'short_answer'
       and not exists (select 1 from jsonb_array_elements_text(el -> 'answers') a where btrim(a.value) <> '') then
      return 'A short-answer question needs at least one accepted answer.';
    end if;
  when 'button' then
    if not (private.dj_text(el -> 'label', 60, true) and private.dj_enum(el -> 'action', array['next', 'prev', 'page', 'url', 'reveal'])
            and private.dj_color(el -> 'fill') and private.dj_color(el -> 'color') and private.dj_num(el -> 'fontSize', 8, 72)) then
      return 'A button has invalid settings.';
    end if;
    if el ->> 'action' = 'url' and not private.dj_https(el -> 'target') then
      return 'A link button needs an https:// link.';
    elsif el ->> 'action' = 'page' and not coalesce((el ->> 'target') = any(page_ids), false) then
      return 'A button opens a page that does not exist.';
    elsif el ->> 'action' not in ('url', 'page') and jsonb_typeof(el -> 'target') is distinct from 'null' then
      return 'A button has invalid settings.';
    end if;
  else
    return 'Unknown element type.';
  end case;
  return null;
end;
$$;

create or replace function private.design_content_problem(content jsonb, target_design_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  page jsonb;
  el jsonb;
  page_ids text[] := '{}';
  element_ids text[] := '{}';
  problem text;
begin
  if jsonb_typeof(content) is distinct from 'object' then
    return 'The design content is invalid.';
  end if;
  if octet_length(content::text) > 1000000 then
    return 'The design is too large. Split it into several designs.';
  end if;
  if not private.dj_enum(content -> 'pageSize', array['slide', 'a4_portrait', 'a4_landscape', 'card', 'square']) then
    return 'Unknown page size.';
  end if;
  if jsonb_typeof(content -> 'pages') is distinct from 'array' or jsonb_array_length(content -> 'pages') not between 1 and 60 then
    return 'A design has 1 to 60 pages.';
  end if;

  for page in select value from jsonb_array_elements(content -> 'pages') loop
    if jsonb_typeof(page) is distinct from 'object' or coalesce(page ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$' then
      return 'Every page needs an id.';
    end if;
    if (page ->> 'id') = any(page_ids) then
      return 'Page ids must be unique.';
    end if;
    page_ids := page_ids || (page ->> 'id');
  end loop;

  for page in select value from jsonb_array_elements(content -> 'pages') loop
    if not private.dj_color(page -> 'background') then
      return 'A page has an invalid background colour.';
    end if;
    if jsonb_typeof(page -> 'elements') is distinct from 'array' or jsonb_array_length(page -> 'elements') > 150 then
      return 'A page has at most 150 elements.';
    end if;
    for el in select value from jsonb_array_elements(page -> 'elements') loop
      problem := private.design_element_problem(el, page_ids, target_design_id);
      if problem is not null then
        return problem;
      end if;
      if (el ->> 'id') = any(element_ids) then
        return 'Element ids must be unique.';
      end if;
      element_ids := element_ids || (el ->> 'id');
    end loop;
  end loop;
  return null;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------
create table public.design_templates (
  key         text primary key check (key ~ '^[a-z0-9-]{1,60}$'),
  category    public.design_template_category not null,
  kind        public.design_kind not null,
  name        text not null check (btrim(name) <> '' and char_length(name) <= 120),
  description text not null default '' check (char_length(description) <= 500),
  content     jsonb not null,
  sort_order  integer not null default 0,
  -- Templates carry no uploads (an asset belongs to one design).
  check (private.design_content_problem(content, null) is null)
);

comment on table public.design_templates is 'Built-in starting points for the lesson designer. Reference data, maintained by migrations.';

create table public.designs (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles (id) on delete cascade,
  owner_name   text not null default '',
  title        text not null check (btrim(title) <> '' and char_length(title) <= 200),
  kind         public.design_kind not null,
  template_key text references public.design_templates (key) on delete set null,
  content      jsonb not null,
  version      integer not null default 1,
  share_token  uuid unique,
  shared_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check ((share_token is null) = (shared_at is null))
);

comment on column public.designs.version is 'Increases on every content or title change; saves send the version they started from (no silent overwrites between tabs).';
comment on column public.designs.share_token is 'Secret of the share link. Null = not shared. Changed only through set_design_sharing().';

create index designs_owner_idx on public.designs (owner_id, updated_at desc);

create trigger designs_set_updated_at before update on public.designs
  for each row execute function private.set_updated_at();

create table public.design_assets (
  id          uuid primary key default gen_random_uuid(),
  design_id   uuid not null references public.designs (id) on delete cascade,
  object_path text not null unique,
  file_name   text not null,
  mime_type   text not null references public.upload_file_types (mime_type),
  size_bytes  bigint not null check (size_bytes between 1 and 20971520),
  media       text generated always as (split_part(mime_type, '/', 1)) stored check (media in ('image', 'audio', 'video')),
  created_at  timestamptz not null default now()
);

create index design_assets_design_idx on public.design_assets (design_id);

create or replace function private.can_read_design(owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('designs.read', 'all')
    or (private.has_permission('designs.read', 'own') and owner = (select auth.uid()));
$$;

create or replace function private.can_edit_design(owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('designs.write', 'all')
    or (private.has_permission('designs.write', 'own') and owner = (select auth.uid()));
$$;

-- Owner and sharing are set here, never by the client; content is validated.
create or replace function private.prepare_design()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  problem text;
begin
  if tg_op = 'INSERT' then
    -- Seeds run without a user and name the owner themselves.
    new.owner_id := coalesce((select auth.uid()), new.owner_id);
    new.version := 1;
    if (select auth.uid()) is not null then
      new.share_token := null;
      new.shared_at := null;
    end if;
    if new.template_key is not null and not exists (select 1 from public.design_templates where key = new.template_key) then
      new.template_key := null;
    end if;
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.template_key := old.template_key;
    new.version := old.version + case when (new.content, new.title) is distinct from (old.content, old.title) then 1 else 0 end;
  end if;
  new.owner_name := coalesce((select full_name from public.profiles where id = new.owner_id), '');
  new.title := btrim(new.title);

  if tg_op = 'INSERT' or new.content is distinct from old.content then
    problem := private.design_content_problem(new.content, new.id);
    if problem is not null then
      raise exception '%', problem using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create trigger designs_prepare before insert or update on public.designs
  for each row execute function private.prepare_design();

create or replace function private.prepare_design_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.mime_type !~ '^(image|audio|video)/' then
    raise exception 'Only images, audio and video can be added to a design.' using errcode = '22023';
  end if;
  perform private.validate_upload(new.object_path, 'designs/' || new.design_id, new.file_name, new.mime_type, new.size_bytes);
  if (select count(*) from public.design_assets where design_id = new.design_id) >= 200 then
    raise exception 'A design can have at most 200 uploaded files.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger design_assets_prepare before insert on public.design_assets
  for each row execute function private.prepare_design_asset();

-- A file still used on a page cannot be removed.
create or replace function private.protect_used_design_asset()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.designs d
    where d.id = old.design_id
      and jsonb_path_exists(d.content, '$.pages[*].elements[*] ? (@.assetId == $id)', jsonb_build_object('id', old.id::text))
  ) then
    raise exception 'This file is still used in the design. Remove it from the pages first.' using errcode = '22023';
  end if;
  return old;
end;
$$;

create trigger design_assets_protect before delete on public.design_assets
  for each row execute function private.protect_used_design_asset();

-- -----------------------------------------------------------------------------
-- Sharing
-- -----------------------------------------------------------------------------

-- Turns the share link on (keeping an existing token), off, or resets it.
create or replace function public.set_design_sharing(target_design_id uuid, mode text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  design public.designs;
  new_token uuid;
begin
  select * into design from public.designs where id = target_design_id;
  if not found or not private.can_edit_design(design.owner_id) then
    raise exception 'Design not found.' using errcode = 'P0002';
  end if;
  if mode not in ('on', 'off', 'reset') then
    raise exception 'Unknown sharing mode.' using errcode = '22023';
  end if;
  update public.designs set
    share_token = case mode when 'off' then null when 'reset' then gen_random_uuid() else coalesce(share_token, gen_random_uuid()) end,
    shared_at = case mode when 'off' then null when 'reset' then now() else coalesce(shared_at, now()) end
  where id = target_design_id
  returning share_token into new_token;
  return new_token;
end;
$$;

-- A shared design, for any signed-in user holding the link.
create or replace function public.shared_design(token uuid)
returns table (id uuid, title text, kind public.design_kind, content jsonb, owner_name text, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.title, d.kind, d.content, d.owner_name, d.updated_at
  from public.designs d
  where token is not null and d.share_token = token and (select auth.uid()) is not null;
$$;

create or replace function public.shared_design_assets(token uuid)
returns table (id uuid, object_path text, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.object_path, a.mime_type
  from public.design_assets a
  join public.designs d on d.id = a.design_id
  where token is not null and d.share_token = token and (select auth.uid()) is not null;
$$;

revoke all on function public.set_design_sharing(uuid, text), public.shared_design(uuid), public.shared_design_assets(uuid) from public, anon;
grant execute on function public.set_design_sharing(uuid, text), public.shared_design(uuid), public.shared_design_assets(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.design_templates enable row level security;
alter table public.designs enable row level security;
alter table public.design_assets enable row level security;

create policy design_templates_select on public.design_templates for select to authenticated
  using ((select private.has_any_permission('designs.read')));

create policy designs_select on public.designs for select to authenticated using (private.can_read_design(owner_id));
create policy designs_insert on public.designs for insert to authenticated
  with check (owner_id = (select auth.uid()) and (select private.has_any_permission('designs.write')));
create policy designs_update on public.designs for update to authenticated
  using (private.can_edit_design(owner_id)) with check (private.can_edit_design(owner_id));
create policy designs_delete on public.designs for delete to authenticated using (private.can_edit_design(owner_id));

create policy design_assets_select on public.design_assets for select to authenticated
  using (exists (select 1 from public.designs d where d.id = design_id));
create policy design_assets_insert on public.design_assets for insert to authenticated
  with check (exists (select 1 from public.designs d where d.id = design_id and private.can_edit_design(d.owner_id)));
create policy design_assets_delete on public.design_assets for delete to authenticated
  using (exists (select 1 from public.designs d where d.id = design_id and private.can_edit_design(d.owner_id)));

-- Clients change only title, kind and content; sharing goes through the RPC.
revoke insert, update on public.designs from authenticated;
grant insert (title, kind, template_key, content) on public.designs to authenticated;
grant update (title, kind, content) on public.designs to authenticated;
revoke insert, update, delete on public.design_templates from authenticated;
revoke update on public.design_assets from authenticated;
revoke all on public.design_templates, public.designs, public.design_assets from anon;

-- -----------------------------------------------------------------------------
-- Storage: assignment-files/designs/<design_id>/<uuid>.<ext>
-- -----------------------------------------------------------------------------
create or replace function private.can_edit_design_files(target_design_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.designs d where d.id::text = target_design_id and private.can_edit_design(d.owner_id));
$$;

-- Readers of the design, and anyone signed in once it is shared (the object
-- names are random and only reachable through the share link).
create or replace function private.can_view_design_files(target_design_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.designs d
    where d.id::text = target_design_id and (private.can_read_design(d.owner_id) or d.share_token is not null)
  );
$$;

create policy design_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'designs'
  and private.can_view_design_files((storage.foldername(name))[2])
);
create policy design_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (storage.foldername(name))[1] = 'designs'
  and private.can_edit_design_files((storage.foldername(name))[2])
);
create policy design_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'designs'
  and private.can_edit_design_files((storage.foldername(name))[2])
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Built-in templates (generated; every one passes design_content_problem()).
-- -----------------------------------------------------------------------------
insert into public.design_templates (key, category, kind, name, description, content, sort_order) values
  ('vocabulary-cards', 'vocabulary', 'vocabulary_cards', 'Vocabulary flip cards', 'Word, pronunciation and a picture on the front; meaning and example revealed with Flip.',
   '{"pageSize":"card","pages":[{"id":"p008","background":"#fff7ed","elements":[{"id":"e001","type":"shape","x":40,"y":40,"w":820,"h":520,"shape":"rect","fill":"#ffffff","stroke":"#f59e0b","strokeWidth":4,"radius":32},{"id":"e002","type":"icon","x":390,"y":80,"w":120,"h":120,"icon":"image","color":"#cbd5e1"},{"id":"e003","type":"text","x":80,"y":210,"w":740,"h":90,"text":"elephant","fontSize":64,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#1e3a5f","fill":"transparent"},{"id":"e004","type":"text","x":80,"y":300,"w":740,"h":50,"text":"/ˈel.ɪ.fənt/ · noun","fontSize":26,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e005","type":"text","x":80,"y":360,"w":740,"h":60,"text":"con voi","fontSize":36,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#0f766e","fill":"transparent","hidden":true},{"id":"e006","type":"text","x":80,"y":420,"w":740,"h":50,"text":"An elephant has big ears and a long trunk.","fontSize":24,"fontFamily":"sans","bold":false,"italic":true,"underline":false,"align":"center","color":"#1f2937","fill":"transparent","hidden":true},{"id":"e007","type":"button","x":360,"y":480,"w":180,"h":56,"label":"Flip","action":"reveal","target":null,"fill":"#f59e0b","color":"#1f2937","fontSize":24}]},{"id":"p016","background":"#fff7ed","elements":[{"id":"e009","type":"shape","x":40,"y":40,"w":820,"h":520,"shape":"rect","fill":"#ffffff","stroke":"#f59e0b","strokeWidth":4,"radius":32},{"id":"e010","type":"icon","x":390,"y":80,"w":120,"h":120,"icon":"image","color":"#cbd5e1"},{"id":"e011","type":"text","x":80,"y":210,"w":740,"h":90,"text":"giraffe","fontSize":64,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#1e3a5f","fill":"transparent"},{"id":"e012","type":"text","x":80,"y":300,"w":740,"h":50,"text":"/dʒɪˈrɑːf/ · noun","fontSize":26,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e013","type":"text","x":80,"y":360,"w":740,"h":60,"text":"hươu cao cổ","fontSize":36,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#0f766e","fill":"transparent","hidden":true},{"id":"e014","type":"text","x":80,"y":420,"w":740,"h":50,"text":"The giraffe eats leaves from tall trees.","fontSize":24,"fontFamily":"sans","bold":false,"italic":true,"underline":false,"align":"center","color":"#1f2937","fill":"transparent","hidden":true},{"id":"e015","type":"button","x":360,"y":480,"w":180,"h":56,"label":"Flip","action":"reveal","target":null,"fill":"#f59e0b","color":"#1f2937","fontSize":24}]}]}'::jsonb, 1),
  ('grammar-rule-practice', 'grammar', 'grammar_activity', 'Grammar: rule, examples, practice', 'Presents a structure with a form table and examples, then checks it with questions.',
   '{"pageSize":"slide","pages":[{"id":"p004","background":"#f5f3ff","elements":[{"id":"e001","type":"text","x":80,"y":250,"w":1120,"h":120,"text":"Past simple","fontSize":72,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#6d28d9","fill":"transparent"},{"id":"e002","type":"text","x":80,"y":380,"w":1120,"h":60,"text":"Talking about finished actions","fontSize":30,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e003","type":"icon","x":590,"y":120,"w":100,"h":100,"icon":"clock","color":"#6d28d9"}]},{"id":"p010","background":"#ffffff","elements":[{"id":"e005","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"Form","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#6d28d9","fill":"transparent"},{"id":"e006","type":"table","x":60,"y":140,"w":1160,"h":260,"rows":[["","Regular","Irregular"],["Positive","I played football.","I went to school."],["Negative","I didn''t play.","I didn''t go."],["Question","Did you play?","Did you go?"]],"header":true,"fontSize":26,"color":"#1f2937","borderColor":"#94a3b8","headerFill":"#ede9fe"},{"id":"e007","type":"shape","x":60,"y":440,"w":1160,"h":200,"shape":"rect","fill":"#fef3c7","stroke":"transparent","strokeWidth":0,"radius":20},{"id":"e008","type":"icon","x":90,"y":470,"w":60,"h":60,"icon":"lightbulb","color":"#f59e0b"},{"id":"e009","type":"text","x":170,"y":465,"w":1020,"h":160,"text":"Use the past simple for finished actions at a known time: yesterday, last week, in 2020.\nCommon mistake: \"I didn''t went\" ✗ → \"I didn''t go\" ✓","fontSize":26,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1f2937","fill":"transparent"}]},{"id":"p015","background":"#ffffff","elements":[{"id":"e011","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"Practice","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#6d28d9","fill":"transparent"},{"id":"e012","type":"question","x":60,"y":130,"w":560,"h":260,"questionType":"multiple_choice","prompt":"Yesterday I ___ to the park.","options":["go","went","goes"],"correct":[1],"answers":[],"explanation":"","fontSize":24,"color":"#1f2937","fill":"#ffffff"},{"id":"e013","type":"question","x":660,"y":130,"w":560,"h":260,"questionType":"short_answer","prompt":"Write the past of \"buy\".","options":[],"correct":[],"answers":["bought"],"explanation":"","fontSize":22,"color":"#1f2937","fill":"#ffffff"},{"id":"e014","type":"question","x":60,"y":420,"w":1160,"h":200,"questionType":"true_false","prompt":"\"Did she went home?\" is correct.","options":["True","False"],"correct":[1],"answers":[],"explanation":"","fontSize":22,"color":"#1f2937","fill":"#ffffff"}]}]}'::jsonb, 2),
  ('reading-worksheet', 'reading', 'worksheet', 'Reading worksheet', 'A passage with comprehension questions and a vocabulary box.',
   '{"pageSize":"a4_portrait","pages":[{"id":"p009","background":"#ffffff","elements":[{"id":"e001","type":"text","x":50,"y":40,"w":694,"h":60,"text":"Reading: A day at the zoo","fontSize":34,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e002","type":"text","x":50,"y":100,"w":694,"h":34,"text":"Name: ____________________   Class: ________","fontSize":18,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#64748b","fill":"transparent"},{"id":"e003","type":"shape","x":40,"y":150,"w":714,"h":360,"shape":"rect","fill":"#f8fafc","stroke":"#cbd5e1","strokeWidth":2,"radius":12},{"id":"e004","type":"text","x":60,"y":165,"w":674,"h":330,"text":"Last Sunday, Minh and his sister visited the zoo. First, they saw the elephants. The biggest elephant was washing itself with its trunk. Then they watched the monkeys jumping from tree to tree. Minh''s favourite animal was the giraffe because it was so tall. At lunchtime they had sandwiches next to the lake. In the afternoon it started to rain, so they went home early.","fontSize":19,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1f2937","fill":"transparent"},{"id":"e005","type":"question","x":40,"y":530,"w":714,"h":120,"questionType":"true_false","prompt":"Minh went to the zoo with his brother.","options":["True","False"],"correct":[1],"answers":[],"explanation":"","fontSize":18,"color":"#1f2937","fill":"#ffffff"},{"id":"e006","type":"question","x":40,"y":665,"w":714,"h":190,"questionType":"multiple_choice","prompt":"What was Minh''s favourite animal?","options":["the elephant","the monkey","the giraffe"],"correct":[2],"answers":[],"explanation":"","fontSize":18,"color":"#1f2937","fill":"#ffffff"},{"id":"e007","type":"question","x":40,"y":870,"w":714,"h":120,"questionType":"short_answer","prompt":"Why did they go home early?","options":[],"correct":[],"answers":["because it started to rain","it started to rain","because it rained","it rained"],"explanation":"","fontSize":18,"color":"#1f2937","fill":"#ffffff"},{"id":"e008","type":"table","x":40,"y":1005,"w":714,"h":90,"rows":[["trunk","lake","early"]],"header":false,"fontSize":18,"color":"#1f2937","borderColor":"#94a3b8","headerFill":"#e0f2fe"}]}]}'::jsonb, 3),
  ('listening-lesson', 'listening', 'presentation', 'Listening lesson', 'Pre-listening, a space for the audio, and questions with answers revealed afterwards.',
   '{"pageSize":"slide","pages":[{"id":"p004","background":"#e0f2fe","elements":[{"id":"e001","type":"text","x":80,"y":250,"w":1120,"h":120,"text":"Listening","fontSize":72,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#1e3a5f","fill":"transparent"},{"id":"e002","type":"text","x":80,"y":380,"w":1120,"h":60,"text":"Before you listen: what do you already know?","fontSize":30,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e003","type":"icon","x":590,"y":120,"w":100,"h":100,"icon":"headphones","color":"#1e3a5f"}]},{"id":"p013","background":"#ffffff","elements":[{"id":"e005","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"Listen and answer","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e006","type":"shape","x":60,"y":130,"w":520,"h":120,"shape":"rect","fill":"#e0f2fe","stroke":"#1e3a5f","strokeWidth":2,"radius":20},{"id":"e007","type":"icon","x":80,"y":150,"w":80,"h":80,"icon":"headphones","color":"#1e3a5f"},{"id":"e008","type":"text","x":180,"y":150,"w":380,"h":80,"text":"Add the recording here with the Audio tool.","fontSize":22,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e009","type":"question","x":640,"y":130,"w":580,"h":250,"questionType":"multiple_choice","prompt":"Where are the speakers?","options":["at a shop","at school","at home"],"correct":[0],"answers":[],"explanation":"","fontSize":24,"color":"#1f2937","fill":"#ffffff"},{"id":"e010","type":"question","x":60,"y":290,"w":520,"h":200,"questionType":"short_answer","prompt":"What time does the shop close?","options":[],"correct":[],"answers":["6 pm","six o''clock","6 o''clock","at 6"],"explanation":"","fontSize":22,"color":"#1f2937","fill":"#ffffff"},{"id":"e011","type":"text","x":640,"y":420,"w":580,"h":120,"text":"Transcript: add it here — it stays hidden until you press Reveal.","fontSize":20,"fontFamily":"sans","bold":false,"italic":true,"underline":false,"align":"left","color":"#64748b","fill":"transparent","hidden":true},{"id":"e012","type":"button","x":1000,"y":600,"w":220,"h":64,"label":"Reveal","action":"reveal","target":null,"fill":"#0f766e","color":"#ffffff","fontSize":24}]}]}'::jsonb, 4),
  ('speaking-cards', 'speaking', 'presentation', 'Speaking prompts', 'A discussion prompt with useful language and a follow-up question card.',
   '{"pageSize":"slide","pages":[{"id":"p004","background":"#ecfdf5","elements":[{"id":"e001","type":"text","x":80,"y":250,"w":1120,"h":120,"text":"Let''s talk!","fontSize":72,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#0f766e","fill":"transparent"},{"id":"e002","type":"text","x":80,"y":380,"w":1120,"h":60,"text":"Speaking practice","fontSize":30,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e003","type":"icon","x":590,"y":120,"w":100,"h":100,"icon":"message-circle","color":"#0f766e"}]},{"id":"p012","background":"#ffffff","elements":[{"id":"e005","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"Talk to your partner","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#0f766e","fill":"transparent"},{"id":"e006","type":"shape","x":60,"y":140,"w":700,"h":300,"shape":"rect","fill":"#ecfdf5","stroke":"transparent","strokeWidth":0,"radius":24},{"id":"e007","type":"text","x":90,"y":170,"w":640,"h":240,"text":"Describe your favourite place in your town.\n• Where is it?\n• What can you do there?\n• Why do you like it?","fontSize":30,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1f2937","fill":"transparent"},{"id":"e008","type":"table","x":800,"y":140,"w":420,"h":300,"rows":[["Useful language"],["My favourite place is…"],["You can… there."],["I like it because…"]],"header":true,"fontSize":22,"color":"#1f2937","borderColor":"#94a3b8","headerFill":"#ecfdf5"},{"id":"e009","type":"shape","x":60,"y":480,"w":1160,"h":150,"shape":"rect","fill":"#fef3c7","stroke":"transparent","strokeWidth":0,"radius":24,"hidden":true},{"id":"e010","type":"text","x":90,"y":500,"w":1100,"h":110,"text":"Follow-up: Would you like to live there when you are older? Why?","fontSize":28,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1f2937","fill":"transparent","hidden":true},{"id":"e011","type":"button","x":1000,"y":650,"w":220,"h":56,"label":"Next question","action":"reveal","target":null,"fill":"#0f766e","color":"#ffffff","fontSize":22}]}]}'::jsonb, 5),
  ('writing-planner', 'writing', 'worksheet', 'Writing task and planner', 'The task, a planning table and lined space to write.',
   '{"pageSize":"a4_portrait","pages":[{"id":"p018","background":"#ffffff","elements":[{"id":"e001","type":"text","x":50,"y":40,"w":694,"h":60,"text":"Writing: An email to a friend","fontSize":34,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e002","type":"shape","x":40,"y":110,"w":714,"h":150,"shape":"rect","fill":"#fef3c7","stroke":"transparent","strokeWidth":0,"radius":12},{"id":"e003","type":"text","x":60,"y":125,"w":674,"h":125,"text":"Write an email to your friend about your last holiday (60–80 words). Say where you went, what you did and what you liked best.","fontSize":20,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1f2937","fill":"transparent"},{"id":"e004","type":"table","x":40,"y":280,"w":714,"h":200,"rows":[["Plan","Notes"],["Where?",""],["What did you do?",""],["Best part?",""]],"header":true,"fontSize":18,"color":"#1f2937","borderColor":"#94a3b8","headerFill":"#e0f2fe"},{"id":"e005","type":"shape","x":50,"y":540,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e006","type":"shape","x":50,"y":584,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e007","type":"shape","x":50,"y":628,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e008","type":"shape","x":50,"y":672,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e009","type":"shape","x":50,"y":716,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e010","type":"shape","x":50,"y":760,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e011","type":"shape","x":50,"y":804,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e012","type":"shape","x":50,"y":848,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e013","type":"shape","x":50,"y":892,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e014","type":"shape","x":50,"y":936,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e015","type":"shape","x":50,"y":980,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e016","type":"shape","x":50,"y":1024,"w":694,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e017","type":"text","x":50,"y":1070,"w":694,"h":30,"text":"Checklist: greeting ☐  past simple ☐  3 details ☐  ending ☐","fontSize":16,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#64748b","fill":"transparent"}]}]}'::jsonb, 6),
  ('ielts-writing-task2', 'ielts', 'presentation', 'IELTS-style Writing Task 2 lesson', 'Question analysis, a paragraph plan and the four marking criteria (practice material, not official IELTS).',
   '{"pageSize":"slide","pages":[{"id":"p003","background":"#1e3a5f","elements":[{"id":"e001","type":"text","x":80,"y":230,"w":1120,"h":120,"text":"IELTS-style Writing Task 2","fontSize":64,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#ffffff","fill":"transparent"},{"id":"e002","type":"text","x":80,"y":360,"w":1120,"h":60,"text":"Opinion essay · practice material, not an official IELTS task","fontSize":26,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#cbd5e1","fill":"transparent"}]},{"id":"p008","background":"#ffffff","elements":[{"id":"e004","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"The question","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e005","type":"shape","x":60,"y":130,"w":1160,"h":170,"shape":"rect","fill":"#e0f2fe","stroke":"transparent","strokeWidth":0,"radius":16},{"id":"e006","type":"text","x":90,"y":150,"w":1100,"h":130,"text":"Some people think children should learn a foreign language at primary school. Others think it is better to start at secondary school. Discuss both views and give your opinion.","fontSize":26,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#1f2937","fill":"transparent"},{"id":"e007","type":"table","x":60,"y":330,"w":1160,"h":330,"rows":[["Paragraph","Purpose","Your notes"],["Introduction","Paraphrase + your position",""],["Body 1","View A + reason + example",""],["Body 2","View B + reason + example",""],["Conclusion","Restate your opinion",""]],"header":true,"fontSize":22,"color":"#1f2937","borderColor":"#94a3b8","headerFill":"#e0f2fe"}]},{"id":"p012","background":"#ffffff","elements":[{"id":"e009","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"How it is marked","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e010","type":"table","x":60,"y":130,"w":1160,"h":420,"rows":[["Criterion","Ask yourself"],["Task Response","Did I answer every part and give a clear opinion?"],["Coherence and Cohesion","Are my paragraphs logical and linked?"],["Lexical Resource","Did I use a range of accurate vocabulary?"],["Grammatical Range and Accuracy","Did I use varied, correct sentences?"]],"header":true,"fontSize":24,"color":"#1f2937","borderColor":"#94a3b8","headerFill":"#e0f2fe"},{"id":"e011","type":"text","x":60,"y":580,"w":1160,"h":60,"text":"Band scores given in class are practice estimates, not official IELTS results.","fontSize":20,"fontFamily":"sans","bold":false,"italic":true,"underline":false,"align":"left","color":"#64748b","fill":"transparent"}]}]}'::jsonb, 7),
  ('cambridge-look-read', 'cambridge', 'quiz', 'Cambridge-style Look and read', 'Picture-based questions in the style of the Cambridge English Young Learners papers (practice, not official material).',
   '{"pageSize":"slide","pages":[{"id":"p004","background":"#fff7ed","elements":[{"id":"e001","type":"text","x":80,"y":250,"w":1120,"h":120,"text":"Look and read","fontSize":72,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"center","color":"#ea580c","fill":"transparent"},{"id":"e002","type":"text","x":80,"y":380,"w":1120,"h":60,"text":"Cambridge-style practice","fontSize":30,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e003","type":"icon","x":590,"y":120,"w":100,"h":100,"icon":"book-open","color":"#ea580c"}]},{"id":"p012","background":"#ffffff","elements":[{"id":"e005","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"Look and read. Choose the right answer.","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#ea580c","fill":"transparent"},{"id":"e006","type":"shape","x":60,"y":130,"w":460,"h":460,"shape":"rect","fill":"#f1f5f9","stroke":"transparent","strokeWidth":0,"radius":24},{"id":"e007","type":"icon","x":210,"y":280,"w":160,"h":160,"icon":"image","color":"#cbd5e1"},{"id":"e008","type":"text","x":80,"y":520,"w":420,"h":50,"text":"Add a picture with the Image tool.","fontSize":18,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"center","color":"#64748b","fill":"transparent"},{"id":"e009","type":"question","x":560,"y":130,"w":660,"h":220,"questionType":"multiple_choice","prompt":"The children are playing in the…","options":["park","kitchen","classroom"],"correct":[0],"answers":[],"explanation":"","fontSize":24,"color":"#1f2937","fill":"#ffffff"},{"id":"e010","type":"question","x":560,"y":370,"w":660,"h":200,"questionType":"true_false","prompt":"There are three dogs in the picture.","options":["True","False"],"correct":[1],"answers":[],"explanation":"","fontSize":22,"color":"#1f2937","fill":"#ffffff"},{"id":"e011","type":"button","x":1000,"y":610,"w":220,"h":64,"label":"Next","action":"next","target":null,"fill":"#ea580c","color":"#ffffff","fontSize":24}]},{"id":"p016","background":"#ffffff","elements":[{"id":"e013","type":"text","x":60,"y":40,"w":1160,"h":70,"text":"Read and write one word.","fontSize":44,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#ea580c","fill":"transparent"},{"id":"e014","type":"question","x":60,"y":140,"w":560,"h":220,"questionType":"short_answer","prompt":"You wear these on your feet: s _ _ _ s","options":[],"correct":[],"answers":["shoes","socks"],"explanation":"","fontSize":22,"color":"#1f2937","fill":"#ffffff"},{"id":"e015","type":"question","x":660,"y":140,"w":560,"h":220,"questionType":"short_answer","prompt":"This animal says \"moo\": c _ w","options":[],"correct":[],"answers":["cow"],"explanation":"","fontSize":22,"color":"#1f2937","fill":"#ffffff"}]}]}'::jsonb, 8),
  ('review-exit-ticket', 'review', 'exit_ticket', '3-2-1 exit ticket', 'Three things learned, two questions, one thing to practise — plus a quick check question.',
   '{"pageSize":"a4_landscape","pages":[{"id":"p028","background":"#ffffff","elements":[{"id":"e001","type":"text","x":50,"y":36,"w":1023,"h":60,"text":"Exit ticket","fontSize":40,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e002","type":"text","x":50,"y":96,"w":1023,"h":34,"text":"Name: ____________________   Date: ____________","fontSize":18,"fontFamily":"sans","bold":false,"italic":false,"underline":false,"align":"left","color":"#64748b","fill":"transparent"},{"id":"e003","type":"shape","x":40,"y":150,"w":340,"h":440,"shape":"rect","fill":"#e0f2fe","stroke":"transparent","strokeWidth":0,"radius":16},{"id":"e004","type":"text","x":60,"y":165,"w":300,"h":50,"text":"3 things I learned","fontSize":24,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#1e3a5f","fill":"transparent"},{"id":"e005","type":"shape","x":60,"y":250,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e006","type":"shape","x":60,"y":305,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e007","type":"shape","x":60,"y":360,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e008","type":"shape","x":60,"y":415,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e009","type":"shape","x":60,"y":470,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e010","type":"shape","x":60,"y":525,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e011","type":"shape","x":392,"y":150,"w":340,"h":440,"shape":"rect","fill":"#ecfdf5","stroke":"transparent","strokeWidth":0,"radius":16},{"id":"e012","type":"text","x":412,"y":165,"w":300,"h":50,"text":"2 questions I have","fontSize":24,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#0f766e","fill":"transparent"},{"id":"e013","type":"shape","x":412,"y":250,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e014","type":"shape","x":412,"y":305,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e015","type":"shape","x":412,"y":360,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e016","type":"shape","x":412,"y":415,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e017","type":"shape","x":412,"y":470,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e018","type":"shape","x":412,"y":525,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e019","type":"shape","x":744,"y":150,"w":340,"h":440,"shape":"rect","fill":"#fef3c7","stroke":"transparent","strokeWidth":0,"radius":16},{"id":"e020","type":"text","x":764,"y":165,"w":300,"h":50,"text":"1 thing to practise","fontSize":24,"fontFamily":"sans","bold":true,"italic":false,"underline":false,"align":"left","color":"#92400e","fill":"transparent"},{"id":"e021","type":"shape","x":764,"y":250,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e022","type":"shape","x":764,"y":305,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e023","type":"shape","x":764,"y":360,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e024","type":"shape","x":764,"y":415,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e025","type":"shape","x":764,"y":470,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e026","type":"shape","x":764,"y":525,"w":300,"h":2,"shape":"line","fill":"transparent","stroke":"#cbd5e1","strokeWidth":2,"radius":0},{"id":"e027","type":"question","x":40,"y":610,"w":1044,"h":150,"questionType":"multiple_choice","prompt":"Quick check: which sentence is correct?","options":["I didn''t went home.","I didn''t go home.","I not go home."],"correct":[1],"answers":[],"explanation":"","fontSize":18,"color":"#1f2937","fill":"#ffffff"}]}]}'::jsonb, 9);
