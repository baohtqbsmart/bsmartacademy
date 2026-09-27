export type RawSearchParams = Record<string, string | string[] | undefined>

/** First value of a query parameter, trimmed; undefined when absent or empty. */
export function firstParam(params: RawSearchParams, key: string) {
  const value = params[key]
  const first = (Array.isArray(value) ? value[0] : value)?.trim()
  return first ? first : undefined
}

/** A query parameter restricted to known values. */
export function enumParam<T extends string>(params: RawSearchParams, key: string, allowed: readonly T[]) {
  const value = firstParam(params, key)
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function uuidParam(params: RawSearchParams, key: string) {
  const value = firstParam(params, key)
  return value && UUID.test(value) ? value : undefined
}

/** Builds "path?a=1&b=2", dropping empty values. */
export function withParams(path: string, values: Record<string, string | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) if (value) params.set(key, value)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}
