-- =============================================================================
-- Website members, comments, dictionary and the audit log
--
-- * Anyone can sign up on the website. New accounts become "member": they read
--   public lessons in full, comment and use the dictionary, and nothing else.
--   Staff still create students, parents and teachers with an explicit role
--   (or promote a member in Users & roles).
-- * The audit log records important actions; it is append-only (written by
--   triggers, readable by administrators, never updated or deleted).
-- =============================================================================

insert into public.roles (code, name, description, rank) values
  ('member', 'Member', 'Signed up on the website: public lessons, comments and the dictionary.', 5);

insert into public.permissions (code, description) values
  ('dictionary.read', 'Look up words in the academy dictionary'),
  ('comments.write',  'Comment on public lessons and articles'),
  ('audit.read',      'Read the audit log');

insert into public.role_permissions (role_code, permission_code, scope)
select r.code, p.code, 'all'
from public.roles r
cross join (values ('dictionary.read'), ('comments.write')) as p (code);

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'audit.read', 'all'),
  ('admin', 'audit.read', 'all');

-- New accounts start as members unless staff set a role when creating them.
-- (raw_app_meta_data cannot be written by the person signing up.)
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
    coalesce(new.raw_app_meta_data ->> 'role', 'member'),
    coalesce((new.raw_app_meta_data ->> 'must_change_password')::boolean, false)
  );
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Signed-in readers see preview lessons in full (the reason to sign up);
-- visitors still get the beginning only.
-- -----------------------------------------------------------------------------
create or replace function public.public_lesson(target_slug text)
returns table (
  id uuid,
  slug text,
  title text,
  skill public.english_skill,
  cefr_level public.cefr_level,
  topic text,
  summary text,
  access public.public_access,
  body text,
  body_truncated boolean,
  form text,
  usage text,
  examples text[],
  common_mistakes jsonb,
  media_path text,
  author_name text,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with lesson as (
    select l.*, (l.public_access = 'public' or (select auth.uid()) is not null) as full_view
    from public.lessons l
    where l.slug = target_slug and l.status = 'published' and l.public_access <> 'members'
  )
  select l.id, l.slug, l.title, l.skill, l.cefr_level, l.topic, l.summary, l.public_access,
         case when l.full_view then l.body else private.preview_text(l.body) end,
         not l.full_view and coalesce(private.preview_text(l.body), '') is distinct from coalesce(l.body, ''),
         case when l.full_view then l.form end,
         case when l.full_view then l.usage end,
         case when l.full_view then l.examples else l.examples[1:2] end,
         case when l.full_view then l.common_mistakes else '[]'::jsonb end,
         l.media_path,
         l.created_by_name,
         l.published_at,
         l.updated_at
  from lesson l
$$;

-- -----------------------------------------------------------------------------
-- Dictionary: published words of the word bank (signed-in, dictionary.read)
-- -----------------------------------------------------------------------------
create or replace function public.dictionary_search(query text, max_rows integer default 30)
returns table (
  id uuid,
  word text,
  ipa text,
  part_of_speech public.part_of_speech,
  meaning_vi text,
  definition_en text,
  example text,
  cefr_level public.cefr_level,
  topic text,
  synonyms text[],
  antonyms text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  term text := lower(btrim(coalesce(query, '')));
begin
  if not private.has_permission('dictionary.read') then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;
  return query
    select w.id, w.word, w.ipa, w.part_of_speech, w.meaning_vi, w.definition_en, w.example, w.cefr_level, w.topic, w.synonyms, w.antonyms
    from public.vocabulary_words w
    where w.status = 'published'
      and (term = '' or lower(w.word) like term || '%' or lower(w.meaning_vi) like '%' || term || '%')
    order by (lower(w.word) = term) desc, (lower(w.word) like term || '%') desc, w.word
    limit least(greatest(coalesce(max_rows, 30), 1), 100);
end;
$$;

-- -----------------------------------------------------------------------------
-- Comments on public lessons and articles
-- -----------------------------------------------------------------------------
create table public.content_comments (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid references public.lessons (id) on delete cascade,
  article_id  uuid references public.articles (id) on delete cascade,
  author_id   uuid references public.profiles (id) on delete set null default auth.uid(),
  author_name text not null default '',
  body        text not null check (btrim(body) <> '' and char_length(body) <= 2000),
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(lesson_id, article_id) = 1)
);

create index content_comments_lesson_idx on public.content_comments (lesson_id, created_at) where lesson_id is not null;
create index content_comments_article_idx on public.content_comments (article_id, created_at) where article_id is not null;

-- Is the commented page public right now? (visitors cannot read the tables)
create or replace function private.is_public_target(target_lesson uuid, target_article uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_lesson is not null then exists (
      select 1 from public.lessons l
      where l.id = target_lesson and l.status = 'published' and l.public_access <> 'members' and l.slug is not null)
    else exists (select 1 from public.articles a where a.id = target_article and a.status = 'published')
  end
$$;

create or replace function private.prepare_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := (select auth.uid());
  new.author_name := coalesce(nullif((select full_name from public.profiles where id = new.author_id), ''), 'BSmart');
  new.body := btrim(new.body);
  new.hidden_at := null;
  if (select count(*) from public.content_comments where author_id = new.author_id and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'You are commenting very quickly. Please wait a while.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger content_comments_prepare before insert on public.content_comments
  for each row execute function private.prepare_comment();

alter table public.content_comments enable row level security;

create policy content_comments_select_public on public.content_comments for select to anon
  using (hidden_at is null and (select private.is_public_target(lesson_id, article_id)));
create policy content_comments_select on public.content_comments for select to authenticated
  using (
    (select private.has_permission('site.write'))
    or (hidden_at is null and (select private.is_public_target(lesson_id, article_id)))
  );
create policy content_comments_insert on public.content_comments for insert to authenticated
  with check ((select private.has_permission('comments.write')) and (select private.is_public_target(lesson_id, article_id)));
-- Moderators hide or show; nobody edits someone else's words.
create policy content_comments_update on public.content_comments for update to authenticated
  using ((select private.has_permission('site.write')))
  with check ((select private.has_permission('site.write')));
create policy content_comments_delete on public.content_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select private.has_permission('site.write')));

revoke insert, update, delete on public.content_comments from anon;
revoke update on public.content_comments from authenticated;
grant update (hidden_at) on public.content_comments to authenticated;
grant select on public.content_comments to anon;

-- -----------------------------------------------------------------------------
-- Audit log (append-only)
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_name  text not null default '',
  action      text not null,
  entity      text not null,
  entity_id   text,
  summary     text not null default '',
  details     jsonb not null default '{}'
);

create index audit_log_time_idx on public.audit_log (occurred_at desc);
create index audit_log_entity_idx on public.audit_log (entity, entity_id);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log for select to authenticated
  using ((select private.has_permission('audit.read')));
revoke insert, update, delete, truncate on public.audit_log from anon, authenticated;

create or replace function private.audit(action text, entity text, entity_id text, summary text, details jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor_id, actor_name, action, entity, entity_id, summary, details)
  values (
    (select auth.uid()),
    coalesce((select full_name from public.profiles where id = (select auth.uid())), ''),
    action, entity, entity_id, coalesce(summary, ''), coalesce(details, '{}')
  )
$$;

create or replace function private.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role_code is distinct from old.role_code then
    perform private.audit('user.role_changed', 'profile', new.id::text, new.email,
      jsonb_build_object('from', old.role_code, 'to', new.role_code));
  end if;
  if new.is_active is distinct from old.is_active then
    perform private.audit(case when new.is_active then 'user.activated' else 'user.deactivated' end, 'profile', new.id::text, new.email);
  end if;
  return new;
end;
$$;
create trigger audit_profiles after update of role_code, is_active on public.profiles
  for each row execute function private.audit_profiles();

create or replace function private.audit_user_permissions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row public.user_permissions := case when tg_op = 'DELETE' then old else new end;
begin
  perform private.audit(case when tg_op = 'DELETE' then 'permission.revoked' else 'permission.granted' end, 'profile', row.profile_id::text,
    coalesce((select email from public.profiles where id = row.profile_id), ''),
    jsonb_build_object('permission', row.permission_code, 'scope', row.scope));
  return null;
end;
$$;
create trigger audit_user_permissions after insert or delete on public.user_permissions
  for each row execute function private.audit_user_permissions();

create or replace function private.audit_payments()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.audit('payment.recorded', 'payment', new.id::text, new.receipt_number, jsonb_build_object('amount', new.amount));
  elsif new.status = 'voided' and old.status is distinct from 'voided' then
    perform private.audit('payment.voided', 'payment', new.id::text, new.receipt_number,
      jsonb_build_object('amount', new.amount, 'reason', new.void_reason));
  end if;
  return null;
end;
$$;
create trigger audit_payments after insert or update of status on public.payments
  for each row execute function private.audit_payments();

create or replace function private.audit_invoices()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'void' and old.status is distinct from 'void' then
    perform private.audit('invoice.voided', 'invoice', new.id::text, new.invoice_number,
      jsonb_build_object('amount', new.amount, 'reason', new.void_reason));
  end if;
  return null;
end;
$$;
create trigger audit_invoices after update of status on public.invoices
  for each row execute function private.audit_invoices();

create or replace function private.audit_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  label text := coalesce(to_jsonb(new) ->> 'full_name', to_jsonb(new) ->> 'name', '');
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform private.audit(tg_argv[0] || '.archived', tg_argv[0], new.id::text, label);
  elsif new.deleted_at is null and old.deleted_at is not null then
    perform private.audit(tg_argv[0] || '.restored', tg_argv[0], new.id::text, label);
  end if;
  return null;
end;
$$;
create trigger audit_students after update of deleted_at on public.students
  for each row execute function private.audit_archive('student');
create trigger audit_teachers after update of deleted_at on public.teachers
  for each row execute function private.audit_archive('teacher');
create trigger audit_classes after update of deleted_at on public.classes
  for each row execute function private.audit_archive('class');

create or replace function private.audit_public_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.public_access is distinct from old.public_access then
    perform private.audit('content.visibility_changed', tg_argv[0], new.id::text, new.title,
      jsonb_build_object('from', old.public_access, 'to', new.public_access));
  end if;
  return null;
end;
$$;
create trigger audit_lessons_public after update of public_access on public.lessons
  for each row execute function private.audit_public_access('lesson');
create trigger audit_materials_public after update of public_access on public.library_materials
  for each row execute function private.audit_public_access('material');

create or replace function private.audit_articles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.audit('article.deleted', 'article', old.id::text, old.title);
  elsif new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    perform private.audit('article.published', 'article', new.id::text, new.title);
  end if;
  return null;
end;
$$;
create trigger audit_articles after insert or update of status or delete on public.articles
  for each row execute function private.audit_articles();

create or replace function private.audit_site_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.audit('website.settings_changed', 'site_settings', null, '');
  return null;
end;
$$;
create trigger audit_site_settings after update on public.site_settings
  for each row execute function private.audit_site_settings();

-- -----------------------------------------------------------------------------
-- Grants
-- -----------------------------------------------------------------------------
revoke all on function public.dictionary_search(text, integer) from public, anon;
grant execute on function public.dictionary_search(text, integer) to authenticated;

revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
grant execute on function private.is_public_object(text), private.is_public_target(uuid, uuid) to anon;
