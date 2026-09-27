import type { Instrumentation } from "next"

/**
 * Server-side error reporting. Every unhandled error in a page, layout,
 * Server Action or route handler is written as one JSON line, which Vercel
 * keeps in its runtime logs (and forwards to any configured log drain or
 * monitoring service). Users only ever see the generic error page with the
 * `digest`, which support can search for in the logs.
 *
 * No personal data: query strings are dropped (they can carry e-mail link
 * tokens) and share-link tokens in paths are redacted. Error messages come
 * from our own code and database messages, which never contain secrets.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  const err = error as Error & { digest?: string }
  const path = request.path.split("?")[0].replace(/(\/designs\/shared\/)[^/]+/, "$1[token]")
  console.error(
    JSON.stringify({
      level: "error",
      source: "next",
      digest: err.digest ?? null,
      name: err.name,
      message: err.message?.slice(0, 500),
      method: request.method,
      path,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      at: new Date().toISOString(),
    })
  )
}
