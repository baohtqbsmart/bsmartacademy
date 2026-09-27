-- =============================================================================
-- Public learning content
--
-- Lessons and library materials can be opened to visitors:
--   members  only signed-in users (the default; what existed before)
--   preview  visitors see the beginning, then are asked to sign in
--   public   visitors see everything (lessons) / can open the file (materials)
-- Visitors never read these tables: security-definer functions return only
-- what the access level allows, so locked parts never leave the database.
-- Articles (the knowledge blog) and teachers' website profiles are new.
-- Only site.write (administrators) can publish anything to the website.
-- =============================================================================

create type public.public_access as enum ('members', 'preview', 'public');

-- -----------------------------------------------------------------------------
-- Lessons
-- -----------------------------------------------------------------------------
alter table public.lessons
  add column slug text unique check (slug is null or (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120)),
  add column public_access public.public_access not null default 'members',
  add check (public_access = 'members' or slug is not null);

create or replace function public.set_lesson_public(target_lesson uuid, new_access public.public_access, new_slug text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('site.write') then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;
  if new_access <> 'members' and nullif(btrim(coalesce(new_slug, '')), '') is null then
    raise exception 'Give the lesson a web address.' using errcode = '22023';
  end if;
  if exists (select 1 from public.lessons where slug = new_slug and id <> target_lesson) then
    raise exception 'This web address is already used by another lesson.' using errcode = '23505';
  end if;
  update public.lessons
    set public_access = new_access, slug = nullif(btrim(coalesce(new_slug, '')), '')
    where id = target_lesson;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Preview: the first paragraphs of the body, about 700 characters.
create or replace function private.preview_text(full_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when full_text is null or char_length(full_text) <= 700 then full_text
    else coalesce(
      nullif(left(full_text, greatest(0, position(E'\n\n' in substr(full_text, 300)) + 298)), ''),
      left(full_text, 700)
    )
  end
$$;

create or replace function public.public_lessons()
returns table (
  slug text,
  title text,
  skill public.english_skill,
  cefr_level public.cefr_level,
  topic text,
  summary text,
  access public.public_access,
  has_media boolean,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.slug, l.title, l.skill, l.cefr_level, l.topic, l.summary, l.public_access, l.media_path is not null, l.published_at
  from public.lessons l
  where l.status = 'published' and l.public_access <> 'members' and l.slug is not null
  order by l.published_at desc nulls last, l.title
$$;

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
  select l.id, l.slug, l.title, l.skill, l.cefr_level, l.topic, l.summary, l.public_access,
         case when l.public_access = 'public' then l.body else private.preview_text(l.body) end,
         l.public_access = 'preview' and coalesce(private.preview_text(l.body), '') is distinct from coalesce(l.body, ''),
         case when l.public_access = 'public' then l.form end,
         case when l.public_access = 'public' then l.usage end,
         case when l.public_access = 'public' then l.examples else l.examples[1:2] end,
         case when l.public_access = 'public' then l.common_mistakes else '[]'::jsonb end,
         l.media_path,
         l.created_by_name,
         l.published_at,
         l.updated_at
  from public.lessons l
  where l.slug = target_slug and l.status = 'published' and l.public_access <> 'members'
$$;

-- -----------------------------------------------------------------------------
-- Library materials
-- -----------------------------------------------------------------------------
alter table public.library_materials
  add column public_access public.public_access not null default 'members';

create or replace function public.set_material_public(target_material uuid, new_access public.public_access)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('site.write') then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;
  update public.library_materials set public_access = new_access where id = target_material;
  if not found then
    raise exception 'Material not found.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.public_materials()
returns table (
  id uuid,
  title text,
  description text,
  subject_name text,
  topic text,
  file_kind text,
  size_bytes bigint,
  access public.public_access,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, m.description, s.name, m.topic, m.file_kind, m.size_bytes, m.public_access, m.updated_at
  from public.library_materials m
  left join public.subjects s on s.id = m.subject_id
  where m.archived_at is null and m.public_access <> 'members'
  order by m.updated_at desc
$$;

-- The file itself is only returned for public materials.
create or replace function public.public_material(target_material uuid)
returns table (
  id uuid,
  title text,
  description text,
  subject_name text,
  topic text,
  file_kind text,
  mime_type text,
  size_bytes bigint,
  access public.public_access,
  object_path text,
  file_name text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.title, m.description, s.name, m.topic, m.file_kind, m.mime_type, m.size_bytes, m.public_access,
         case when m.public_access = 'public' then m.object_path end,
         case when m.public_access = 'public' then m.file_name end,
         m.updated_at
  from public.library_materials m
  left join public.subjects s on s.id = m.subject_id
  where m.id = target_material and m.archived_at is null and m.public_access <> 'members'
$$;

-- -----------------------------------------------------------------------------
-- Visitors may open (sign URLs for) exactly these stored files: media of
-- published public/preview lessons and files of public materials.
-- -----------------------------------------------------------------------------
create or replace function private.is_public_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
      select 1 from public.lessons l
      where l.media_path = object_name and l.status = 'published' and l.public_access <> 'members' and l.slug is not null
    )
    or exists (
      select 1 from public.library_materials m
      where m.object_path = object_name and m.archived_at is null and m.public_access = 'public'
    )
$$;

-- Storage policies run as the caller, so visitors need this one helper (and
-- nothing else in private: see the grants at the end).
grant usage on schema private to anon;

create policy public_content_objects_select on storage.objects for select to anon
  using (bucket_id = 'assignment-files' and (select private.is_public_object(name)));

-- -----------------------------------------------------------------------------
-- Teachers on the website
-- -----------------------------------------------------------------------------
alter table public.teachers
  add column public_bio        text not null default '' check (char_length(public_bio) <= 1000),
  add column public_photo_path text,
  add column show_on_website   boolean not null default false;

create or replace function public.set_teacher_website(target_teacher uuid, new_bio text, new_photo_path text, new_show boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('site.write') then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;
  update public.teachers
    set public_bio = coalesce(btrim(new_bio), ''),
        public_photo_path = nullif(btrim(coalesce(new_photo_path, '')), ''),
        show_on_website = new_show
    where id = target_teacher and deleted_at is null;
  if not found then
    raise exception 'Teacher not found.' using errcode = 'P0002';
  end if;
end;
$$;

-- Name, subjects, qualifications and the public introduction; never contact
-- details, pay or notes.
create or replace function public.public_teachers()
returns table (id uuid, full_name text, bio text, photo_path text, subjects text[], qualifications text[])
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.full_name, t.public_bio, t.public_photo_path,
         coalesce(array(select s.name from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id
                        where ts.teacher_id = t.id and s.deleted_at is null order by s.name), '{}'),
         coalesce(array(select q.title from public.teacher_qualifications q where q.teacher_id = t.id
                        order by q.year_awarded desc nulls last, q.title), '{}')
  from public.teachers t
  where t.show_on_website and t.deleted_at is null and t.status = 'active'
  order by t.full_name
$$;

-- -----------------------------------------------------------------------------
-- Articles (knowledge sharing)
-- -----------------------------------------------------------------------------
create type public.article_status as enum ('draft', 'published');

create table public.articles (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  title            text not null check (btrim(title) <> '' and char_length(title) <= 200),
  excerpt          text not null default '' check (char_length(excerpt) <= 500),
  body             text not null default '' check (char_length(body) <= 50000),
  cover_image_path text,
  status           public.article_status not null default 'draft',
  published_at     timestamptz,
  author_id        uuid references public.profiles (id) on delete set null default auth.uid(),
  author_name      text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index articles_published_idx on public.articles (published_at desc) where status = 'published';

create or replace function private.articles_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.author_name := coalesce((select full_name from public.profiles where id = new.author_id), '');
  end if;
  if new.status = 'published' and new.published_at is null then
    new.published_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger articles_before_write
  before insert or update on public.articles
  for each row execute function private.articles_before_write();

alter table public.articles enable row level security;

create policy articles_select_public on public.articles for select to anon using (status = 'published');
create policy articles_select on public.articles for select to authenticated
  using (status = 'published' or (select private.has_permission('site.write')));
create policy articles_insert on public.articles for insert to authenticated
  with check ((select private.has_permission('site.write')));
create policy articles_update on public.articles for update to authenticated
  using ((select private.has_permission('site.write')))
  with check ((select private.has_permission('site.write')));
create policy articles_delete on public.articles for delete to authenticated
  using ((select private.has_permission('site.write')));

grant select on public.articles to anon;
revoke insert, update, delete on public.articles from anon;

-- -----------------------------------------------------------------------------
-- Grants for the functions above
-- -----------------------------------------------------------------------------
revoke all on function
  public.set_lesson_public(uuid, public.public_access, text),
  public.set_material_public(uuid, public.public_access),
  public.set_teacher_website(uuid, text, text, boolean)
from public, anon;
grant execute on function
  public.set_lesson_public(uuid, public.public_access, text),
  public.set_material_public(uuid, public.public_access),
  public.set_teacher_website(uuid, text, text, boolean)
to authenticated;

revoke all on function
  public.public_lessons(), public.public_lesson(text), public.public_materials(), public.public_material(uuid), public.public_teachers()
from public;
grant execute on function
  public.public_lessons(), public.public_lesson(text), public.public_materials(), public.public_material(uuid), public.public_teachers()
to anon, authenticated;

-- Private helpers: signed-in callers only, except the storage check above.
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
grant execute on function private.is_public_object(text) to anon;
