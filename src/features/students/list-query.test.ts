import { describe, expect, it } from "vitest"

import { hasActiveFilters, parseStudentListQuery, studentListHref } from "@/features/students/list-query"

describe("parseStudentListQuery", () => {
  it("applies defaults", () => {
    expect(parseStudentListQuery({})).toEqual({
      q: "",
      status: undefined,
      level: undefined,
      class: undefined,
      archived: undefined,
      sort: "name",
      dir: "asc",
      page: 1,
    })
  })

  it("falls back on invalid values instead of throwing", () => {
    const query = parseStudentListQuery({
      status: "expelled",
      level: "'; drop table",
      class: "not-a-uuid",
      sort: "password",
      dir: "sideways",
      page: "-4",
      archived: "yes",
    })
    expect(query).toMatchObject({ status: undefined, level: undefined, class: undefined, sort: "name", dir: "asc", page: 1, archived: undefined })
  })

  it("takes the first value of repeated params", () => {
    expect(parseStudentListQuery({ q: ["huy", "chau"], page: ["3"] })).toMatchObject({ q: "huy", page: 3 })
  })
})

describe("studentListHref", () => {
  it("round-trips and omits defaults", () => {
    const query = parseStudentListQuery({ q: "Nguyễn", status: "active", sort: "joined", dir: "desc", page: "2" })
    const href = studentListHref(query)
    expect(href).toBe("/students?q=Nguy%E1%BB%85n&status=active&sort=joined&dir=desc&page=2")
    const reparsed = parseStudentListQuery(Object.fromEntries(new URL(href, "http://x").searchParams))
    expect(reparsed).toEqual(query)
    expect(studentListHref(parseStudentListQuery({}))).toBe("/students")
  })

  it("reports active filters", () => {
    expect(hasActiveFilters(parseStudentListQuery({ sort: "code" }))).toBe(false)
    expect(hasActiveFilters(parseStudentListQuery({ level: "A2" }))).toBe(true)
  })
})
