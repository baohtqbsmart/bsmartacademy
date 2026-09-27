import { AtomIcon, BookOpenIcon, CalculatorIcon, FlaskConicalIcon, GlobeIcon, LanguagesIcon, MusicIcon, PaletteIcon, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export const SUBJECT_ICONS = ["book", "calculator", "atom", "flask", "languages", "globe", "music", "palette"] as const
export type SubjectIcon = (typeof SUBJECT_ICONS)[number]

export const SUBJECT_ICON_COMPONENTS: Record<SubjectIcon, LucideIcon> = {
  book: BookOpenIcon,
  calculator: CalculatorIcon,
  atom: AtomIcon,
  flask: FlaskConicalIcon,
  languages: LanguagesIcon,
  globe: GlobeIcon,
  music: MusicIcon,
  palette: PaletteIcon,
}

export const SUBJECT_ICON_LABELS: Record<SubjectIcon, string> = {
  book: "Book",
  calculator: "Mathematics",
  atom: "Physics",
  flask: "Chemistry",
  languages: "Languages",
  globe: "Geography",
  music: "Music",
  palette: "Art",
}

export function subjectIcon(value: string | null | undefined): SubjectIcon {
  return (SUBJECT_ICONS as readonly string[]).includes(value ?? "") ? (value as SubjectIcon) : "book"
}

/**
 * Cover picture for a subject: the photo an administrator uploaded, otherwise
 * a brand-coloured illustration drawn for the subject's icon. Decorative.
 */
export function SubjectArt({ icon, imageUrl, className }: { icon: string | null | undefined; imageUrl?: string | null; className?: string }) {
  const kind = subjectIcon(icon)
  return (
    <div className={cn("relative overflow-hidden", className)} aria-hidden>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- public storage URL chosen by staff
        <img src={imageUrl} alt="" loading="lazy" className="zoom-media size-full object-cover" />
      ) : (
        <svg viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" className="zoom-media size-full">
          {ART[kind]}
        </svg>
      )}
    </div>
  )
}

const chalk = { fill: "none", stroke: "#f5e6d3", strokeWidth: 2, strokeLinecap: "round" as const, opacity: 0.85 }

const ART: Record<SubjectIcon, React.ReactNode> = {
  calculator: (
    <>
      <rect width="320" height="180" fill="#1f3b33" />
      <rect x="8" y="8" width="304" height="164" rx="6" fill="none" stroke="#7b3f00" strokeWidth="6" />
      <g fill="#f5e6d3" fontFamily="Georgia, serif" opacity="0.9">
        <text x="34" y="62" fontSize="26">a² + b² = c²</text>
        <text x="190" y="58" fontSize="30" fontStyle="italic">∫ f(x) dx</text>
        <text x="40" y="128" fontSize="30">π ≈ 3,14</text>
        <text x="190" y="132" fontSize="24">√x · y = 12</text>
      </g>
      <path d="M36 146 q60 -24 118 0 t118 0" {...chalk} />
    </>
  ),
  atom: (
    <>
      <defs>
        <radialGradient id="art-atom" cx="50%" cy="50%" r="70%">
          <stop offset="0" stopColor="#2c4a86" />
          <stop offset="1" stopColor="#0f1a33" />
        </radialGradient>
      </defs>
      <rect width="320" height="180" fill="url(#art-atom)" />
      <g transform="translate(160 90)" fill="none" stroke="#d4a574" strokeWidth="3">
        <ellipse rx="92" ry="30" />
        <ellipse rx="92" ry="30" transform="rotate(60)" />
        <ellipse rx="92" ry="30" transform="rotate(120)" />
      </g>
      <circle cx="160" cy="90" r="12" fill="#f5e6d3" />
      <g fill="#f5e6d3" opacity="0.5">
        <circle cx="40" cy="30" r="1.5" />
        <circle cx="280" cy="40" r="2" />
        <circle cx="60" cy="150" r="1.5" />
        <circle cx="270" cy="150" r="1.5" />
      </g>
    </>
  ),
  flask: (
    <>
      <rect width="320" height="180" fill="#e8eef7" />
      <rect y="132" width="320" height="48" fill="#cfd9e8" />
      <g stroke="#1e2a44" strokeWidth="3" fill="none">
        <path d="M92 40 v40 l-30 54 h84 l-30 -54 v-40 z" />
        <path d="M160 30 v70 a24 24 0 1 0 22 0 v-70 z" />
        <path d="M228 50 v84 h28 v-84" />
      </g>
      <path d="M70 120 l-8 14 h84 l-8 -14 z" fill="#7b3f00" opacity="0.75" />
      <circle cx="171" cy="121" r="20" fill="#2e9a50" opacity="0.6" />
      <rect x="230" y="96" width="24" height="38" fill="#d4a574" />
    </>
  ),
  languages: (
    <>
      <rect width="320" height="180" fill="#f5e6d3" />
      <circle cx="250" cy="40" r="70" fill="#d4a574" opacity="0.45" />
      <rect x="36" y="44" width="130" height="62" rx="14" fill="#1e2a44" />
      <path d="M62 106 l-6 22 22 -22 z" fill="#1e2a44" />
      <text x="101" y="84" textAnchor="middle" fill="#f5e6d3" fontFamily="Georgia, serif" fontSize="28">Hello!</text>
      <rect x="170" y="92" width="120" height="54" rx="14" fill="#7b3f00" />
      <path d="M262 146 l8 20 -24 -20 z" fill="#7b3f00" />
      <text x="230" y="127" textAnchor="middle" fill="#f5e6d3" fontFamily="Georgia, serif" fontSize="24">Xin chào</text>
    </>
  ),
  book: (
    <>
      <rect width="320" height="180" fill="#efe4d2" />
      <path d="M160 50 q-50 -18 -100 0 v96 q50 -18 100 0 z" fill="#fbf7f1" stroke="#7b3f00" strokeWidth="3" />
      <path d="M160 50 q50 -18 100 0 v96 q-50 -18 -100 0 z" fill="#fbf7f1" stroke="#7b3f00" strokeWidth="3" />
      <g stroke="#d4a574" strokeWidth="2">
        <path d="M80 72 h60 M80 88 h60 M80 104 h48 M180 72 h60 M180 88 h60 M180 104 h48" />
      </g>
    </>
  ),
  globe: (
    <>
      <rect width="320" height="180" fill="#1e2a44" />
      <circle cx="160" cy="90" r="62" fill="#2c4a86" stroke="#d4a574" strokeWidth="3" />
      <g fill="none" stroke="#d4a574" strokeWidth="2" opacity="0.8">
        <ellipse cx="160" cy="90" rx="26" ry="62" />
        <path d="M98 90 h124 M106 60 h108 M106 120 h108" />
      </g>
    </>
  ),
  music: (
    <>
      <rect width="320" height="180" fill="#f5e6d3" />
      <g stroke="#1e2a44" strokeWidth="2" opacity="0.5">
        <path d="M20 60 h280 M20 76 h280 M20 92 h280 M20 108 h280 M20 124 h280" />
      </g>
      <g fill="#7b3f00">
        <ellipse cx="110" cy="118" rx="12" ry="9" />
        <rect x="120" y="58" width="4" height="60" />
        <ellipse cx="200" cy="102" rx="12" ry="9" />
        <rect x="210" y="42" width="4" height="60" />
        <path d="M124 58 l90 -16 v10 l-90 16 z" />
      </g>
    </>
  ),
  palette: (
    <>
      <rect width="320" height="180" fill="#fbf7f1" />
      <path d="M160 36 c-60 0 -96 38 -96 64 c0 30 28 44 52 38 c14 -4 20 8 14 18 c-6 12 8 20 30 20 c60 0 92 -40 92 -76 c0 -38 -40 -64 -92 -64 z" fill="#d4a574" />
      <circle cx="120" cy="80" r="11" fill="#7b3f00" />
      <circle cx="160" cy="62" r="11" fill="#1e2a44" />
      <circle cx="202" cy="76" r="11" fill="#2e9a50" />
      <circle cx="214" cy="116" r="11" fill="#fbf7f1" />
    </>
  ),
}
