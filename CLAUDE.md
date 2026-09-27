@AGENTS.md

# Project conventions

Read docs/ARCHITECTURE.md before adding a module. Key rules:

- New modules follow `src/features/profile` (schemas → server/service → actions → components).
- Every table gets RLS in its migration; regenerate types with `npm run db:types`.
- Server Actions use `runAction` and call `requirePermission` themselves; pages call `requireRouteAccess` (rules in `src/config/access.ts`).
- No hard-coded business data and no placeholder/fake features; nav items only for routes that exist.
- Every new policy gets a case in `tests/db/rls.test.ts` (runs the real migrations on PGlite).
- Run `npm run check` (typecheck + lint + tests + build) before finishing.
