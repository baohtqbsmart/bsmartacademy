-- =============================================================================
-- Admin dashboard and reports.
--
-- Reports only read existing data through RLS, so this adds a permission and
-- nothing else. Administrators report on the whole academy; teachers on their
-- own classes (RLS narrows every query). The tuition and teacher reports also
-- require academy-wide rights in the app (tuition.read all / reports.read all).
-- =============================================================================

insert into public.permissions (code, description) values
  ('reports.read', 'View reports and the admin dashboard');

insert into public.role_permissions (role_code, permission_code, scope) values
  ('super_admin', 'reports.read', 'all'),
  ('admin',       'reports.read', 'all'),
  ('teacher',     'reports.read', 'assigned');
