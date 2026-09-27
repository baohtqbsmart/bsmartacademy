import { describe, expect, it } from "vitest"

import { config } from "@/proxy"

// The matcher is a path-to-regexp pattern whose only group is a plain regex,
// so it can be checked as one.
const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path)

describe("proxy matcher", () => {
  it("runs the auth gate on pages and routes", () => {
    for (const path of ["/", "/dashboard", "/students/abc", "/auth/confirm", "/reports/x/export", "/robots.txt.bak"]) {
      expect(matches(path), path).toBe(true)
    }
  })

  it("skips static assets and robots.txt, which crawlers fetch without a session", () => {
    for (const path of ["/robots.txt", "/favicon.ico", "/_next/static/chunks/a.js", "/logo.svg"]) {
      expect(matches(path), path).toBe(false)
    }
  })
})
