"use client"

import { createRoot } from "react-dom/client"

import { PageView, type AssetUrls } from "@/features/designer/components/page-view"
import { PAGE_SIZES, type DesignContent } from "@/features/designer/model"

/**
 * Export formats. PDF and PNG are rendered in the browser from the same page
 * renderer as the editor. PowerPoint and Word are NOT available: a faithful
 * conversion of positioned text, tables, icons and questions has not been
 * built and verified, so the app does not offer a partial file that looks
 * like a PowerPoint but is not one.
 */
export const EXPORT_FORMATS = {
  pdf: { label: "PDF document", supported: true, note: "All pages, one per PDF page. Pages are pictures, so text is not selectable." },
  png: { label: "PNG image", supported: true, note: "The current page as a picture." },
  pptx: { label: "PowerPoint (.pptx)", supported: false, note: "Not available yet — a reliable PowerPoint conversion has not been built. Use PDF, or present from BSmart." },
  docx: { label: "Word (.docx)", supported: false, note: "Not available." },
} as const

export type ExportFormat = keyof typeof EXPORT_FORMATS

/** Audio and video become labelled placeholders; they cannot play in a PDF or picture. */
export const EXPORT_MEDIA_NOTE = "Audio and video appear as labelled placeholders."

function safeFileName(title: string) {
  return (title.trim().replace(/[\\/:*?"<>|]+/g, "").replace(/\s+/g, " ").slice(0, 80) || "design").trim()
}

function download(url: string, name: string) {
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Renders the pages off-screen, waits for pictures, then hands each page element to `capture`. */
async function withRenderedPages<T>(content: DesignContent, assets: AssetUrls, pageIndexes: number[], showAnswers: boolean, capture: (nodes: HTMLElement[]) => Promise<T>) {
  const host = document.createElement("div")
  host.setAttribute("aria-hidden", "true")
  host.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;"
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    root.render(
      <div>
        {pageIndexes.map((i) => (
          <PageView key={content.pages[i].id} page={content.pages[i]} pageSize={content.pageSize} assets={assets} mode="export" showAnswers={showAnswers} />
        ))}
      </div>
    )
    // Let React commit, then wait for every picture to load.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
    await Promise.all([...host.querySelectorAll("img")].map((img) => img.decode().catch(() => undefined)))
    const nodes = [...host.querySelectorAll<HTMLElement>("[data-design-page]")]
    return await capture(nodes)
  } finally {
    root.unmount()
    host.remove()
  }
}

export async function exportDesign(options: {
  format: "pdf" | "png"
  content: DesignContent
  assets: AssetUrls
  title: string
  pageIndex: number
  showAnswers: boolean
}) {
  const { content, assets, format, showAnswers } = options
  const size = PAGE_SIZES[content.pageSize]
  const name = safeFileName(options.title) + (showAnswers ? " (answers)" : "")
  const { toJpeg, toPng } = await import("html-to-image")
  const imageOptions = { width: size.width, height: size.height, pixelRatio: 2, skipFonts: true, cacheBust: false }

  if (format === "png") {
    const dataUrl = await withRenderedPages(content, assets, [options.pageIndex], showAnswers, ([node]) => toPng(node, imageOptions))
    download(dataUrl, `${name} - page ${options.pageIndex + 1}.png`)
    return
  }

  const { jsPDF } = await import("jspdf")
  const orientation = size.width >= size.height ? "landscape" : "portrait"
  const pdf = new jsPDF({ orientation, unit: "px", format: [size.width, size.height], hotfixes: ["px_scaling"], compress: true })
  const indexes = content.pages.map((_, i) => i)
  await withRenderedPages(content, assets, indexes, showAnswers, async (nodes) => {
    for (const [i, node] of nodes.entries()) {
      const jpeg = await toJpeg(node, { ...imageOptions, quality: 0.92, backgroundColor: content.pages[i].background })
      if (i > 0) pdf.addPage([size.width, size.height], orientation)
      pdf.addImage(jpeg, "JPEG", 0, 0, size.width, size.height)
    }
  })
  pdf.setProperties({ title: options.title, creator: "BSmart Academy lesson designer" })
  pdf.save(`${name}.pdf`)
}
