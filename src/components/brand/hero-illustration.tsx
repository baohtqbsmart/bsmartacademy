import { cn } from "@/lib/utils"

/**
 * Default hero picture (a student learning online with headphones and a
 * laptop), drawn in the brand palette. Administrators can replace it with a
 * photo from Website settings.
 */
export function HeroIllustration({ className, title }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 560 460" className={cn("h-auto w-full", className)} {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}>
      <defs>
        <linearGradient id="hero-bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#f5e6d3" />
          <stop offset="1" stopColor="#ead3b6" />
        </linearGradient>
        <linearGradient id="hero-screen" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2c4a86" />
          <stop offset="1" stopColor="#1e2a44" />
        </linearGradient>
      </defs>

      {/* Backdrop and window light */}
      <rect x="20" y="20" width="520" height="420" rx="36" fill="url(#hero-bg)" />
      <rect x="330" y="56" width="160" height="120" rx="12" fill="#fbf7f1" opacity="0.7" />
      <path d="M410 56 v120 M330 116 h160" stroke="#ead3b6" strokeWidth="6" />
      {/* Plant */}
      <path d="M90 300 q-6 -60 30 -96 q-8 44 -14 96z" fill="#2e9a50" opacity="0.8" />
      <path d="M100 300 q20 -54 64 -70 q-26 34 -48 70z" fill="#2e9a50" opacity="0.6" />
      <rect x="84" y="296" width="44" height="40" rx="8" fill="#7b3f00" />

      {/* Student */}
      <path d="M190 400 q10 -120 90 -130 q80 10 92 130z" fill="#7b3f00" />
      <path d="M252 272 h56 v26 q-28 16 -56 0z" fill="#e7b58f" />
      <ellipse cx="280" cy="206" rx="54" ry="62" fill="#f2c9a5" />
      {/* Hair */}
      <path d="M224 206 q-4 -84 60 -84 q58 2 56 80 q-10 -44 -52 -50 q-40 4 -64 54z" fill="#2a1d12" />
      <path d="M226 200 q-10 70 18 110 q-30 -6 -34 -60z" fill="#2a1d12" />
      <path d="M334 200 q10 70 -16 110 q30 -6 32 -60z" fill="#2a1d12" />
      {/* Face */}
      <path d="M258 214 q6 -6 12 0 M292 214 q6 -6 12 0" stroke="#2a1d12" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <path d="M268 240 q12 10 24 0" stroke="#b5654b" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <circle cx="252" cy="232" r="7" fill="#e8a38a" opacity="0.5" />
      <circle cx="310" cy="232" r="7" fill="#e8a38a" opacity="0.5" />
      {/* Headphones */}
      <path d="M218 200 q0 -92 62 -92 q62 0 62 92" stroke="#1e2a44" strokeWidth="10" fill="none" strokeLinecap="round" />
      <rect x="206" y="190" width="26" height="46" rx="12" fill="#1e2a44" />
      <rect x="328" y="190" width="26" height="46" rx="12" fill="#1e2a44" />

      {/* Desk and laptop */}
      <rect x="120" y="360" width="340" height="16" rx="8" fill="#5a2e00" />
      <path d="M200 360 l20 -84 h140 l20 84z" fill="#d7dce6" />
      <path d="M212 352 l16 -66 h124 l16 66z" fill="url(#hero-screen)" />
      <g fill="#f5e6d3">
        <rect x="244" y="302" width="72" height="8" rx="4" opacity="0.9" />
        <rect x="236" y="318" width="96" height="6" rx="3" opacity="0.5" />
        <rect x="236" y="330" width="64" height="6" rx="3" opacity="0.5" />
      </g>
      <circle cx="342" cy="306" r="8" fill="#2e9a50" />
      {/* Notebook and pen */}
      <rect x="386" y="340" width="70" height="20" rx="4" fill="#fbf7f1" transform="rotate(-6 420 350)" />
      <path d="M394 334 l58 -8" stroke="#1e2a44" strokeWidth="4" strokeLinecap="round" />

      {/* Floating accents */}
      <g fontFamily="Georgia, serif" fill="#7b3f00">
        <text x="60" y="110" fontSize="30" fontStyle="italic">A+</text>
        <text x="448" y="238" fontSize="26">★</text>
      </g>
      <circle cx="120" cy="170" r="10" fill="#1e2a44" opacity="0.15" />
      <circle cx="470" cy="300" r="14" fill="#7b3f00" opacity="0.12" />
    </svg>
  )
}
