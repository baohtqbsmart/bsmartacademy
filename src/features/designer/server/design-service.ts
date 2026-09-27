import "server-only"

import type { z } from "zod"

import { discardUpload, verifyUpload } from "@/features/assignments/server/file-service"
import { blankContent, contentSchema, pageSchema, type DesignContent, type DesignKind, type PageSizeId } from "@/features/designer/model"
import type { createDesignSchema, saveDesignSchema } from "@/features/designer/schemas"
import { AppError, fromPostgrestError } from "@/lib/errors"
import { BUCKETS } from "@/lib/storage"
import type { DbClient } from "@/lib/supabase/types"
import type { Json } from "@/types/database"

// Every query runs as the caller: RLS shows teachers their own designs and
// admins all of them; shared copies come only through shared_design().

/** Long enough for an editing session; links are re-signed on every page load. */
const ASSET_URL_TTL_SECONDS = 6 * 60 * 60

export type AssetInfo = { id: string; url: string | null; mimeType: string; fileName: string; media: "image" | "audio" | "video" }

async function signPaths(db: DbClient, paths: string[]) {
  if (paths.length === 0) return new Map<string, string>()
  const { data, error } = await db.storage.from(BUCKETS.assignmentFiles).createSignedUrls(paths, ASSET_URL_TTL_SECONDS)
  if (error) {
    console.error("[designer] could not sign asset urls", error.message)
    return new Map<string, string>()
  }
  return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl] as const] : [])))
}

async function signAssets(db: DbClient, rows: { id: string; object_path: string; mime_type: string; file_name?: string }[]): Promise<Record<string, AssetInfo>> {
  const urls = await signPaths(db, rows.map((r) => r.object_path))
  return Object.fromEntries(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        url: urls.get(r.object_path) ?? null,
        mimeType: r.mime_type,
        fileName: r.file_name ?? "",
        media: r.mime_type.split("/")[0] as AssetInfo["media"],
      },
    ])
  )
}

/** Content from the database; older or damaged documents fall back to a blank page instead of crashing the editor. */
export function readContent(value: unknown, kind: DesignKind): DesignContent {
  const parsed = contentSchema.safeParse(value)
  return parsed.success ? parsed.data : blankContent(kind)
}

export async function listDesigns(db: DbClient, filters: { kind?: DesignKind; q?: string } = {}) {
  let query = db
    .from("designs")
    .select("id, title, kind, owner_id, owner_name, updated_at, share_token, pageSize:content->>pageSize, firstPage:content->pages->0")
    .order("updated_at", { ascending: false })
    .limit(200)
  if (filters.kind) query = query.eq("kind", filters.kind)
  if (filters.q) query = query.ilike("title", `%${filters.q.replace(/[%_\\]/g, "\\$&")}%`)
  const { data, error } = await query
  if (error) throw fromPostgrestError(error)

  // Thumbnails: the first page, with its pictures.
  const rows = data.map((d) => {
    const parsed = pageSchema.safeParse(d.firstPage)
    const firstPage = parsed.success ? parsed.data : null
    return { ...d, firstPage, pageSize: (d.pageSize ?? "slide") as PageSizeId }
  })
  const assetIds = [...new Set(rows.flatMap((r) => (r.firstPage?.elements ?? []).flatMap((el) => ("assetId" in el && el.assetId ? [el.assetId] : []))))]
  let assets: Record<string, AssetInfo> = {}
  if (assetIds.length > 0) {
    const { data: assetRows, error: assetError } = await db.from("design_assets").select("id, object_path, mime_type").in("id", assetIds)
    if (assetError) throw fromPostgrestError(assetError)
    assets = await signAssets(db, assetRows)
  }
  return { designs: rows, assets }
}

export type DesignListItem = Awaited<ReturnType<typeof listDesigns>>["designs"][number]

export async function listTemplates(db: DbClient) {
  const { data, error } = await db.from("design_templates").select("key, category, kind, name, description, content").order("sort_order")
  if (error) throw fromPostgrestError(error)
  return data.map((t) => ({ ...t, content: readContent(t.content, t.kind) }))
}

export type TemplateItem = Awaited<ReturnType<typeof listTemplates>>[number]

export async function getDesign(db: DbClient, id: string) {
  const [design, assets] = await Promise.all([
    db.from("designs").select("id, title, kind, owner_id, owner_name, content, version, share_token, template_key, updated_at").eq("id", id).maybeSingle(),
    db.from("design_assets").select("id, object_path, mime_type, file_name, created_at").eq("design_id", id).order("created_at"),
  ])
  if (design.error) throw fromPostgrestError(design.error)
  if (assets.error) throw fromPostgrestError(assets.error)
  if (!design.data) return null
  return { ...design.data, content: readContent(design.data.content, design.data.kind), assets: await signAssets(db, assets.data) }
}

export async function getSharedDesign(db: DbClient, token: string) {
  const [design, assets] = await Promise.all([db.rpc("shared_design", { token }), db.rpc("shared_design_assets", { token })])
  if (design.error) throw fromPostgrestError(design.error)
  if (assets.error) throw fromPostgrestError(assets.error)
  const row = design.data[0]
  if (!row) return null
  return { ...row, content: readContent(row.content, row.kind), assets: await signAssets(db, assets.data) }
}

export async function createDesign(db: DbClient, input: z.output<typeof createDesignSchema>) {
  let content: DesignContent = blankContent(input.kind, input.pageSize)
  if (input.templateKey) {
    const { data, error } = await db.from("design_templates").select("kind, content").eq("key", input.templateKey).maybeSingle()
    if (error) throw fromPostgrestError(error)
    if (!data) throw new AppError("NOT_FOUND", "Template not found.")
    content = readContent(data.content, data.kind)
  }
  const { data, error } = await db
    .from("designs")
    .insert({ title: input.title, kind: input.kind, template_key: input.templateKey, content: content as unknown as Json })
    .select("id")
    .single()
  if (error) throw fromPostgrestError(error)
  return data.id
}

export async function saveDesign(db: DbClient, input: z.output<typeof saveDesignSchema>) {
  const { data, error } = await db
    .from("designs")
    .update({ title: input.title, kind: input.kind, content: input.content as unknown as Json })
    .eq("id", input.designId)
    .eq("version", input.version)
    .select("version")
  if (error) throw fromPostgrestError(error)
  if (data.length === 1) return data[0].version

  const { data: current } = await db.from("designs").select("version").eq("id", input.designId).maybeSingle()
  if (!current) throw new AppError("NOT_FOUND", "Design not found, or you may not change it.")
  throw new AppError("CONFLICT", "This design was changed somewhere else (another tab or person). Reload to get the latest version; your unsaved changes here will be lost.")
}

export async function deleteDesign(db: DbClient, designId: string) {
  const { data: assets, error } = await db.from("design_assets").select("object_path").eq("design_id", designId)
  if (error) throw fromPostgrestError(error)
  // Files first: the storage policy needs the design to still exist.
  if (assets.length > 0) {
    const { error: removeError } = await db.storage.from(BUCKETS.assignmentFiles).remove(assets.map((a) => a.object_path))
    if (removeError) console.error("[designer] could not remove files", removeError.message)
  }
  const { data, error: deleteError } = await db.from("designs").delete().eq("id", designId).select("id")
  if (deleteError) throw fromPostgrestError(deleteError)
  if (data.length === 0) throw new AppError("NOT_FOUND", "Design not found, or you may not delete it.")
}

export async function recordAsset(db: DbClient, input: { designId: string; objectPath: string; fileName: string }): Promise<AssetInfo> {
  const file = await verifyUpload(db, input.objectPath, input.fileName)
  const { data, error } = await db
    .from("design_assets")
    .insert({ design_id: input.designId, object_path: input.objectPath, file_name: file.fileName, mime_type: file.mimeType, size_bytes: file.sizeBytes })
    .select("id, object_path, mime_type, file_name")
    .single()
  if (error) {
    await discardUpload(db, input.objectPath)
    throw fromPostgrestError(error)
  }
  return (await signAssets(db, [data]))[data.id]
}

export async function removeAsset(db: DbClient, assetId: string) {
  const { data, error } = await db.from("design_assets").delete().eq("id", assetId).select("object_path")
  if (error) throw fromPostgrestError(error)
  if (data.length === 0) throw new AppError("NOT_FOUND", "File not found.")
  await discardUpload(db, data[0].object_path)
}

export async function setSharing(db: DbClient, designId: string, mode: "on" | "off" | "reset") {
  const { data, error } = await db.rpc("set_design_sharing", { target_design_id: designId, mode })
  if (error) throw fromPostgrestError(error)
  return data
}

