import { BookOpenIcon, CheckCircle2Icon, CircleIcon, ClipboardListIcon, FileCheckIcon, FlameIcon, type LucideIcon } from "lucide-react"
import Link from "next/link"

import { ProgressFill } from "@/components/motion/reveal"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assignmentPath, lessonPath, testPath } from "@/config/routes"
import type { LearningPath, PathItem, Streak } from "@/features/progress/server/progress-service"
import { getT } from "@/i18n/server"
import { cn } from "@/lib/utils"

const KIND: Record<PathItem["kind"], { icon: LucideIcon; label: string; href: (id: string) => string }> = {
  lesson: { icon: BookOpenIcon, label: "Lesson", href: lessonPath },
  assignment: {
    icon: ClipboardListIcon,
    label: "Assignment",
    href: assignmentPath,
  },
  test: { icon: FileCheckIcon, label: "Test", href: testPath },
}

/** A class's modules with their lessons and work, ticked off as the student completes them. */
export async function LearningPathCard({ path, title }: { path: LearningPath; title?: string }) {
  const t = await getT()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title ?? t("Learning path")}</CardTitle>
        <CardDescription>
          {path.total === 0
            ? t("The teacher has not added lessons or work to this course yet.")
            : t("{done} of {total} done", {
                done: path.done,
                total: path.total,
              })}
        </CardDescription>
        {path.percent !== null && (
          <div className="mt-2 flex items-center gap-3">
            <span className="bg-muted block h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
              <ProgressFill value={path.percent} className="bg-success rounded-full" />
            </span>
            <span className="text-sm font-semibold tabular-nums">{path.percent}%</span>
          </div>
        )}
      </CardHeader>
      {path.total > 0 && (
        <CardContent>
          <ol className="grid gap-5">
            {path.modules.map((module, index) => {
              const done = module.items.filter((i) => i.done).length
              return (
                <li key={module.id ?? "other"} className="grid gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <h3 className="font-medium">
                      {module.id ? <span className="text-muted-foreground mr-1.5 tabular-nums">{index + 1}.</span> : null}
                      {module.id ? module.title : t(module.title)}
                    </h3>
                    {module.items.length > 0 && (
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {done}/{module.items.length}
                      </span>
                    )}
                  </div>
                  {module.description && <p className="text-muted-foreground text-sm">{module.description}</p>}
                  {module.items.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t("Nothing in this module yet.")}</p>
                  ) : (
                    <ul className="grid gap-1">
                      {module.items.map((item) => {
                        const kind = KIND[item.kind]
                        return (
                          <li key={`${item.kind}:${item.id}`}>
                            <Link
                              href={kind.href(item.id)}
                              className="hover:bg-muted/60 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors"
                            >
                              {item.done ? (
                                <CheckCircle2Icon className="text-success size-4 shrink-0" aria-label={t("Done")} />
                              ) : (
                                <CircleIcon className="text-muted-foreground size-4 shrink-0" aria-label={t("Not done yet")} />
                              )}
                              <kind.icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                              <span className={cn("min-w-0 flex-1 truncate", item.done && "text-muted-foreground")}>{item.title}</span>
                              <span className="text-muted-foreground hidden text-xs sm:inline">{t(kind.label)}</span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        </CardContent>
      )}
    </Card>
  )
}

/** Learning streak: consecutive days with real learning activity. */
export async function StreakCard({ streak, className }: { streak: Streak; className?: string }) {
  const t = await getT()
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FlameIcon className={cn("size-5", streak.current > 0 ? "text-orange-500" : "text-muted-foreground")} aria-hidden />
          {t("Learning streak")}
        </CardTitle>
        <CardDescription>
          {streak.current === 0
            ? t("Practise, hand in work or attend a class to start a streak.")
            : streak.activeToday
              ? t("You have learnt today. Keep it going!")
              : t("Learn something today to keep your streak.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex items-end gap-6">
          <div>
            <span className="font-heading text-4xl font-semibold tabular-nums">{streak.current}</span>
            <span className="text-muted-foreground ml-1 text-sm">{t("days in a row")}</span>
          </div>
          <div className="text-muted-foreground text-sm">{t("Best: {count} days", { count: streak.best })}</div>
        </div>
        <ol className="flex gap-1" aria-label={t("Last 14 days")}>
          {streak.recent.map((d) => (
            <li
              key={d.day}
              title={d.day}
              className={cn("h-6 flex-1 rounded-sm", d.active ? "bg-success" : "bg-muted")}
              aria-label={`${d.day}: ${d.active ? t("learnt") : t("no activity")}`}
            />
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}
