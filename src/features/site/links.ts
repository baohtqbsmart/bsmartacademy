import { routes } from "@/config/routes"

/** Website navigation (header, mobile menu, footer). Only pages that exist. */
export const PUBLIC_LINKS = [
  { title: "Home", href: routes.home },
  { title: "Courses", href: routes.programs },
  { title: "Resources", href: routes.resources },
  { title: "About us", href: routes.about },
  { title: "Contact", href: routes.contact },
] as const
