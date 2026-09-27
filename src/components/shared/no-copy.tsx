"use client"

import { cn } from "@/lib/utils"

/**
 * Discourages copying (text selection, copy, context menu, dragging) for
 * viewers who may read but not keep a material. It is a deterrent, not DRM:
 * anything shown on a screen can still be photographed.
 */
export function NoCopy({ children, className }: { children: React.ReactNode; className?: string }) {
  const block = (event: React.SyntheticEvent) => event.preventDefault()
  return (
    <div className={cn("select-none", className)} onCopy={block} onCut={block} onContextMenu={block} onDragStart={block}>
      {children}
    </div>
  )
}
