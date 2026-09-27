/** Folder rows as the UI needs them (pure helpers, unit-tested). */
export type FolderNode = { id: string; scope: "personal" | "academy"; ownerId: string | null; parentId: string | null; name: string }

export function toFolderNodes(rows: { id: string; scope: "personal" | "academy"; owner_id: string | null; parent_id: string | null; name: string }[]): FolderNode[] {
  return rows.map((r) => ({ id: r.id, scope: r.scope, ownerId: r.owner_id, parentId: r.parent_id, name: r.name }))
}

export type FolderTree = FolderNode & { children: FolderTree[]; depth: number }

/** Nested folders, sorted by name at each level. */
export function buildTree(folders: FolderNode[]): FolderTree[] {
  const byParent = new Map<string | null, FolderNode[]>()
  for (const f of folders) byParent.set(f.parentId, [...(byParent.get(f.parentId) ?? []), f])
  const known = new Set(folders.map((f) => f.id))
  const build = (parent: string | null, depth: number): FolderTree[] =>
    (byParent.get(parent) ?? [])
      .sort((a, b) => a.name.localeCompare(b.name, "vi"))
      .map((f) => ({ ...f, depth, children: depth < 10 ? build(f.id, depth + 1) : [] }))
  // Folders whose parent is not visible are shown at the top.
  const roots = folders.filter((f) => f.parentId === null || !known.has(f.parentId)).map((f) => f.parentId)
  return [...new Set(roots)].flatMap((p) => build(p, 0))
}

/** "Flyers 2026A / Unit 4 – Animals" for every folder, in tree order. */
export function folderPaths(folders: FolderNode[]) {
  const out: { id: string; path: string; depth: number }[] = []
  const walk = (nodes: FolderTree[], prefix: string) => {
    for (const n of nodes) {
      const path = prefix ? `${prefix} / ${n.name}` : n.name
      out.push({ id: n.id, path, depth: n.depth })
      walk(n.children, path)
    }
  }
  walk(buildTree(folders), "")
  return out
}

/** A folder and everything below it (a folder cannot move into these). */
export function descendantsOf(folders: FolderNode[], id: string) {
  const result = new Set([id])
  let grew = true
  while (grew) {
    grew = false
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id)
        grew = true
      }
    }
  }
  return result
}
