-- =============================================================================
-- Public website
--
-- The website (home, course catalogue, about, contact) is readable without an
-- account. Visitors never read tables directly: the catalogue comes from two
-- security-definer functions that return presentation fields of live subjects
-- and active courses only. Contact details, testimonials and pictures are
-- edited by administrators (site.write); nothing on the website is hard-coded.
-- =============================================================================

insert into public.permissions (code, description) values
  ('site.write', 'Edit the public website: contact details, pictures, testimonials');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'site.write', 'all'),
  ('admin', 'site.write', 'all');

-- -----------------------------------------------------------------------------
-- Contact details and the hero picture (one row)
-- -----------------------------------------------------------------------------
create table public.site_settings (
  id              boolean primary key default true check (id),
  contact_email   text check (contact_email is null or contact_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone   text check (contact_phone is null or contact_phone ~ '^[0-9 +().-]{6,20}$'),
  address         text check (address is null or length(address) <= 300),
  facebook_url    text check (facebook_url is null or facebook_url ~ '^https://'),
  zalo_url        text check (zalo_url is null or zalo_url ~ '^https://'),
  hero_image_path text,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references public.profiles (id) on delete set null
);

insert into public.site_settings (id) values (true);

create trigger site_settings_set_updated_at
  before update on public.site_settings
  for each row execute function private.set_updated_at();

alter table public.site_settings enable row level security;

create policy site_settings_select on public.site_settings for select to anon, authenticated using (true);
create policy site_settings_update on public.site_settings for update to authenticated
  using ((select private.has_permission('site.write')))
  with check ((select private.has_permission('site.write')));

-- Earlier migrations revoke default privileges from anon; grant exactly what visitors need.
revoke insert, delete on public.site_settings from anon, authenticated;
revoke update on public.site_settings from anon;
grant select on public.site_settings to anon;

-- -----------------------------------------------------------------------------
-- Testimonials: real quotes entered by staff; only published ones are public
-- -----------------------------------------------------------------------------
create table public.testimonials (
  id           uuid primary key default gen_random_uuid(),
  author_name  text not null check (btrim(author_name) <> '' and length(author_name) <= 120),
  author_role  text not null default '' check (length(author_role) <= 120),
  quote        text not null check (btrim(quote) <> '' and length(quote) <= 1000),
  is_published boolean not null default false,
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger testimonials_set_updated_at
  before update on public.testimonials
  for each row execute function private.set_updated_at();

alter table public.testimonials enable row level security;

create policy testimonials_select_public on public.testimonials for select to anon using (is_published);
create policy testimonials_select on public.testimonials for select to authenticated
  using (is_published or (select private.has_permission('site.write')));
create policy testimonials_insert on public.testimonials for insert to authenticated
  with check ((select private.has_permission('site.write')));
create policy testimonials_update on public.testimonials for update to authenticated
  using ((select private.has_permission('site.write')))
  with check ((select private.has_permission('site.write')));
create policy testimonials_delete on public.testimonials for delete to authenticated
  using ((select private.has_permission('site.write')));

revoke insert, update, delete on public.testimonials from anon;
grant select on public.testimonials to anon;

-- -----------------------------------------------------------------------------
-- How a subject is presented on the website
-- -----------------------------------------------------------------------------
alter table public.subjects
  add column audience        text not null default '' check (length(audience) <= 80),
  add column icon            text not null default 'book'
    check (icon in ('book', 'calculator', 'atom', 'flask', 'languages', 'globe', 'music', 'palette')),
  add column image_path      text,
  add column show_on_website boolean not null default true;

comment on column public.subjects.audience is 'Who the subject is for, shown on the website (e.g. "Lớp 6 – 12").';

-- Website fields change through this function (site.write), not the subject
-- form, so catalogue editors and website editors stay separate.
create or replace function public.set_subject_website(
  target_subject uuid,
  new_audience text,
  new_icon text,
  new_image_path text,
  new_show boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.has_permission('site.write') then
    raise exception 'You do not have permission to do this.' using errcode = '42501';
  end if;
  update public.subjects
    set audience = coalesce(btrim(new_audience), ''),
        icon = new_icon,
        image_path = nullif(btrim(coalesce(new_image_path, '')), ''),
        show_on_website = new_show
    where id = target_subject and deleted_at is null;
  if not found then
    raise exception 'Subject not found.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.set_subject_website(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.set_subject_website(uuid, text, text, text, boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Public catalogue (presentation fields only)
-- -----------------------------------------------------------------------------
create or replace function public.website_subjects()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  audience text,
  icon text,
  image_path text,
  course_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.code, s.name, s.description, s.audience, s.icon, s.image_path,
         (select count(*) from public.courses c
           where c.subject_id = s.id and c.status = 'active' and c.deleted_at is null)
  from public.subjects s
  where s.deleted_at is null and s.show_on_website
  order by s.name
$$;

create or replace function public.website_courses()
returns table (
  id uuid,
  code text,
  name text,
  description text,
  subject_id uuid,
  subject_name text,
  level_name text,
  session_count integer,
  session_minutes integer,
  duration_weeks integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.code, c.name, c.description, s.id, s.name, l.name,
         c.session_count, c.session_minutes, c.duration_weeks
  from public.courses c
  join public.subjects s on s.id = c.subject_id and s.deleted_at is null and s.show_on_website
  left join public.levels l on l.id = c.level_id
  where c.status = 'active' and c.deleted_at is null
  order by s.name, c.name
$$;

revoke all on function public.website_subjects(), public.website_courses() from public;
grant execute on function public.website_subjects(), public.website_courses() to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Public pictures (hero, subjects): readable by anyone, written by site editors
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy site_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and (select private.has_permission('site.write')));
create policy site_media_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and (select private.has_permission('site.write')))
  with check (bucket_id = 'site-media' and (select private.has_permission('site.write')));
create policy site_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and (select private.has_permission('site.write')));
