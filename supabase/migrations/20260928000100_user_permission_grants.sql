-- =============================================================================
-- Per-user permission grants.
--
-- Roles give everyone in a role the same permissions. Some access must be
-- granted to an individual instead (e.g. finance access for one teacher who
-- also handles fees). A grant adds a permission at a scope to one account; the
-- effective permissions are role permissions UNION user grants.
--
-- Anti-escalation: a grant can only be made by someone who may manage the
-- target account (rank rules) and who holds that permission at that scope.
-- =============================================================================

create table public.user_permissions (
  profile_id      uuid not null references public.profiles (id) on delete cascade,
  permission_code text not null references public.permissions (code) on update cascade on delete cascade,
  scope           public.permission_scope not null default 'all',
  granted_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (profile_id, permission_code, scope)
);

create index user_permissions_permission_idx on public.user_permissions (permission_code);

-- Effective permission check (replaces the role-only version).
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
    where p.id = (select auth.uid())
      and p.is_active
      and (
        exists (
          select 1 from public.role_permissions rp
          where rp.role_code = p.role_code
            and rp.permission_code = required_permission
            and rp.scope = required_scope
        )
        or exists (
          select 1 from public.user_permissions up
          where up.profile_id = p.id
            and up.permission_code = required_permission
            and up.scope = required_scope
        )
      )
  );
$$;

create or replace function private.has_any_permission(required_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active
      and (
        exists (select 1 from public.role_permissions rp
                where rp.role_code = p.role_code and rp.permission_code = required_permission)
        or exists (select 1 from public.user_permissions up
                   where up.profile_id = p.id and up.permission_code = required_permission)
      )
  );
$$;

create or replace function public.my_permissions()
returns table (permission_code text, scope public.permission_scope)
language sql
stable
security definer
set search_path = ''
as $$
  select grants.permission_code, grants.scope
  from public.profiles p
  cross join lateral (
    select rp.permission_code, rp.scope from public.role_permissions rp where rp.role_code = p.role_code
    union
    select up.permission_code, up.scope from public.user_permissions up where up.profile_id = p.id
  ) grants
  where p.id = (select auth.uid()) and p.is_active
  order by grants.permission_code, grants.scope;
$$;

create or replace function public.grant_user_permission(
  target_user_id uuid,
  target_permission text,
  target_scope public.permission_scope default 'all'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_manage_user(target_user_id);
  if not exists (select 1 from public.permissions where code = target_permission) then
    raise exception 'Unknown permission.' using errcode = '22023';
  end if;
  if not private.has_permission(target_permission, target_scope) then
    raise exception 'You can only grant permissions you hold yourself.' using errcode = '42501';
  end if;

  insert into public.user_permissions (profile_id, permission_code, scope, granted_by)
  values (target_user_id, target_permission, target_scope, (select auth.uid()))
  on conflict do nothing;
end;
$$;

create or replace function public.revoke_user_permission(
  target_user_id uuid,
  target_permission text,
  target_scope public.permission_scope default 'all'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_manage_user(target_user_id);
  delete from public.user_permissions
  where profile_id = target_user_id and permission_code = target_permission and scope = target_scope;
end;
$$;

revoke all on function public.grant_user_permission(uuid, text, public.permission_scope) from public, anon;
revoke all on function public.revoke_user_permission(uuid, text, public.permission_scope) from public, anon;
grant execute on function public.grant_user_permission(uuid, text, public.permission_scope) to authenticated;
grant execute on function public.revoke_user_permission(uuid, text, public.permission_scope) to authenticated;

alter table public.user_permissions enable row level security;

-- Users see their own grants; account managers see everyone's. Writes only
-- through the functions above.
create policy user_permissions_select on public.user_permissions for select to authenticated using (
  profile_id = (select auth.uid()) or (select private.has_permission('users.read'))
);

revoke all on public.user_permissions from anon;
revoke insert, update, delete on public.user_permissions from authenticated;
