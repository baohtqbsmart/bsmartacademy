-- =============================================================================
-- Row level security for people and academics.
--
-- Every read policy follows the same shape:
--
--   <module>.write                       -> every row, including soft-deleted
--   deleted_at is null AND one of:
--     <module>.read @ all                -> every live row
--     <module>.read @ assigned           -> linked to a class the user teaches
--     <module>.read @ own                -> the user's own record / own classes
--     <module>.read @ children           -> linked to the user's children
--
-- Writes require <module>.write; hard deletes require <module>.delete.
-- Relationship checks are security-definer helpers so they are not themselves
-- filtered by RLS (and cannot recurse). Withdrawn enrolments and soft-deleted
-- classes/students never grant access.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Who am I? (person records linked to the signed-in account)
-- -----------------------------------------------------------------------------
create or replace function private.current_teacher_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.teachers where profile_id = (select auth.uid()) and deleted_at is null;
$$;

create or replace function private.current_student_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.students where profile_id = (select auth.uid()) and deleted_at is null;
$$;

create or replace function private.current_parent_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.parents where profile_id = (select auth.uid()) and deleted_at is null;
$$;

-- -----------------------------------------------------------------------------
-- Relationship checks
-- -----------------------------------------------------------------------------

-- The caller teaches this (live) class.
create or replace function private.is_class_teacher(target_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.class_members cm
    join public.classes c on c.id = cm.class_id
    where cm.class_id = target_class_id
      and cm.teacher_id = private.current_teacher_id()
      and c.deleted_at is null
  );
$$;

-- The caller is (or was) a student of this class; withdrawn students lose access.
create or replace function private.is_class_student(target_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.class_id = target_class_id
      and e.student_id = private.current_student_id()
      and e.status <> 'withdrawn'
      and c.deleted_at is null
  );
$$;

-- One of the caller's children attends this class.
create or replace function private.is_class_of_child(target_class_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.enrollments e
    join public.student_parents sp on sp.student_id = e.student_id
    join public.students s on s.id = e.student_id
    join public.classes c on c.id = e.class_id
    where e.class_id = target_class_id
      and sp.parent_id = private.current_parent_id()
      and e.status <> 'withdrawn'
      and s.deleted_at is null
      and c.deleted_at is null
  );
$$;

-- The caller teaches a class this student is enrolled in.
create or replace function private.teaches_student(target_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.enrollments e
    join public.class_members cm on cm.class_id = e.class_id
    join public.classes c on c.id = e.class_id
    where e.student_id = target_student_id
      and cm.teacher_id = private.current_teacher_id()
      and e.status <> 'withdrawn'
      and c.deleted_at is null
  );
$$;

-- This student is one of the caller's children.
create or replace function private.is_parent_of(target_student_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.student_parents sp
    where sp.student_id = target_student_id
      and sp.parent_id = private.current_parent_id()
  );
$$;

-- The caller teaches a child of this parent.
create or replace function private.teaches_child_of(target_parent_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.student_parents sp
    join public.students s on s.id = sp.student_id
    where sp.parent_id = target_parent_id
      and s.deleted_at is null
      and private.teaches_student(sp.student_id)
  );
$$;

-- This teacher teaches one of the caller's (student) classes.
create or replace function private.teaches_my_class(target_teacher_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_members cm
    where cm.teacher_id = target_teacher_id and private.is_class_student(cm.class_id)
  );
$$;

-- This teacher teaches a class one of the caller's children attends.
create or replace function private.teaches_child_class(target_teacher_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.class_members cm
    where cm.teacher_id = target_teacher_id and private.is_class_of_child(cm.class_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- Students
-- -----------------------------------------------------------------------------
alter table public.students enable row level security;

create policy students_select on public.students for select to authenticated using (
  (select private.has_permission('students.write'))
  or (deleted_at is null and (
       (select private.has_permission('students.read', 'all'))
    or ((select private.has_permission('students.read', 'assigned')) and private.teaches_student(id))
    or ((select private.has_permission('students.read', 'own')) and profile_id = (select auth.uid()))
    or ((select private.has_permission('students.read', 'children')) and private.is_parent_of(id))
  ))
);
create policy students_insert on public.students for insert to authenticated
  with check ((select private.has_permission('students.write')));
create policy students_update on public.students for update to authenticated
  using ((select private.has_permission('students.write')))
  with check ((select private.has_permission('students.write')));
create policy students_delete on public.students for delete to authenticated
  using ((select private.has_permission('students.delete')));

-- -----------------------------------------------------------------------------
-- Parents
-- -----------------------------------------------------------------------------
alter table public.parents enable row level security;

create policy parents_select on public.parents for select to authenticated using (
  (select private.has_permission('parents.write'))
  or (deleted_at is null and (
       (select private.has_permission('parents.read', 'all'))
    or ((select private.has_permission('parents.read', 'assigned')) and private.teaches_child_of(id))
    or ((select private.has_permission('parents.read', 'own')) and profile_id = (select auth.uid()))
  ))
);
create policy parents_insert on public.parents for insert to authenticated
  with check ((select private.has_permission('parents.write')));
create policy parents_update on public.parents for update to authenticated
  using ((select private.has_permission('parents.write')))
  with check ((select private.has_permission('parents.write')));
create policy parents_delete on public.parents for delete to authenticated
  using ((select private.has_permission('parents.delete')));

-- -----------------------------------------------------------------------------
-- Teachers
-- -----------------------------------------------------------------------------
alter table public.teachers enable row level security;

create policy teachers_select on public.teachers for select to authenticated using (
  (select private.has_permission('teachers.write'))
  or (deleted_at is null and (
       (select private.has_permission('teachers.read', 'all'))
    or ((select private.has_permission('teachers.read', 'own'))
        and (profile_id = (select auth.uid()) or private.teaches_my_class(id)))
    or ((select private.has_permission('teachers.read', 'children')) and private.teaches_child_class(id))
  ))
);
create policy teachers_insert on public.teachers for insert to authenticated
  with check ((select private.has_permission('teachers.write')));
create policy teachers_update on public.teachers for update to authenticated
  using ((select private.has_permission('teachers.write')))
  with check ((select private.has_permission('teachers.write')));
create policy teachers_delete on public.teachers for delete to authenticated
  using ((select private.has_permission('teachers.delete')));

-- -----------------------------------------------------------------------------
-- Student <-> parent links: visible when both ends are visible to the caller
-- (the sub-selects are themselves filtered by the policies above).
-- -----------------------------------------------------------------------------
alter table public.student_parents enable row level security;

create policy student_parents_select on public.student_parents for select to authenticated using (
  exists (select 1 from public.students s where s.id = student_id)
  and exists (select 1 from public.parents p where p.id = parent_id)
);
create policy student_parents_insert on public.student_parents for insert to authenticated
  with check ((select private.has_permission('students.write')));
create policy student_parents_update on public.student_parents for update to authenticated
  using ((select private.has_permission('students.write')))
  with check ((select private.has_permission('students.write')));
create policy student_parents_delete on public.student_parents for delete to authenticated
  using ((select private.has_permission('students.write')));

-- -----------------------------------------------------------------------------
-- Catalogue: subjects, levels, courses (courses.* permissions)
-- -----------------------------------------------------------------------------
alter table public.subjects enable row level security;
alter table public.levels enable row level security;
alter table public.courses enable row level security;

create policy subjects_select on public.subjects for select to authenticated using (
  (select private.has_permission('courses.write'))
  or (deleted_at is null and (select private.has_permission('courses.read', 'all')))
);
create policy subjects_insert on public.subjects for insert to authenticated
  with check ((select private.has_permission('courses.write')));
create policy subjects_update on public.subjects for update to authenticated
  using ((select private.has_permission('courses.write')))
  with check ((select private.has_permission('courses.write')));
create policy subjects_delete on public.subjects for delete to authenticated
  using ((select private.has_permission('courses.delete')));

create policy levels_select on public.levels for select to authenticated using (
  (select private.has_permission('courses.write'))
  or (deleted_at is null and (select private.has_permission('courses.read', 'all')))
);
create policy levels_insert on public.levels for insert to authenticated
  with check ((select private.has_permission('courses.write')));
create policy levels_update on public.levels for update to authenticated
  using ((select private.has_permission('courses.write')))
  with check ((select private.has_permission('courses.write')));
create policy levels_delete on public.levels for delete to authenticated
  using ((select private.has_permission('courses.delete')));

create policy courses_select on public.courses for select to authenticated using (
  (select private.has_permission('courses.write'))
  or (deleted_at is null and (select private.has_permission('courses.read', 'all')))
);
create policy courses_insert on public.courses for insert to authenticated
  with check ((select private.has_permission('courses.write')));
create policy courses_update on public.courses for update to authenticated
  using ((select private.has_permission('courses.write')))
  with check ((select private.has_permission('courses.write')));
create policy courses_delete on public.courses for delete to authenticated
  using ((select private.has_permission('courses.delete')));

-- -----------------------------------------------------------------------------
-- Classes
-- -----------------------------------------------------------------------------
alter table public.classes enable row level security;

create policy classes_select on public.classes for select to authenticated using (
  (select private.has_permission('classes.write'))
  or (deleted_at is null and (
       (select private.has_permission('classes.read', 'all'))
    or ((select private.has_permission('classes.read', 'assigned')) and private.is_class_teacher(id))
    or ((select private.has_permission('classes.read', 'own')) and private.is_class_student(id))
    or ((select private.has_permission('classes.read', 'children')) and private.is_class_of_child(id))
  ))
);
create policy classes_insert on public.classes for insert to authenticated
  with check ((select private.has_permission('classes.write')));
create policy classes_update on public.classes for update to authenticated
  using ((select private.has_permission('classes.write')))
  with check ((select private.has_permission('classes.write')));
create policy classes_delete on public.classes for delete to authenticated
  using ((select private.has_permission('classes.delete')));

-- Teacher assignments are visible wherever the class is visible.
alter table public.class_members enable row level security;

create policy class_members_select on public.class_members for select to authenticated using (
  exists (select 1 from public.classes c where c.id = class_id)
);
create policy class_members_insert on public.class_members for insert to authenticated
  with check ((select private.has_permission('classes.write')));
create policy class_members_update on public.class_members for update to authenticated
  using ((select private.has_permission('classes.write')))
  with check ((select private.has_permission('classes.write')));
create policy class_members_delete on public.class_members for delete to authenticated
  using ((select private.has_permission('classes.write')));

-- -----------------------------------------------------------------------------
-- Enrollments
-- -----------------------------------------------------------------------------
alter table public.enrollments enable row level security;

create policy enrollments_select on public.enrollments for select to authenticated using (
  (select private.has_permission('enrollments.write'))
  or (select private.has_permission('enrollments.read', 'all'))
  -- Every narrower scope also requires the student to be visible to the caller.
  or (exists (select 1 from public.students s where s.id = student_id) and (
       ((select private.has_permission('enrollments.read', 'assigned'))
        and status <> 'withdrawn' and private.is_class_teacher(class_id))
    or ((select private.has_permission('enrollments.read', 'own'))
        and student_id = private.current_student_id())
    or ((select private.has_permission('enrollments.read', 'children'))
        and private.is_parent_of(student_id))
  ))
);
create policy enrollments_insert on public.enrollments for insert to authenticated
  with check ((select private.has_permission('enrollments.write')));
create policy enrollments_update on public.enrollments for update to authenticated
  using ((select private.has_permission('enrollments.write')))
  with check ((select private.has_permission('enrollments.write')));
create policy enrollments_delete on public.enrollments for delete to authenticated
  using ((select private.has_permission('enrollments.delete')));

-- -----------------------------------------------------------------------------
-- Privileges
-- -----------------------------------------------------------------------------
-- Anonymous visitors never read application tables (defence in depth on top of
-- RLS, whose policies all target "authenticated").
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

-- Private helpers: callable by signed-in users (policies run as them), never
-- exposed through the Data API because the "private" schema is not exposed.
revoke all on all functions in schema private from public, anon;
grant execute on all functions in schema private to authenticated;
