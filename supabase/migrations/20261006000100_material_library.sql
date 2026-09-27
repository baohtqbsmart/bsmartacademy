-- =============================================================================
-- Learning Material Library.
--
-- One central library of files (PDF, Word, PowerPoint, images, audio, video):
--
--   library_folders            personal folders (a teacher's own) and academy
--                              folders (managed by admins); nestable
--   library_materials          one file each, with its catalogue data and who
--                              may see it:
--                                scope      personal (the author's) | academy (admins')
--                                visibility private (manager only) | staff (all teachers)
--   library_material_classes   the material is assigned to a class — reuse the
--                              same material in any number of classes
--   library_material_students  the material is shared with one student
--   library_favorites          each user's starred materials
--
-- Students (and their parents) only ever see materials assigned to their
-- classes or shared with them; archived materials disappear for them.
-- Files live in assignment-files/library/<uploader>/<random>.<ext> and are
-- readable only by people who can read the material row.
-- =============================================================================

insert into public.permissions (code, description) values
  ('library.read',  'Open learning materials'),
  ('library.write', 'Upload and manage learning materials');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'library.read',  'all'),
  ('super_admin', 'library.write', 'all'),
  ('admin',       'library.read',  'all'),
  ('admin',       'library.write', 'all'),
  ('teacher',     'library.read',  'assigned'),
  ('teacher',     'library.write', 'own'),
  ('student',     'library.read',  'own'),
  ('parent',      'library.read',  'children');

create type public.library_scope as enum ('personal', 'academy');
create type public.library_visibility as enum ('private', 'staff');

-- Accepted library file types (a subset of public.upload_file_types).
create or replace function private.is_library_file_type(mime text)
returns boolean language sql immutable set search_path = '' as $$
  select mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) or mime ~ '^(image|audio|video)/';
$$;

-- -----------------------------------------------------------------------------
-- Folders
-- -----------------------------------------------------------------------------
create table public.library_folders (
  id         uuid primary key default gen_random_uuid(),
  scope      public.library_scope not null,
  owner_id   uuid references public.profiles (id) on delete cascade,
  parent_id  uuid references public.library_folders (id) on delete cascade,
  name       text not null check (btrim(name) <> '' and char_length(name) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Personal folders belong to someone; academy folders to nobody.
  check ((scope = 'personal') = (owner_id is not null))
);

create unique index library_folders_unique_name on public.library_folders
  (scope, coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
create index library_folders_parent_idx on public.library_folders (parent_id);

create trigger library_folders_set_updated_at before update on public.library_folders
  for each row execute function private.set_updated_at();

create or replace function private.can_manage_library(target_scope public.library_scope, owner uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('library.write', 'all')
    or (target_scope = 'personal' and owner = (select auth.uid()) and private.has_permission('library.write', 'own'));
$$;

create or replace function private.prepare_library_folder()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.library_folders;
  depth integer := 1;
  cursor_id uuid;
begin
  if tg_op = 'INSERT' then
    new.owner_id := case when new.scope = 'personal' then coalesce((select auth.uid()), new.owner_id) end;
  else
    new.scope := old.scope;
    new.owner_id := old.owner_id;
  end if;
  new.name := btrim(new.name);
  if new.parent_id is not null then
    select * into parent from public.library_folders where id = new.parent_id;
    if not found or parent.scope <> new.scope or parent.owner_id is distinct from new.owner_id then
      raise exception 'A folder can only be inside a folder of the same library.' using errcode = '22023';
    end if;
    -- No cycles, at most five levels.
    cursor_id := new.parent_id;
    while cursor_id is not null loop
      if cursor_id = new.id then
        raise exception 'A folder cannot be moved inside itself.' using errcode = '22023';
      end if;
      depth := depth + 1;
      if depth > 5 then
        raise exception 'Folders can be nested at most five levels deep.' using errcode = '22023';
      end if;
      select parent_id into cursor_id from public.library_folders where id = cursor_id;
    end loop;
  end if;
  return new;
end;
$$;

create trigger library_folders_prepare before insert or update on public.library_folders
  for each row execute function private.prepare_library_folder();

-- -----------------------------------------------------------------------------
-- Materials
-- -----------------------------------------------------------------------------
create table public.library_materials (
  id           uuid primary key default gen_random_uuid(),
  scope        public.library_scope not null default 'personal',
  owner_id     uuid not null references public.profiles (id) on delete restrict,
  owner_name   text not null default '',
  folder_id    uuid references public.library_folders (id) on delete set null,
  title        text not null check (btrim(title) <> '' and char_length(title) <= 200),
  description  text not null default '' check (char_length(description) <= 2000),
  subject_id   uuid references public.subjects (id) on delete set null,
  level_id     uuid references public.levels (id) on delete set null,
  skill        public.assignment_skill,
  topic        text check (char_length(topic) <= 120),
  tags         text[] not null default '{}' check (cardinality(tags) <= 10),
  visibility   public.library_visibility not null default 'private',
  object_path  text not null unique,
  file_name    text not null,
  mime_type    text not null references public.upload_file_types (mime_type),
  size_bytes   bigint not null check (size_bytes between 1 and 20971520),
  file_kind    text generated always as (
    case
      when mime_type = 'application/pdf' then 'pdf'
      when mime_type like '%wordprocessingml%' then 'document'
      when mime_type like '%presentationml%' then 'presentation'
      else split_part(mime_type, '/', 1)
    end
  ) stored,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.library_materials.visibility is
  '"private": only who manages it (and students it is assigned/shared to); "staff": every teacher can find and reuse it.';

create index library_materials_owner_idx on public.library_materials (owner_id, created_at desc);
create index library_materials_folder_idx on public.library_materials (folder_id);
create index library_materials_tags_idx on public.library_materials using gin (tags);

create trigger library_materials_set_updated_at before update on public.library_materials
  for each row execute function private.set_updated_at();

create or replace function private.prepare_library_material()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  folder public.library_folders;
begin
  if tg_op = 'INSERT' then
    new.owner_id := coalesce((select auth.uid()), new.owner_id);
    new.archived_at := null;
    if not private.is_library_file_type(new.mime_type) then
      raise exception 'The library accepts PDF, Word, PowerPoint, images, audio and video.' using errcode = '22023';
    end if;
    -- The file must be the uploader's own, just uploaded, and match its record.
    perform private.validate_upload(new.object_path, 'library/' || new.owner_id, new.file_name, new.mime_type, new.size_bytes);
  else
    new.scope := old.scope;
    new.owner_id := old.owner_id;
    new.object_path := old.object_path;
    new.file_name := old.file_name;
    new.mime_type := old.mime_type;
    new.size_bytes := old.size_bytes;
    new.created_at := old.created_at;
  end if;
  new.owner_name := coalesce((select full_name from public.profiles where id = new.owner_id), '');
  new.title := btrim(new.title);
  new.topic := nullif(btrim(new.topic), '');
  -- Tags: trimmed, lower-case, unique, short.
  new.tags := coalesce((
    select array_agg(distinct t order by t)
    from (select lower(btrim(x)) as t from unnest(new.tags) x) s
    where t <> ''
  ), '{}');
  if exists (select 1 from unnest(new.tags) t where char_length(t) > 40) then
    raise exception 'Tags are at most 40 characters.' using errcode = '22023';
  end if;

  if new.folder_id is not null then
    select * into folder from public.library_folders where id = new.folder_id;
    if not found or folder.scope <> new.scope or (new.scope = 'personal' and folder.owner_id <> new.owner_id) then
      raise exception 'Choose a folder in the same library.' using errcode = '22023';
    end if;
  end if;
  if new.level_id is not null and not exists (
    select 1 from public.levels l where l.id = new.level_id and (new.subject_id is null or l.subject_id = new.subject_id)
  ) then
    raise exception 'The level must belong to the chosen subject.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger library_materials_prepare before insert or update on public.library_materials
  for each row execute function private.prepare_library_material();

-- -----------------------------------------------------------------------------
-- Assignments to classes, shares with students, favourites
-- -----------------------------------------------------------------------------
create table public.library_material_classes (
  material_id    uuid not null references public.library_materials (id) on delete cascade,
  class_id       uuid not null references public.classes (id) on delete cascade,
  shared_by      uuid references public.profiles (id) on delete set null,
  shared_by_name text not null default '',
  created_at     timestamptz not null default now(),
  primary key (material_id, class_id)
);

create index library_material_classes_class_idx on public.library_material_classes (class_id);

create table public.library_material_students (
  material_id    uuid not null references public.library_materials (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  shared_by      uuid references public.profiles (id) on delete set null,
  shared_by_name text not null default '',
  created_at     timestamptz not null default now(),
  primary key (material_id, student_id)
);

create index library_material_students_student_idx on public.library_material_students (student_id);

create table public.library_favorites (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  material_id uuid not null references public.library_materials (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, material_id)
);

-- -----------------------------------------------------------------------------
-- Who can read a material (security definer: used by RLS and Storage)
-- -----------------------------------------------------------------------------
create or replace function private.library_assigned_to_me(target_material_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
      select 1 from public.library_material_classes mc
      where mc.material_id = target_material_id
        and (private.is_class_student(mc.class_id)
             or (private.has_permission('library.read', 'children') and private.is_class_of_child(mc.class_id)))
    )
    or exists (
      select 1 from public.library_material_students ms
      where ms.material_id = target_material_id
        and (ms.student_id = private.current_student_id()
             or (private.has_permission('library.read', 'children') and private.is_parent_of(ms.student_id)))
    );
$$;

-- Teachers also see materials assigned to classes they teach (co-teachers).
create or replace function private.library_in_my_classes(target_material_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.library_material_classes mc
    where mc.material_id = target_material_id and private.is_class_teacher(mc.class_id)
  );
$$;

create or replace function private.can_read_library_material(m public.library_materials)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_permission('library.read', 'all')
    or m.owner_id = (select auth.uid())
    or (m.archived_at is null and (
      (private.has_permission('library.read', 'assigned') and (m.visibility = 'staff' or private.library_in_my_classes(m.id)))
      or ((private.has_permission('library.read', 'own') or private.has_permission('library.read', 'children'))
          and private.library_assigned_to_me(m.id))
    ));
$$;

-- Assigning or sharing needs the right to use the material: its manager, or
-- any teacher when it is visible to staff. Never archived ones.
create or replace function private.can_distribute_library_material(target_material_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.library_materials m
    where m.id = target_material_id
      and m.archived_at is null
      and (private.can_manage_library(m.scope, m.owner_id)
           or (m.visibility = 'staff' and private.has_permission('library.read', 'assigned')))
  );
$$;

create or replace function private.stamp_library_share()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.shared_by := (select auth.uid());
  new.shared_by_name := coalesce((select full_name from public.profiles where id = (select auth.uid())), '');
  return new;
end;
$$;

create trigger library_material_classes_stamp before insert on public.library_material_classes
  for each row execute function private.stamp_library_share();
create trigger library_material_students_stamp before insert on public.library_material_students
  for each row execute function private.stamp_library_share();

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------
alter table public.library_folders enable row level security;
alter table public.library_materials enable row level security;
alter table public.library_material_classes enable row level security;
alter table public.library_material_students enable row level security;
alter table public.library_favorites enable row level security;

-- Folders are for staff: own personal folders, and the academy folders.
create policy library_folders_select on public.library_folders for select to authenticated using (
  (select private.has_permission('library.read', 'all'))
  or (scope = 'personal' and owner_id = (select auth.uid()))
  or (scope = 'academy' and (select private.has_permission('library.read', 'assigned')))
);
create policy library_folders_insert on public.library_folders for insert to authenticated
  with check (private.can_manage_library(scope, owner_id));
create policy library_folders_update on public.library_folders for update to authenticated
  using (private.can_manage_library(scope, owner_id)) with check (private.can_manage_library(scope, owner_id));
create policy library_folders_delete on public.library_folders for delete to authenticated
  using (private.can_manage_library(scope, owner_id));

create policy library_materials_select on public.library_materials for select to authenticated
  using (private.can_read_library_material(library_materials));
create policy library_materials_insert on public.library_materials for insert to authenticated
  with check (owner_id = (select auth.uid()) and private.can_manage_library(scope, owner_id));
create policy library_materials_update on public.library_materials for update to authenticated
  using (private.can_manage_library(scope, owner_id)) with check (private.can_manage_library(scope, owner_id));
create policy library_materials_delete on public.library_materials for delete to authenticated
  using (private.can_manage_library(scope, owner_id));

-- Assignment rows: the material's manager, the class's teachers, and the
-- class's own students/parents (never other classes' rows).
create policy library_material_classes_select on public.library_material_classes for select to authenticated using (
  (select private.has_permission('library.read', 'all'))
  or private.is_class_teacher(class_id)
  or private.is_class_student(class_id)
  or private.is_class_of_child(class_id)
  or exists (select 1 from public.library_materials m where m.id = material_id and private.can_manage_library(m.scope, m.owner_id))
);
create policy library_material_classes_insert on public.library_material_classes for insert to authenticated with check (
  private.can_distribute_library_material(material_id)
  and ((select private.has_permission('library.write', 'all')) or private.is_class_teacher(class_id))
);
create policy library_material_classes_delete on public.library_material_classes for delete to authenticated using (
  (select private.has_permission('library.write', 'all'))
  or private.is_class_teacher(class_id)
  or exists (select 1 from public.library_materials m where m.id = material_id and private.can_manage_library(m.scope, m.owner_id))
);

create policy library_material_students_select on public.library_material_students for select to authenticated using (
  (select private.has_permission('library.read', 'all'))
  or student_id = private.current_student_id()
  or private.is_parent_of(student_id)
  or private.teaches_student(student_id)
  or exists (select 1 from public.library_materials m where m.id = material_id and private.can_manage_library(m.scope, m.owner_id))
);
create policy library_material_students_insert on public.library_material_students for insert to authenticated with check (
  private.can_distribute_library_material(material_id)
  and ((select private.has_permission('library.write', 'all')) or private.teaches_student(student_id))
);
create policy library_material_students_delete on public.library_material_students for delete to authenticated using (
  (select private.has_permission('library.write', 'all'))
  or shared_by = (select auth.uid())
  or exists (select 1 from public.library_materials m where m.id = material_id and private.can_manage_library(m.scope, m.owner_id))
);

create policy library_favorites_own on public.library_favorites for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.library_materials m where m.id = material_id));

-- Clients never set the owner, scope-changing fields or the file after upload.
revoke insert, update on public.library_materials from authenticated;
grant insert (scope, folder_id, title, description, subject_id, level_id, skill, topic, tags, visibility, object_path, file_name, mime_type, size_bytes)
  on public.library_materials to authenticated;
grant update (folder_id, title, description, subject_id, level_id, skill, topic, tags, visibility, archived_at)
  on public.library_materials to authenticated;
revoke update on public.library_material_classes, public.library_material_students from authenticated;
revoke all on public.library_folders, public.library_materials, public.library_material_classes,
  public.library_material_students, public.library_favorites from anon;

-- -----------------------------------------------------------------------------
-- Storage: assignment-files/library/<uploader>/<uuid>.<ext>
-- -----------------------------------------------------------------------------
create or replace function private.can_read_library_file(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.library_materials m
    where m.object_path = object_name and private.can_read_library_material(m)
  );
$$;

create or replace function private.can_delete_library_file(object_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.library_materials m
    where m.object_path = object_name and private.can_manage_library(m.scope, m.owner_id)
  );
$$;

create policy library_files_select on storage.objects for select to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'library'
  and (
    -- The uploader, before and after the record exists.
    ((storage.foldername(name))[2] = (select auth.uid())::text and (select private.has_any_permission('library.write')))
    or private.can_read_library_file(name)
  )
);
create policy library_files_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'assignment-files'
  and private.is_allowed_upload_name(name)
  and (storage.foldername(name))[1] = 'library'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and (select private.has_any_permission('library.write'))
);
create policy library_files_delete on storage.objects for delete to authenticated using (
  bucket_id = 'assignment-files'
  and (storage.foldername(name))[1] = 'library'
  and (
    ((storage.foldername(name))[2] = (select auth.uid())::text and not exists (
      select 1 from public.library_materials m where m.object_path = name
    ))
    or private.can_delete_library_file(name)
  )
);

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
