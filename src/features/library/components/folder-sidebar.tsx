import { FolderIcon, FolderOpenIcon, InboxIcon } from "lucide-react"
import Link from "next/link"

import { DeleteFolderButton, FolderDialog } from "@/features/library/components/folder-controls"
import { buildTree, descendantsOf, folderPaths, type FolderNode, type FolderTree } from "@/features/library/folders"
import { cn } from "@/lib/utils"

/** Folder navigation for staff: "My folders" and "Academy folders". */
export function FolderSidebar({
  folders,
  current,
  hrefFor,
  userId,
  canManageAcademy,
}: {
  folders: FolderNode[]
  current: string | undefined
  hrefFor: (folder: string | undefined) => string
  userId: string
  canManageAcademy: boolean
}) {
  const mine = folders.filter((f) => f.scope === "personal" && f.ownerId === userId)
  const academy = folders.filter((f) => f.scope === "academy")
  const others = folders.filter((f) => f.scope === "personal" && f.ownerId !== userId)
  const paths = [...folderPaths(mine).map((p) => ({ ...p, scope: "personal" as const })), ...(canManageAcademy ? folderPaths(academy).map((p) => ({ ...p, scope: "academy" as const })) : [])]
  const canEdit = (f: FolderNode) => (f.scope === "personal" ? f.ownerId === userId : canManageAcademy)

  const item = (node: FolderTree): React.ReactNode => {
    const active = current === node.id
    const Icon = active ? FolderOpenIcon : FolderIcon
    const blocked = descendantsOf(folders, node.id)
    return (
      <li key={node.id}>
        <div className={cn("group flex items-center gap-1 rounded-md pr-1", active && "bg-muted")} style={{ paddingLeft: node.depth * 12 }}>
          <Link href={hrefFor(node.id)} aria-current={active ? "page" : undefined} className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1 text-sm">
            <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <span className="truncate">{node.name}</span>
          </Link>
          {active && canEdit(node) && (
            <>
              <FolderDialog scope={node.scope} parents={paths.filter((p) => !blocked.has(p.id))} initial={{ folderId: node.id, name: node.name, parentId: node.parentId }} canManageAcademy={canManageAcademy} />
              <DeleteFolderButton folderId={node.id} name={node.name} />
            </>
          )}
        </div>
        {node.children.length > 0 && <ul>{node.children.map(item)}</ul>}
      </li>
    )
  }

  return (
    <nav aria-label="Folders" className="grid gap-4">
      <Link href={hrefFor(undefined)} aria-current={current === undefined ? "page" : undefined} className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-sm", current === undefined && "bg-muted")}>
        <InboxIcon className="text-muted-foreground size-4" aria-hidden /> All folders
      </Link>
      <Link href={hrefFor("root")} aria-current={current === "root" ? "page" : undefined} className={cn("-mt-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-sm", current === "root" && "bg-muted")}>
        <FolderIcon className="text-muted-foreground size-4" aria-hidden /> Not in a folder
      </Link>
      <Section title="My folders" tree={buildTree(mine)} item={item} empty="No folders yet." />
      <Section title="Academy folders" tree={buildTree(academy)} item={item} empty="None yet." />
      {others.length > 0 && <Section title="Teachers' folders" tree={buildTree(others)} item={item} empty="" />}
      <FolderDialog scope="personal" parents={paths} canManageAcademy={canManageAcademy} />
    </nav>
  )
}

function Section({ title, tree, item, empty }: { title: string; tree: FolderTree[]; item: (n: FolderTree) => React.ReactNode; empty: string }) {
  return (
    <div className="grid gap-1">
      <h2 className="text-muted-foreground px-2 text-xs font-semibold tracking-wide uppercase">{title}</h2>
      {tree.length === 0 ? <p className="text-muted-foreground px-2 text-xs">{empty}</p> : <ul>{tree.map(item)}</ul>}
    </div>
  )
}
