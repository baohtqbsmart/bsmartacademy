# Deployment and operations

Target: **Vercel** (Next.js app, region `sin1` Singapore) + **Supabase** (Postgres, Auth,
Storage, region `ap-southeast-1` Singapore) — the closest regions to Vietnam, and the pair the
app is built for (`@supabase/ssr`, RLS, Storage signed URLs). Nothing else needs to be hosted.

## 1. Environments

| Environment | App | Supabase project | Data |
| ----------- | --- | ---------------- | ---- |
| Local | `npm run dev` | local stack (Docker) or a personal dev project | `supabase/seed.sql` (fictional) |
| Staging | Vercel **Preview** deployments | `bsmart-staging` | fictional or anonymised; never real children's data |
| Production | Vercel **Production** (`main`) | `bsmart-production` | real |

Keep staging and production as **separate Supabase projects**. Previews must never point at
the production database.

## 2. Environment variables

Set in Vercel → Project → Settings → Environment Variables (separately for Production and
Preview). `.env.example` lists them for local work.

| Variable | Where | Secret? | Notes |
| -------- | ----- | ------- | ----- |
| `NEXT_PUBLIC_SITE_URL` | app | no | `https://<your-domain>`; used in auth e-mail links. Inlined at build time |
| `NEXT_PUBLIC_SUPABASE_URL` | app | no | `https://<ref>.supabase.co`. Also shapes the Content Security Policy at build time |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | app | no (public by design) | The **publishable** (anon) key. Safe in the browser only because every table has RLS |
| `AI_PROVIDER` | app, server only | no | `anthropic` or `none` |
| `AI_API_KEY` | app, server only | **yes** | Anthropic key. Mark "Sensitive" in Vercel. Never prefix with `NEXT_PUBLIC_` |
| `AI_MODEL`, `AI_TIMEOUT_MS` | app, server only | no | optional |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | GitHub Actions only | **yes** | migrations (`migrate.yml`); never in Vercel |
| `SUPABASE_DB_URL`, `BACKUP_*`, `AWS_*` | GitHub Actions only | **yes** | backups (`backup.yml`); never in Vercel |

**Not used anywhere, on purpose:** the Supabase **service role / secret key** and the database
password in the app. The app always acts as the signed-in user, so RLS applies to every request.
If a future feature needs the service role, it goes in a server-only module that checks the
caller's permission first (see ARCHITECTURE §7) — never in client code.

`NEXT_PUBLIC_*` values are baked into the browser bundle **at build time**: after changing them,
redeploy. CI fails the build if a secret-looking string appears in `.next/static`.

## 3. Supabase project setup (once per environment)

1. Create the project (region Singapore, Pro plan for production: daily backups, PITR option).
2. **Database:** from a machine with the Supabase CLI (or the `migrate.yml` workflow):
   `supabase link --project-ref <ref>` then `supabase db push`. This applies
   `supabase/migrations/*` in order and **never** runs `seed.sql`.
3. **Storage:** nothing to create by hand — the migrations create the private buckets
   (`avatars`, `student-photos`, `assignment-files`) with size and type limits, and all storage
   policies. Check in Storage that all three buckets show as *private*.
4. **Auth → Sign In / Providers:** disable "Allow new users to sign up"; disable anonymous
   sign-ins; e-mail provider on; *Secure password change* on; minimum password length 8 with
   "letters and digits".
5. **Auth → URL Configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`; Redirect URLs =
   `https://<your-domain>/auth/confirm` (and the staging domain for the staging project).
6. **Auth → Emails → Templates:** paste `supabase/templates/invite.html`, `recovery.html` and
   `email_change.html` (subjects are in `supabase/config.toml`). They link to `/auth/confirm`
   with a token hash; the default templates would not sign invited users in.
7. **Auth → Emails → SMTP:** configure a real SMTP sender (the built-in one is rate-limited and
   for testing only). Set the rate limits (Auth → Rate Limits) to at most the values in
   `config.toml`.
8. **First administrator:** invite yourself (Auth → Users → Invite), accept the e-mail, then in
   the SQL editor: `update public.profiles set role_code = 'super_admin' where email = '…';`.
   Everyone else is invited the same way and given a role in **Users & roles**.

## 4. Vercel setup

1. Import the repository; framework Next.js (`vercel.json` pins region `sin1`, `npm ci`,
   `npm run build`).
2. Add the environment variables above for Production and for Preview (Preview → staging project).
3. Add the domain; Vercel provides HTTPS. HSTS is sent by the app in production.
4. In the Git settings, require the `CI` GitHub check before merging to `main`.
5. Function duration: the AI generation page sets `maxDuration = 300`; all other routes use the
   default. Fluid compute (default) is fine.

## 5. Release routine and migration strategy

- **Migrations are forward-only and additive.** Never edit a migration that has reached any
  shared database; add a new one. Destructive changes are split over two releases
  (1: add new column/table and dual-write; 2: remove the old one after the app no longer reads it).
- Every migration is exercised by the test suite on a fresh database (`npm test` applies all of
  them in order in PGlite), and RLS changes get tests in `tests/db/`.
- Release order:
  1. Merge to `main` only when CI is green.
  2. Run **Migrate database → staging**; check the staging preview.
  3. Run **Migrate database → production** (the app build still running is compatible, because
     migrations are additive).
  4. Promote/let Vercel deploy `main` to production.
  5. Smoke test (section 8).
- **Rollback:** app — Vercel "Instant Rollback" to the previous deployment (migrations are
  additive, so older builds keep working). Database — write a new migration that reverts the
  change; restore from backup only for data loss (section 6).

## 6. Backups

| Layer | Mechanism | Retention | Restore |
| ----- | --------- | --------- | ------- |
| Database (primary) | Supabase daily backups (Pro) | 7 days (Pro) | Dashboard → Database → Backups |
| Database (fine-grained) | Point-in-Time Recovery add-on (recommended for production) | as purchased | restore to any second |
| Database (off-site) | `.github/workflows/backup.yml`: weekly `pg_dump`, **encrypted with age before upload**, to a private S3/R2 bucket | keep 12 weeks (bucket lifecycle rule) | `age -d -i key.txt file.dump.age \| pg_restore --no-owner -d <db-url>` into a new project |
| Storage files | **not** in database backups. Weekly sync of the `assignment-files`, `avatars`, `student-photos` buckets through Supabase Storage's S3 endpoint (e.g. `rclone sync supabase:assignment-files r2:bsmart-files`) with versioning on the target | 12 weeks | copy back with the same tool |
| Code and config | Git; migrations and templates are in the repository | — | redeploy |

Test a restore into a scratch project **every quarter** and record the time it took. Backups
contain children's personal data: keep the decryption key offline with two named people, and
restrict bucket access to the backup job.

## 7. Error monitoring and logging

- **What is logged:** `src/instrumentation.ts` writes one JSON line per unhandled server error
  (page, layout, Server Action, route handler) with the error `digest`, route and message —
  no query strings, share tokens are redacted. Expected failures (validation, permission) are
  shown to users and not logged as errors; unexpected ones are logged server-side by
  `runAction` (`[action] …`) while the user sees a generic message. AI calls log only an
  error code, never prompts or keys.
- **Where:** Vercel → Project → Logs (runtime logs, searchable by the `digest` users see on
  the error page). For retention and alerts, add a Vercel **Log Drain** to your log service,
  or install Sentry (`@sentry/nextjs`, `onRequestError` hook) — both work without code changes
  to the modules.
- **Alerts to set:** error rate spike (Vercel/Sentry), Supabase Reports → API 5xx and slow
  queries, database CPU/disk (Supabase), uptime check on `/login` (e.g. Better Stack / UptimeRobot,
  every 5 minutes).
- **Database:** Supabase Logs (Postgres, Auth, Storage) and Advisors (security and performance)
  — review the Advisors after every migration.

## 8. Production smoke test (after each release)

1. `/login` loads over HTTPS; response headers include `Content-Security-Policy`,
   `Strict-Transport-Security`, `X-Frame-Options: DENY`.
2. Sign in as a test administrator, teacher, parent and student (keep one real test account per
   role in production, attached to a test class with no real children).
3. Each role sees its own dashboard and sidebar; open one page each role must **not** reach
   (e.g. teacher → `/tuition/invoices`) and confirm "not found".
4. Upload and download a small PDF in the material library; open an assignment attachment.
5. Password reset e-mail arrives and its link lands on "Choose a password".
6. Vercel logs show no new errors.

## 9. Performance notes

- Heavy browser libraries are loaded only when used: PDF/PNG export (jsPDF, html-to-image) on
  click, charts on chart pages only.
- Database: indexes on every foreign key used by policies, reports and joins
  (`20261012000100_performance_indexes.sql`); RLS helper functions are `stable` and wrapped in
  `(select …)` in policies so Postgres evaluates them once per query.
- Images come from private storage through short-lived signed URLs, so they are not run through
  Next.js image optimisation (the URLs change hourly); uploads are limited to 2 MB for photos.
- Known follow-up: the Zod validation library (~380 KB raw) is shared by 45 pages' forms;
  moving client forms to `zod/mini` would roughly halve it.
