import { NextResponse, type NextRequest } from "next/server"

import { canRunReport, csvFileName, isReportKey, toCsv } from "@/features/reports/catalog"
import { parseReportFilters } from "@/features/reports/filters"
import { runReport } from "@/features/reports/server/report-service"
import { can } from "@/lib/auth/permissions"
import { getCurrentUser } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

/**
 * CSV download of a report: the same checks as the page (signed in,
 * reports.read, the report's own requirement) and the same RLS-bound data.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ report: string }> }) {
  const user = await getCurrentUser()
  if (!user) return new NextResponse("Sign in first.", { status: 401 })
  const { report } = await params
  if (!isReportKey(report) || !can(user.permissions, "reports.read") || !canRunReport(user.permissions, report)) {
    return new NextResponse("Not found.", { status: 404 })
  }
  const filters = parseReportFilters(report, request.nextUrl.searchParams)
  const result = await runReport(await createClient(), report, filters)
  return new NextResponse(toCsv(result.columns, result.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFileName(report, filters.from, filters.to)}"`,
      // Personal and financial data: never cached by browsers or proxies.
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
