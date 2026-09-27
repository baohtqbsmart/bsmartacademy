import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { routeAccess } from "@/config/access"
import { routes } from "@/config/routes"

/**
 * Direct-URL protection is only as good as each page's guard. This test reads
 * every page in the authenticated route group and checks that pages with an
 * access rule actually call requireRouteAccess() for their own path.
 */
const appDir = path.resolve(import.meta.dirname, "../../src/app/(app)")

function findPages(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return findPages(full)
    return entry === "page.tsx" ? [full] : []
  })
}

function routeOf(file: string) {
  const relative = path.relative(appDir, path.dirname(file)).split(path.sep).join("/")
  return `/${relative}`
}

const routeKeyByPath = Object.fromEntries(Object.entries(routes).map(([key, value]) => [value, key]))
// Pages every signed-in user may open (still behind requireUser in the layout).
// Shared designs: the share token is the key; the page still requires sign-in.
// Notifications: every user has their own (RLS: user_id = caller).
const OPEN_TO_ALL_SIGNED_IN = [routes.dashboard, routes.profile, routes.designShared, routes.notifications, routes.notificationSettings]

describe("protected pages", () => {
  const pages = findPages(appDir).map((file) => ({ file, route: routeOf(file) }))

  it("every page is either open to all signed-in users or has an access rule", () => {
    const unclassified = pages
      .map((page) => page.route)
      .filter((route) => !OPEN_TO_ALL_SIGNED_IN.includes(route as never) && !(route in routeAccess))
    expect(unclassified).toEqual([])
  })

  it("every access rule has a page", () => {
    const pageRoutes = pages.map((page) => page.route)
    expect(Object.keys(routeAccess).filter((route) => !pageRoutes.includes(route))).toEqual([])
  })

  it.each(Object.keys(routeAccess))("%s calls requireRouteAccess for its own route", (route) => {
    const page = pages.find((candidate) => candidate.route === route)!
    const source = readFileSync(page.file, "utf8")
    expect(source).toContain(`requireRouteAccess(routes.${routeKeyByPath[route]})`)
  })
})
