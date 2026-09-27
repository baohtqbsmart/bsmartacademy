import { redirect } from "next/navigation"

import { routes } from "@/config/routes"

/** Articles are listed on the Resources page. */
export default function ArticlesPage() {
  redirect(`${routes.resources}?tab=articles`)
}
