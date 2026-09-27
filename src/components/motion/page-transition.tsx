import { cn } from "@/lib/utils"

/**
 * Fade and a slight rise when a page opens (templates re-mount on navigation).
 * Pure CSS, so the page is never hidden waiting for JavaScript.
 */
export function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("animate-in fade-in slide-in-from-bottom-2 fill-mode-both duration-300 ease-out", className)}>{children}</div>
}
