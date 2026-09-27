-- =============================================================================
-- Production-readiness audit: rate limits on person-to-person communication.
--
-- Supabase Auth already limits sign-in attempts and e-mails per IP, and the AI
-- assistant has its own quota. Messages and announcements notify other people,
-- so a compromised or misbehaving account could flood families; these limits
-- are generous for normal use and enforced in the database, whatever client
-- is used.
-- =============================================================================

create or replace function private.limit_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.messages where sender_id = (select auth.uid()) and created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'You are sending messages very quickly. Please wait a few minutes.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger messages_rate_limit before insert on public.messages
  for each row execute function private.limit_messages();

create or replace function private.limit_threads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.message_threads where created_by = (select auth.uid()) and created_at > now() - interval '1 day') >= 30 then
    raise exception 'You have started many conversations today. Please continue an existing one or try again tomorrow.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger message_threads_rate_limit before insert on public.message_threads
  for each row execute function private.limit_threads();

create or replace function private.limit_announcements()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('announcements.write', 'all')
     and (select count(*) from public.announcements where created_by = (select auth.uid()) and created_at > now() - interval '1 day') >= 20 then
    raise exception 'You have published 20 announcements today. Please try again tomorrow.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger announcements_rate_limit before insert on public.announcements
  for each row execute function private.limit_announcements();

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
