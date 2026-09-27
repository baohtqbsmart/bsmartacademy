"use server"

import { refresh } from "next/cache"
import { redirect } from "next/navigation"

import { libraryMaterialPath, routes } from "@/config/routes"
import {
  archiveSchema,
  classShareSchema,
  createMaterialSchema,
  favoriteSchema,
  folderIdSchema,
  folderSchema,
  materialIdSchema,
  moveSchema,
  studentShareSchema,
  updateMaterialSchema,
  visibilitySchema,
} from "@/features/library/schemas"
import {
  createMaterial,
  deleteFolder,
  deleteMaterial,
  downloadUrl,
  moveMaterial,
  saveFolder,
  setArchived,
  setClassShare,
  setFavorite,
  setStudentShare,
  setVisibility,
  updateMaterial,
} from "@/features/library/server/library-service"
import { runAction } from "@/lib/action"
import { requirePermission } from "@/lib/auth/session"
import { createClient } from "@/lib/supabase/server"

// Each action re-checks the permission; the database decides ownership, who
// may share with which class or student, and who may read which file.

export async function createMaterialAction(input: unknown) {
  return runAction(createMaterialSchema, input, async (data) => {
    await requirePermission("library.write")
    const id = await createMaterial(await createClient(), data)
    redirect(libraryMaterialPath(id))
  })
}

export async function updateMaterialAction(input: unknown) {
  return runAction(updateMaterialSchema, input, async (data) => {
    await requirePermission("library.write")
    await updateMaterial(await createClient(), data)
    redirect(libraryMaterialPath(data.materialId))
  })
}

export async function archiveMaterialAction(input: unknown) {
  return runAction(archiveSchema, input, async ({ materialId, archived }) => {
    await requirePermission("library.write")
    await setArchived(await createClient(), materialId, archived)
    refresh()
  })
}

export async function deleteMaterialAction(input: unknown) {
  return runAction(materialIdSchema, input, async ({ materialId }) => {
    await requirePermission("library.write")
    await deleteMaterial(await createClient(), materialId)
    redirect(routes.library)
  })
}

export async function visibilityAction(input: unknown) {
  return runAction(visibilitySchema, input, async ({ materialId, visibility }) => {
    await requirePermission("library.write")
    await setVisibility(await createClient(), materialId, visibility)
    refresh()
  })
}

export async function moveMaterialAction(input: unknown) {
  return runAction(moveSchema, input, async ({ materialId, folderId }) => {
    await requirePermission("library.write")
    await moveMaterial(await createClient(), materialId, folderId)
    refresh()
  })
}

/** Teachers may assign materials they can use to their classes (not only their own uploads). */
export async function classShareAction(input: unknown) {
  return runAction(classShareSchema, input, async ({ materialId, classId, shared }) => {
    await requirePermission("library.read")
    await setClassShare(await createClient(), materialId, classId, shared)
    refresh()
  })
}

export async function studentShareAction(input: unknown) {
  return runAction(studentShareSchema, input, async ({ materialId, studentId, shared }) => {
    await requirePermission("library.read")
    await setStudentShare(await createClient(), materialId, studentId, shared)
    refresh()
  })
}

export async function favoriteAction(input: unknown) {
  return runAction(favoriteSchema, input, async ({ materialId, favorite }) => {
    const user = await requirePermission("library.read")
    await setFavorite(await createClient(), user.id, materialId, favorite)
    refresh()
  })
}

/** A fresh five-minute download link. */
export async function downloadAction(input: unknown) {
  return runAction(materialIdSchema, input, async ({ materialId }) => {
    await requirePermission("library.read")
    return downloadUrl(await createClient(), materialId)
  })
}

export async function saveFolderAction(input: unknown) {
  return runAction(folderSchema, input, async (data) => {
    await requirePermission("library.write")
    const id = await saveFolder(await createClient(), data)
    refresh()
    return id
  })
}

export async function deleteFolderAction(input: unknown) {
  return runAction(folderIdSchema, input, async ({ folderId }) => {
    await requirePermission("library.write")
    await deleteFolder(await createClient(), folderId)
    redirect(routes.library)
  })
}
