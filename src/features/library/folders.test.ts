import { describe, expect, it } from "vitest"

import { buildTree, descendantsOf, folderPaths, type FolderNode } from "@/features/library/folders"
import { isLibraryMime, parseTags, previewMode } from "@/features/library/catalog"

const f = (id: string, parentId: string | null, name: string): FolderNode => ({ id, parentId, name, scope: "personal", ownerId: "u" })
const folders = [f("a", null, "Flyers"), f("b", "a", "Unit 5"), f("c", "a", "Unit 4"), f("d", "c", "Tests"), f("e", null, "Grammar"), f("x", "hidden", "Shared child")]

describe("folders", () => {
  it("builds a sorted tree; folders under an invisible parent come to the top", () => {
    const tree = buildTree(folders)
    expect(tree.map((n) => n.name)).toEqual(["Flyers", "Grammar", "Shared child"])
    expect(tree[0].children.map((n) => n.name)).toEqual(["Unit 4", "Unit 5"])
    expect(tree[0].children[0].children[0]).toMatchObject({ name: "Tests", depth: 2 })
  })

  it("lists paths in tree order", () => {
    expect(folderPaths(folders).map((p) => p.path)).toEqual(["Flyers", "Flyers / Unit 4", "Flyers / Unit 4 / Tests", "Flyers / Unit 5", "Grammar", "Shared child"])
  })

  it("finds a folder's descendants", () => {
    expect([...descendantsOf(folders, "a")].sort()).toEqual(["a", "b", "c", "d"])
    expect([...descendantsOf(folders, "e")]).toEqual(["e"])
  })
})

describe("catalogue helpers", () => {
  it("accepts only library file types", () => {
    expect(isLibraryMime("application/pdf")).toBe(true)
    expect(isLibraryMime("video/quicktime")).toBe(true)
    expect(isLibraryMime("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")).toBe(false)
    expect(isLibraryMime("text/plain")).toBe(false)
  })

  it("previews what browsers can show, not Word or PowerPoint", () => {
    expect(["pdf", "image", "audio", "video", "document", "presentation"].map(previewMode)).toEqual(["pdf", "image", "audio", "video", null, null])
  })

  it("parses tags", () => {
    expect(parseTags(" Flyers, unit 4,, FLYERS ,x")).toEqual(["flyers", "unit 4", "x"])
  })
})
