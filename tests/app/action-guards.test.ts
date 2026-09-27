import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

/**
 * Server Actions are public HTTP endpoints: anyone can call them with any
 * input. Every exported action must identify the caller before doing work
 * (requirePermission / requireUser); the database then checks the rows.
 * Only the sign-in family and the interface-language switch are public by design.
 */
const PUBLIC_ACTIONS = new Set(["signInAction", "signOutAction", "requestPasswordResetAction", "setLocaleAction"])

const srcDir = path.resolve(import.meta.dirname, "../../src")

function findFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return findFiles(full)
    return /\.(ts|tsx)$/.test(entry) ? [full] : []
  })
}

const actionFiles = findFiles(srcDir).filter((file) => /^\s*["']use server["']/.test(readFileSync(file, "utf8")))

const actions = actionFiles.flatMap((file) => {
  const source = readFileSync(file, "utf8")
  const parts = source.split(/(?=export async function )/)
  return parts
    .filter((p) => p.startsWith("export async function "))
    .map((body) => ({ file: path.relative(srcDir, file), name: /export async function (\w+)/.exec(body)![1], body }))
})

describe("server actions", () => {
  it("are found", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(20)
    expect(actions.length).toBeGreaterThan(100)
  })

  it.each(actions.filter((a) => !PUBLIC_ACTIONS.has(a.name)).map((a) => [`${a.file} ${a.name}`, a] as const))("%s checks the caller", (_, a) => {
    expect(a.body).toMatch(/require(Permission|User|RouteAccess)\(/)
  })

  it.each(actions.map((a) => [`${a.file} ${a.name}`, a] as const))("%s validates its input with a schema", (_, a) => {
    // Every action taking input goes through runAction(schema, input, …) or parses it itself.
    if (/\(\s*\)/.test(a.body.split("\n")[0])) return
    expect(a.body).toMatch(/runAction\(|safeParse\(|\.parse\(/)
  })
})
