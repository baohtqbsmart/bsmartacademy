import type { MetadataRoute } from "next"

/** The platform is private (sign-in required): ask crawlers not to index anything. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", disallow: "/" } }
}
