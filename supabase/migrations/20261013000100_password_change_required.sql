-- =============================================================================
-- Required password change
--
-- Accounts that staff create with a default password are flagged; the app
-- sends a flagged user to /auth/set-password before anything else. Only Auth
-- clears the flag, when the password actually changes, so a user cannot skip
-- the step by editing their profile (the column is not in the update grant).
-- =============================================================================

alter table public.profiles
  add column must_change_password boolean not null default false;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role_code, must_change_password)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_app_meta_data ->> 'role', 'student'),
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end;
$$;

create or replace function private.handle_user_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set must_change_password = false where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_password_changed
  after update of encrypted_password on auth.users
  for each row when (old.encrypted_password is distinct from new.encrypted_password)
  execute function private.handle_user_password_change();
