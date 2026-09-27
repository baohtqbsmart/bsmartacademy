import { PageTransition } from "@/components/motion/page-transition"

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <PageTransition className="flex flex-1 flex-col gap-6">{children}</PageTransition>
}
