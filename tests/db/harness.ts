import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { PGlite, type Transaction } from "@electric-sql/pglite"
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto"
import { unaccent } from "@electric-sql/pglite/contrib/unaccent"

const here = import.meta.dirname
const root = path.resolve(here, "../..")
const migrationsDir = path.join(root, "supabase", "migrations")

/**
 * Fresh in-memory Postgres with the Supabase shim, every migration (in order)
 * and optionally the seed. Statements run as the superuser, like `db reset`.
 */
export async function createTestDb({ seed = true } = {}) {
  const db = await PGlite.create({ extensions: { pgcrypto, unaccent } })
  await db.exec(readFileSync(path.join(here, "supabase-shim.sql"), "utf8"))

  const migrations = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()
  for (const file of migrations) {
    try {
      await db.exec(readFileSync(path.join(migrationsDir, file), "utf8"))
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`)
    }
  }

  if (seed) {
    await db.exec(readFileSync(path.join(root, "supabase", "seed.sql"), "utf8"))
  }
  return db
}

export type TestDb = Awaited<ReturnType<typeof createTestDb>>
export type Session = Transaction

/**
 * Runs `fn` exactly as a Data API request would: role `authenticated` (or
 * `anon`) with the user's JWT claims, inside a transaction that is always
 * rolled back so tests never affect each other.
 */
export async function as<T>(db: TestDb, userId: string | null, fn: (tx: Session) => Promise<T>) {
  let result!: T
  let failure: unknown
  await db
    .transaction(async (tx) => {
      const claims = userId ? { sub: userId, role: "authenticated" } : { role: "anon" }
      await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`)
      await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)])
      try {
        result = await fn(tx)
      } catch (error) {
        failure = error
      }
      await tx.rollback()
    })
    .catch(() => {
      // rollback() rejects the transaction promise by design.
    })
  if (failure) throw failure
  return result
}

/** Within an `as()` block, continue as a different signed-in user. */
export async function switchUser(tx: Session, userId: string) {
  await tx.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ])
}

export async function userId(db: TestDb, email: string) {
  const { rows } = await db.query<{ id: string }>("select id from auth.users where email = $1", [email])
  if (!rows[0]) throw new Error(`No seeded user ${email}`)
  return rows[0].id
}

/** Sorted values of one column, for readable equality assertions. */
export async function column(tx: Session, sql: string, params: unknown[] = []) {
  const { rows } = await tx.query<Record<string, unknown>>(sql, params)
  return rows.map((row) => String(Object.values(row)[0])).sort()
}
