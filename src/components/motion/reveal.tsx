"use client"

import { Children, cloneElement, isValidElement, useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"

/*
 * Entrance motion that never hides content from people without JavaScript (or
 * from search engines): everything renders visible; only sections still below
 * the fold are hidden after hydration and fade up once when scrolled to.
 * Durations collapse to zero under prefers-reduced-motion (globals.css).
 */

function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [hidden, setHidden] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") return
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return
    setHidden(true)
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setHidden(false)
          observer.disconnect()
        }
      },
      { rootMargin: "0px 0px -60px 0px" }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return { ref, hidden }
}

const HIDDEN = "translate-y-6 opacity-0"
const SHOWN = "translate-y-0 opacity-100 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"

/** A section that fades up once when it scrolls into view. */
export function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, hidden } = useRevealOnScroll<HTMLDivElement>()
  return (
    <div ref={ref} className={cn(className, hidden ? HIDDEN : SHOWN)} style={{ transitionDelay: `${delay}s` }}>
      {children}
    </div>
  )
}

/**
 * Children appear one after another: on load (CSS animation, no JavaScript
 * needed) or, with `inView`, when the list scrolls into view.
 */
export function Stagger({ children, className, inView = false }: { children: React.ReactNode; className?: string; inView?: boolean }) {
  const { ref, hidden } = useRevealOnScroll<HTMLDivElement>()
  const items = Children.map(children, (child, index) =>
    isValidElement<{ index?: number; hidden?: boolean; onLoad?: boolean }>(child)
      ? cloneElement(child, { index, hidden: inView && hidden, onLoad: !inView })
      : child
  )
  return (
    <div ref={inView ? ref : undefined} className={className}>
      {items}
    </div>
  )
}

export function StaggerItem({
  children,
  className,
  index = 0,
  hidden = false,
  onLoad = false,
}: {
  children: React.ReactNode
  className?: string
  index?: number
  hidden?: boolean
  onLoad?: boolean
}) {
  const delay = `${Math.min(index, 8) * 70}ms`
  if (onLoad) {
    return (
      <div className={cn("animate-in fade-in slide-in-from-bottom-3 fill-mode-both duration-500", className)} style={{ animationDelay: delay }}>
        {children}
      </div>
    )
  }
  return (
    <div className={cn(className, hidden ? HIDDEN : SHOWN)} style={{ transitionDelay: hidden ? "0ms" : delay }}>
      {children}
    </div>
  )
}

/** A progress bar that fills from 0 to its value (CSS, visible without JavaScript). */
export function ProgressFill({ value, className }: { value: number; className?: string }) {
  const width = `${Math.max(0, Math.min(100, value))}%`
  return <span className={cn("animate-grow-x block h-full origin-left", className)} style={{ width }} />
}
