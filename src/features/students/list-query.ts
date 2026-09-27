import { z } from "zod"

/**
 * Student list state lives in the URL (?q=&status=&level=&class=&archived=&sort=&dir=&page=)
 * so it survives reloads and can be shared. Invalid values fall back to
 * defaults instead of erroring.
 */
export const STUDENT_SORTS = ["name", "code", "joined", "created"] as const
export type StudentSort = (typeof STUDENT_SORTS)[number]

export const STUDENT_STATUSES = ["active", "on_hold", "graduated", "withdrawn"] as const

export const STUDENT_PAGE_SIZE = 20

const studentListQuerySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  status: z.enum(STUDENT_STATUSES).optional().catch(undefined),
  level: z
    .string()
    .regex(/^[A-Z0-9_.-]{2,20}$/)
    .optional()
    .catch(undefined),
  class: z.uuid().optional().catch(undefined),
  archived: z.literal("1").optional().catch(undefined),
  sort: z.enum(STUDENT_SORTS).catch("name"),
  dir: z.enum(["asc", "desc"]).catch("asc"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
})

export type StudentListQuery = z.output<typeof studentListQuerySchema>

type RawParams = Record<string, string | string[] | undefined>

export function parseStudentListQuery(params: RawParams): StudentListQuery {
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }
  return studentListQuerySchema.parse({
    q: first("q") ?? "",
    status: first("status"),
    level: first("level"),
    class: first("class"),
    archived: first("archived"),
    sort: first("sort"),
    dir: first("dir"),
    page: first("page") ?? 1,
  })
}

/** Builds the list URL, omitting defaults so links stay short. */
export function studentListHref(query: StudentListQuery, changes: Partial<StudentListQuery> = {}) {
  const next = { ...query, ...changes }
  const params = new URLSearchParams()
  if (next.q) params.set("q", next.q)
  if (next.status) params.set("status", next.status)
  if (next.level) params.set("level", next.level)
  if (next.class) params.set("class", next.class)
  if (next.archived) params.set("archived", next.archived)
  if (next.sort !== "name") params.set("sort", next.sort)
  if (next.dir !== "asc") params.set("dir", next.dir)
  if (next.page > 1) params.set("page", String(next.page))
  const search = params.toString()
  return search ? `/students?${search}` : "/students"
}

export function hasActiveFilters(query: StudentListQuery) {
  return Boolean(query.q || query.status || query.level || query.class || query.archived)
}
