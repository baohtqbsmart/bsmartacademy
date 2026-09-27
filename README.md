# BSmart Academy

## 1. Project overview

Education management and online teaching platform for BSmart Academy (Vietnam). One app for
five roles — super administrator, administrator, teacher, parent, student — covering:

- people and classes: users and roles, students, parents, courses, classes, enrolments, schedule
- operations: attendance, tuition plans, invoices and payments, reports and admin dashboard
- teaching: assignments, question bank and tests, English learning (vocabulary, lessons,
  writing and speaking), online classes, lesson designer, material library, AI teaching assistant
- families: progress analytics, parent portal, announcements, notifications, messages

Accounts are invite-only. Every permission is enforced in PostgreSQL (row-level security and
checked database functions); the UI only hides what the database would refuse anyway.

Further reading: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (structure and conventions),
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) (production, migrations, backups, monitoring),
[docs/AUDIT-2026-09.md](docs/AUDIT-2026-09.md) (security audit).

## 2. Tech stack

| Layer | Technology |
| ----- | ---------- |
| App | Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript |
| UI | Tailwind CSS 4, shadcn/ui (Radix), Lucide icons, Recharts, React Hook Form + Zod |
| Backend | Supabase: PostgreSQL 17 with RLS, Auth (e-mail, invite-only), Storage (private buckets) |
| AI | Provider abstraction in `src/lib/ai` (Anthropic implemented), server-side only |
| Tests | Vitest; database tests run the real migrations in PGlite (in-process Postgres) |
| Hosting | Vercel (region `sin1`) + Supabase (region Singapore) |

## 3. Installation

Requirements: Node.js 20.9+ (developed on 24 LTS), and either a Supabase project or Docker
Desktop for the local Supabase stack.

```bash
npm install
cp .env.example .env.local     # then fill in the values (section 4)
```

## 4. Environment variables

| Variable | Required | Visible to browser | Purpose |
| -------- | -------- | ------------------ | ------- |
| `NEXT_PUBLIC_SITE_URL` | yes | yes | Public URL of the app (auth e-mail links) |
| `NEXT_PUBLIC_SUPABASE_URL` | yes | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes | yes | Publishable (anon) key — safe because of RLS |
| `AI_PROVIDER` | no | no | `anthropic` (default) or `none` |
| `AI_API_KEY` | no | **no — secret** | Enables the AI assistant; without it the pages say it is not set up |
| `AI_MODEL`, `AI_TIMEOUT_MS` | no | no | Optional overrides |

Rules:

- Never give a secret a `NEXT_PUBLIC_` name — those are copied into the browser bundle.
- The app does **not** use the Supabase service role key or the database password; do not add them.
- `.env*` files are git-ignored except `.env.example`.
- `NEXT_PUBLIC_*` values are inlined at build time: set them before `npm run build`.

## 5. Database setup

The schema, policies, storage buckets, permissions and functions are all in
`supabase/migrations/` (applied in filename order).

**Hosted project:**

```bash
npx supabase link --project-ref <ref>
npx supabase db push          # applies migrations; never loads seed data
```

**Local stack (Docker):**

```bash
npm run db:start      # prints the API URL and publishable key for .env.local
npm run db:reset      # re-applies migrations and loads supabase/seed.sql
npm run db:types      # regenerate src/types/database.ts after schema changes
npm run db:new <name> # new migration file
```

Changes to the schema always go in a **new** migration; never edit one that has been applied
to a shared database (see [docs/DEPLOYMENT.md §5](docs/DEPLOYMENT.md)).

### Seed data (local only)

`supabase/seed.sql` loads fictional Vietnamese users, classes, enrolments,
tuition and attendance (emails on the reserved `.test` domain, phone numbers
`0900 000 xxx`). Tuition due dates and attendance registers are generated
relative to the day you run it, so overdue fees and absence warnings stay
current: Châu (HS003) has missed the last three Toán sessions and Ngọc Anh
(HS002) the last two Flyers sessions (Flyers is taught hybrid). Assignments cover
every state: Huy's Toán homework is graded and returned, Châu's was handed in late
and is graded but not returned, Huy has a timed quiz in progress, and Flyers has a
published quiz, a draft and a scheduled task. The question bank has 14 questions
(every type); the Toán test "Kiểm tra chương 1" has Huy's fully marked attempt and
Châu's waiting for the essay to be marked. English learning has 14 words in three sets and
six lessons (the listening one waits for audio); Huy has practised and had his writing
reviewed, Châu's writing waits for review. Writing & speaking: three Flyers tasks; Ngọc Anh's
email is highlighted, graded and returned, Linh's waits for grading. Online classes: last
week's Flyers lesson (ended, with materials, notes, homework and a recording link), tomorrow's
Flyers lesson on Google Meet and a Toán lesson on Zoom in three days (the meeting links are
placeholders and open nothing real). Lesson designer: Hà has Flyers animal flip cards (shared by link)
and a past-simple grammar lesson, both from templates; Hùng has a fractions exit ticket. The material library
has folders only (Hà's Flyers folders, academy Cambridge/Toán folders): a SQL seed cannot put real files in
Storage, so upload materials yourself. Progress: Ngọc Anh (HS002) has ten weeks of vocabulary practice, so
her mother (Lan) and teacher (Hà) see a trend; other students' results are from the modules above.
Communication: a pinned parents' meeting announcement, a Flyers class announcement, and a conversation
between Hà and Lan about Ngọc Anh; the seeded events above also produce realistic notifications
(sign in as `ph.lan@bsmart.test` and open My family). It runs on
`db reset`, never on `db push`. Every account's password is `BSmart@2026`.

| Account                  | Role        | Notes                                     |
| ------------------------ | ----------- | ----------------------------------------- |
| `superadmin@bsmart.test` | super_admin | full access                               |
| `admin@bsmart.test`      | admin       | operations                                |
| `gv.hung@bsmart.test`    | teacher     | leads Toán 6 (TOAN6-2026A)                |
| `gv.ha@bsmart.test`      | teacher     | leads Flyers 2026A and KET 2025B          |
| `gv.tuan@bsmart.test`    | teacher     | assistant in Flyers 2026A                 |
| `gv.vinh@bsmart.test`    | teacher     | **deactivated** account                   |
| `ph.lan@bsmart.test`     | parent      | mother of HS001 and HS002                 |
| `ph.duc@bsmart.test`     | parent      | father of HS003                           |
| `hs.huy@bsmart.test`     | student     | HS001                                     |
| `hs.chau@bsmart.test`    | student     | HS003                                     |
| `hs.khang@bsmart.test`   | student     | HS004, withdrawn from Flyers              |

## 6. Authentication setup

The local stack reads `supabase/config.toml`; a hosted project must be configured to match in
the dashboard:

1. **Sign In / Providers:** disable "Allow new users to sign up" and anonymous sign-ins;
   enable *Secure password change*; minimum password length 8, "letters and digits".
2. **URL Configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`; add `<site-url>/auth/confirm`
   to Redirect URLs.
3. **Emails → Templates:** use `supabase/templates/invite.html`, `recovery.html` and
   `email_change.html` (Vietnamese/English). They send users to `/auth/confirm` with a token
   hash — the default templates would not work with this app.
4. **Emails → SMTP:** set up a real SMTP sender for production.
5. **First super administrator:** invite yourself (Users → Invite), accept the e-mail, then run
   once in the SQL editor (it runs as the database owner):

   ```sql
   update public.profiles set role_code = 'super_admin' where email = 'you@example.com';
   ```

   After that, invite people and assign roles from **Users & roles** in the app.

## 7. Storage setup

No manual steps: the migrations create the **private** buckets and their access policies.

| Bucket | Contents | Limit |
| ------ | -------- | ----- |
| `avatars` | profile photos | 2 MB, PNG/JPEG/WebP |
| `student-photos` | student photos | 2 MB, PNG/JPEG/WebP |
| `assignment-files` | assignment, submission, library, lesson-designer and English-learning files | 20 MB, allowed types in `public.upload_file_types` |

Files are only ever served through short-lived signed URLs created for a user who passes the
storage policy (students see only material assigned or shared with them). Storage files are
**not** included in database backups — see [docs/DEPLOYMENT.md §6](docs/DEPLOYMENT.md).

## 8. Development commands

| Command             | Purpose                                   |
| ------------------- | ----------------------------------------- |
| `npm run dev`       | Development server (http://localhost:3000) |
| `npm run typecheck` | Generate route types + `tsc --noEmit`     |
| `npm run lint`      | ESLint                                    |
| `npm test`          | Unit, app and database tests (real migrations + RLS on in-process Postgres; no Docker needed) |
| `npm run test:watch`| Tests in watch mode                        |
| `npm run check`     | typecheck + lint + tests + build (what CI runs) |
| `npm run db:*`      | Local Supabase stack (section 5)          |

## 9. Production build

```bash
npm run build     # needs the NEXT_PUBLIC_* variables set
npm start         # serve the build on port 3000
```

The build fails on type errors. The response headers (Content Security Policy, HSTS in
production, frame blocking) are set in `next.config.ts`; the CSP is derived from
`NEXT_PUBLIC_SUPABASE_URL`, so build with the real project URL. Search engines are told not to
index the app (`robots.txt` and `noindex`).

## 10. Deployment

Vercel + Supabase. Short version:

1. Create staging and production Supabase projects; configure auth and templates (section 6).
2. Apply migrations with the **Migrate database** GitHub workflow (staging first).
3. Import the repo into Vercel; set the section 4 variables for Production (production project)
   and Preview (staging project); add the domain.
4. Merge to `main` when **CI** is green; Vercel deploys it. Run the smoke test.

The full runbook, secrets list, release order and rollback are in
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 11. Backup

- Supabase daily backups (Pro plan), plus Point-in-Time Recovery recommended for production.
- `.github/workflows/backup.yml`: weekly `pg_dump` of the database, encrypted with `age`
  before upload to a private S3/R2 bucket.
- Storage files: weekly `rclone sync` of the buckets to versioned off-site storage.
- Test a restore every quarter. Details: [docs/DEPLOYMENT.md §6](docs/DEPLOYMENT.md).

## 12. Troubleshooting

| Symptom | Cause / fix |
| ------- | ----------- |
| "Invalid or missing environment variables: …" | Set the three `NEXT_PUBLIC_*` variables (in `.env.local`, or in Vercel) and rebuild |
| Changed a `NEXT_PUBLIC_*` value but nothing changed | They are inlined at build time — rebuild/redeploy |
| Invite or reset link says the link is invalid or expired | Links are single-use and expire; check the custom e-mail templates are installed and `/auth/confirm` is in Redirect URLs; send a new invite |
| Signed in but sees the wrong area, or pages show "not found" | The account has the default `student` role or is deactivated — set the role / reactivate in Users & roles |
| Images or files do not load; console shows CSP errors | The build was made with a different `NEXT_PUBLIC_SUPABASE_URL` — rebuild |
| "You do not have permission" on an action | Expected: the database refused it. Check the role's permissions in Users & roles |
| AI assistant says it is not set up | Set `AI_API_KEY` (server-side) and redeploy |
| AI says the limit is reached | Per-user limits: 1 request at a time, 20/hour, 100/day |
| "Too many messages/announcements" | Anti-abuse limits (30 messages per 10 minutes, 20 announcements per day for non-admins) |
| `supabase db push` refuses to run | A migration applied remotely was edited or is missing locally — never edit applied migrations; add a new one |
| A user reports an error page with a "Reference" code | Search the Vercel logs for that value (the `digest` field) |
