import type { MetadataRoute } from "next"

import { routes } from "@/config/routes"
import { getPublicEnv } from "@/lib/env"

/**
 * Only the public website is indexed; the learning platform behind sign-in
 * stays out of search engines (its pages also send noindex).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: ["/$", `${routes.programs}`, routes.about, routes.contact], disallow: "/" },
    sitemap: new URL("/sitemap.xml", getPublicEnv().NEXT_PUBLIC_SITE_URL).toString(),
  }
}
