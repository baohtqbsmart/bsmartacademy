"use client"

import { useLayoutEffect, useState } from "react"

/** Scale that fits a width × height box inside the element (never above `max`). */
export function useFitScale(ref: React.RefObject<HTMLElement | null>, width: number, height: number, { padding = 0, max = 1, fitHeight = true } = {}) {
  const [scale, setScale] = useState(0)
  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    const measure = () => {
      const w = node.clientWidth - padding * 2
      const h = node.clientHeight - padding * 2
      const byWidth = w / width
      const next = fitHeight && h > 0 ? Math.min(byWidth, h / height) : byWidth
      setScale(Math.max(0.05, Math.min(max, next)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, width, height, padding, max, fitHeight])
  return scale
}
