-- =============================================================================
-- Foundation: identity and role-based access control.
--
--   auth.users            Supabase Auth accounts ("users")
--   public.profiles       one row per auth user; carries the user's role
--   public.roles          the five roles, ranked by privilege
--   public.permissions    "<module>.<action>" capabilities
--   public.role_permissions  the permission matrix, with a row scope per grant
--
-- RLS policies in later migrations call private.has_permission(code, scope),
-- so the matrix stored here is what the database actually enforces.
-- =============================================================================

-- Helpers that must not be callable through the Data API live in "private".
create schema if not exists private;
grant usage on schema private to authenticated;

-- -----------------------------------------------------------------------------
-- Shared trigger: keep updated_at current
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Roles
-- -----------------------------------------------------------------------------
create table public.roles (
  code        text primary key check (code ~ '^[a-z][a-z_]*$'),
  name        text not null,
  description text not null default '',
  rank        smallint not null unique check (rank > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on column public.roles.rank is
  'Privilege order. Users may only manage accounts and assign roles ranked below their own; super_admin is exempt.';

create trigger roles_set_updated_at
  before update on public.roles
  for each row execute function private.set_updated_at();

insert into public.roles (code, name, description, rank) values
  ('super_admin', 'Super administrator', 'Full access, including the permission matrix.', 100),
  ('admin',       'Administrator',       'Runs academy operations: people, courses, classes and enrolment.', 80),
  ('teacher',     'Teacher',             'Teaches assigned classes and their students.', 50),
  ('parent',      'Parent',              'Follows their own children.', 20),
  ('student',     'Student',             'Accesses their own classes and learning.', 10);

-- -----------------------------------------------------------------------------
-- Permissions and the permission matrix
-- -----------------------------------------------------------------------------
create type public.permission_scope as enum ('all', 'assigned', 'own', 'children');

comment on type public.permission_scope is
  'all: every row. assigned: rows linked to classes the user teaches. own: the user''s own rows and own classes. children: rows linked to the user''s children.';

create table public.permissions (
  code        text primary key check (code ~ '^[a-z_]+\.[a-z_]+$'),
  module      text generated always as (split_part(code, '.', 1)) stored,
  description text not null,
  created_at  timestamptz not null default now()
);

create table public.role_permissions (
  role_code       text not null references public.roles (code) on update cascade on delete cascade,
  permission_code text not null references public.permissions (code) on update cascade on delete cascade,
  scope           public.permission_scope not null default 'all',
  created_at      timestamptz not null default now(),
  primary key (role_code, permission_code, scope)
);

create index role_permissions_permission_idx on public.role_permissions (permission_code);

insert into public.permissions (code, description) values
  ('users.read',         'View all user accounts'),
  ('users.manage',       'Change user roles and activation'),
  ('roles.manage',       'Edit roles and the permission matrix'),
  ('students.read',      'View students'),
  ('students.write',     'Create, edit and archive students'),
  ('students.delete',    'Permanently delete students'),
  ('parents.read',       'View parents'),
  ('parents.write',      'Create, edit and archive parents'),
  ('parents.delete',     'Permanently delete parents'),
  ('teachers.read',      'View teachers'),
  ('teachers.write',     'Create, edit and archive teachers'),
  ('teachers.delete',    'Permanently delete teachers'),
  ('courses.read',       'View subjects, levels and courses'),
  ('courses.write',      'Create, edit and archive subjects, levels and courses'),
  ('courses.delete',     'Permanently delete subjects, levels and courses'),
  ('classes.read',       'View classes and their teachers'),
  ('classes.write',      'Create, edit and archive classes; assign teachers'),
  ('classes.delete',     'Permanently delete classes'),
  ('enrollments.read',   'View enrolments'),
  ('enrollments.write',  'Enrol, update and withdraw students'),
  ('enrollments.delete', 'Permanently delete enrolments');

-- Super administrators hold every permission.
insert into public.role_permissions (role_code, permission_code, scope)
select 'super_admin', code, 'all' from public.permissions;

insert into public.role_permissions (role_code, permission_code, scope) values
  -- Administrators: day-to-day operations, no hard deletes, no matrix edits.
  ('admin', 'users.read',        'all'),
  ('admin', 'users.manage',      'all'),
  ('admin', 'students.read',     'all'),
  ('admin', 'students.write',    'all'),
  ('admin', 'parents.read',      'all'),
  ('admin', 'parents.write',     'all'),
  ('admin', 'teachers.read',     'all'),
  ('admin', 'teachers.write',    'all'),
  ('admin', 'courses.read',      'all'),
  ('admin', 'courses.write',     'all'),
  ('admin', 'classes.read',      'all'),
  ('admin', 'classes.write',     'all'),
  ('admin', 'enrollments.read',  'all'),
  ('admin', 'enrollments.write', 'all'),
  -- Teachers: only what is linked to the classes they teach.
  ('teacher', 'students.read',    'assigned'),
  ('teacher', 'parents.read',     'assigned'),
  ('teacher', 'teachers.read',    'own'),
  ('teacher', 'courses.read',     'all'),
  ('teacher', 'classes.read',     'assigned'),
  ('teacher', 'enrollments.read', 'assigned'),
  -- Students: themselves and their own classes.
  ('student', 'students.read',    'own'),
  ('student', 'teachers.read',    'own'),
  ('student', 'courses.read',     'all'),
  ('student', 'classes.read',     'own'),
  ('student', 'enrollments.read', 'own'),
  -- Parents: themselves and their own children.
  ('parent', 'students.read',    'children'),
  ('parent', 'parents.read',     'own'),
  ('parent', 'teachers.read',    'children'),
  ('parent', 'courses.read',     'all'),
  ('parent', 'classes.read',     'children'),
  ('parent', 'enrollments.read', 'children');

-- -----------------------------------------------------------------------------
-- Profiles
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role_code   text not null default 'student' references public.roles (code) on update cascade,
  email       text not null,
  full_name   text not null default '',
  phone       text,
  avatar_path text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

comment on table public.profiles is
  'Application profile for every auth user. role_code and is_active change only through set_user_role / set_user_active.';
comment on column public.profiles.is_active is
  'Deactivated accounts keep their data but lose every permission.';

create index profiles_role_code_idx on public.profiles (role_code);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Profile creation on sign-up/invite. The role comes from app_metadata, which
-- only the service role can write, so users can never pick their own role.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role_code)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_app_meta_data ->> 'role', 'student')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

create or replace function private.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function private.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Authorization helpers (security definer: they read profiles/matrix without
-- being subject to RLS, which also prevents policy recursion)
-- -----------------------------------------------------------------------------
create or replace function private.current_role_code()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role_code from public.profiles where id = (select auth.uid()) and is_active;
$$;

create or replace function private.has_permission(
  required_permission text,
  required_scope public.permission_scope default 'all'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_code = p.role_code
    where p.id = (select auth.uid())
      and p.is_active
      and rp.permission_code = required_permission
      and rp.scope = required_scope
  );
$$;

-- Raises unless the caller may manage the target account (and, optionally,
-- assign new_role_code). Non-super-admins can only act on lower-ranked users.
create or replace function private.assert_can_manage_user(target_user_id uuid, new_role_code text default null)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller_role text := private.current_role_code();
  caller_rank smallint;
  target_rank smallint;
  new_rank    smallint;
begin
  if not private.has_permission('users.manage') then
    raise exception 'You do not have permission to manage users.' using errcode = '42501';
  end if;

  if target_user_id = (select auth.uid()) then
    raise exception 'You cannot change your own account.' using errcode = '42501';
  end if;

  select r.rank into caller_rank from public.roles r where r.code = caller_role;

  select r.rank into target_rank
  from public.profiles p join public.roles r on r.code = p.role_code
  where p.id = target_user_id;
  if not found then
    raise exception 'User not found.' using errcode = 'P0002';
  end if;

  if new_role_code is not null then
    select r.rank into new_rank from public.roles r where r.code = new_role_code;
    if not found then
      raise exception 'Unknown role.' using errcode = '22023';
    end if;
  end if;

  if caller_role <> 'super_admin'
     and (target_rank >= caller_rank or coalesce(new_rank, 0) >= caller_rank) then
    raise exception 'You can only manage users with a lower role than your own.' using errcode = '42501';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Public RPCs (exposed through the Data API)
-- -----------------------------------------------------------------------------

-- The caller's effective permissions; the app loads these once per request.
create or replace function public.my_permissions()
returns table (permission_code text, scope public.permission_scope)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.permission_code, rp.scope
  from public.profiles p
  join public.role_permissions rp on rp.role_code = p.role_code
  where p.id = (select auth.uid()) and p.is_active
  order by rp.permission_code, rp.scope;
$$;

create or replace function public.set_user_role(target_user_id uuid, new_role_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_manage_user(target_user_id, new_role_code);
  update public.profiles set role_code = new_role_code where id = target_user_id;
end;
$$;

create or replace function public.set_user_active(target_user_id uuid, active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_manage_user(target_user_id);
  update public.profiles set is_active = active where id = target_user_id;
end;
$$;

revoke all on function public.my_permissions() from public, anon;
revoke all on function public.set_user_role(uuid, text) from public, anon;
revoke all on function public.set_user_active(uuid, boolean) from public, anon;
grant execute on function public.my_permissions() to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;
grant execute on function public.set_user_active(uuid, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Row level security: RBAC tables and profiles
-- -----------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;

-- The matrix is not secret: every signed-in user may read it.
create policy roles_select on public.roles for select to authenticated using (true);
create policy permissions_select on public.permissions for select to authenticated using (true);
create policy role_permissions_select on public.role_permissions for select to authenticated using (true);

create policy roles_write on public.roles for all to authenticated
  using ((select private.has_permission('roles.manage')))
  with check ((select private.has_permission('roles.manage')));
create policy permissions_write on public.permissions for all to authenticated
  using ((select private.has_permission('roles.manage')))
  with check ((select private.has_permission('roles.manage')));
create policy role_permissions_write on public.role_permissions for all to authenticated
  using ((select private.has_permission('roles.manage')))
  with check ((select private.has_permission('roles.manage')));

create policy profiles_select_own on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_select_all on public.profiles for select to authenticated
  using ((select private.has_permission('users.read')));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Column-level guard: users edit only personal fields; role_code, is_active
-- and email change exclusively through the functions/triggers above.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: avatars (private bucket, one folder per user: "<user_id>/...")
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text
         or (select private.has_permission('users.read')))
  );

create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatars_delete_own on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
