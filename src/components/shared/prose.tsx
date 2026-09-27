import { cn } from "@/lib/utils"

/**
 * Plain text written by staff, shown as readable prose: blank lines separate
 * paragraphs, "## " starts a heading, lines starting with "- " or "• " form a
 * list. Everything is rendered as text (React escapes it); no HTML is parsed.
 */
export function Prose({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className={cn("grid gap-4 text-base leading-relaxed", className)}>
      {blocks.map((block, index) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={index} className="font-heading mt-2 text-2xl font-semibold">
              {block.slice(3)}
            </h2>
          )
        }
        const lines = block.split("\n")
        if (lines.every((line) => /^[-•]\s+/.test(line))) {
          return (
            <ul key={index} className="grid list-disc gap-1.5 pl-6">
              {lines.map((line, i) => (
                <li key={i}>{line.replace(/^[-•]\s+/, "")}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={index} className="whitespace-pre-line">
            {block}
          </p>
        )
      })}
    </div>
  )
}
