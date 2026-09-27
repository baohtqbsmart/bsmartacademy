import { describe, expect, it } from "vitest"

import { isPublicRoute, routes, safeRedirectPath } from "@/config/routes"

describe("safeRedirectPath", () => {
  it.each(["/students", "/settings/profile?tab=1"])("keeps same-origin path %s", (path) => {
    expect(safeRedirectPath(path)).toBe(path)
  })

  it.each([
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    // Browsers drop tabs and newlines in URLs, turning these into //evil.test.
    "/\t/evil.test",
    "/\n/evil.test",
    "/\r\n/evil.test",
    "/ /evil.test",
    "/students\\..\\\\evil.test",
    "students",
    "",
    undefined,
    42,
  ])(
    "rejects %s",
    (value) => {
      expect(safeRedirectPath(value)).toBe(routes.dashboard)
    }
  )
})

describe("isPublicRoute", () => {
  it.each([routes.home, routes.programs, "/programs/ANH", routes.about, routes.contact, routes.resources, "/resources/abc", "/lessons/present-simple", routes.articles, "/articles/tips", routes.login, routes.forgotPassword, routes.authConfirm, routes.signOut])("%s is public", (route) => {
    expect(isPublicRoute(route)).toBe(true)
  })

  it.each([routes.dashboard, routes.students, routes.users, routes.website, routes.setPassword, "/login-evil", "/programs-evil", "/aboutx", routes.adminArticles, "/lessonsx", routes.lessons])(
    "%s requires a session",
    (route) => {
      expect(isPublicRoute(route)).toBe(false)
    }
  )
})
