import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Where the browser may talk to Supabase (API, storage, realtime).
const supabase = (() => {
  try {
    const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    return { http: url.origin, ws: `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}` };
  } catch {
    return null;
  }
})();

/**
 * Content Security Policy. Scripts and styles allow inline code because the
 * Next.js App Router bootstraps with inline scripts (a nonce-based policy
 * would need per-request rendering); everything else is locked down: no
 * plug-ins, no framing of this site, forms post only to itself, and media,
 * images and frames come only from here, Supabase storage (signed URLs) and
 * the two video players the lesson designer embeds.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob:${supabase ? ` ${supabase.http}` : ""}`,
  `media-src 'self' blob:${supabase ? ` ${supabase.http}` : ""}`,
  "font-src 'self' data:",
  `connect-src 'self'${supabase ? ` ${supabase.http} ${supabase.ws}` : ""}${isDev ? " ws: http://localhost:*" : ""}`,
  `frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com${supabase ? ` ${supabase.http}` : ""}`,
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The microphone is used for speaking practice and assessments; nothing else.
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // Lesson designs are saved through a Server Action; the database allows
      // 1 MB of content (JSON is larger once encoded in the request).
      bodySizeLimit: "2mb",
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
