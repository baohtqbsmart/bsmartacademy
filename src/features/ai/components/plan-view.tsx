import { EXERCISE_LABELS, STAGE_NAMES, STAGES, type LessonPlan } from "@/features/ai/content"
import { getT } from "@/i18n/server"

/** Read-only, printable lesson plan (approved or discarded drafts, and print). */
export async function PlanView({ plan }: { plan: LessonPlan }) {
  const t = await getT()
  return (
    <article className="grid gap-6 text-sm">
      <section>
        <h2 className="text-xl font-semibold">{t(plan.title)}</h2>
        <p className="text-muted-foreground mt-1">{t(plan.summary)}</p>
      </section>
      <Block title={t("Learning objectives")}>
        <List items={plan.objectives} />
      </Block>
      {STAGES.map((s) => (
        <Block key={s} title={t("{value} · {minutes} min", { value: STAGE_NAMES[s], minutes: plan[s].minutes })}>
          <List items={plan[s].steps} ordered />
          {plan[s].materials.length > 0 && <p className="text-muted-foreground mt-1">{t("Materials: {materials}", { materials: plan[s].materials.join(", ") })}</p>}
          {plan[s].teacherNotes && <p className="text-muted-foreground mt-1 italic">{t("Notes: {teacherNotes}", { teacherNotes: plan[s].teacherNotes })}</p>}
        </Block>
      ))}
      {plan.vocabulary.length > 0 && (
        <Block title={t("Vocabulary")}>
          <table className="w-full text-left">
            <thead className="text-muted-foreground text-xs">
              <tr>
                <th className="py-1 pr-2 font-medium">{t("Word")}</th>
                <th className="py-1 pr-2 font-medium">{t("Meaning")}</th>
                <th className="py-1 font-medium">{t("Example")}</th>
              </tr>
            </thead>
            <tbody>
              {plan.vocabulary.map((v, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="py-1 pr-2">
                    <span className="font-medium">{v.word}</span> <span className="text-muted-foreground">({v.partOfSpeech})</span>
                    {v.vietnamese && <span className="block text-xs">{v.vietnamese}</span>}
                  </td>
                  <td className="py-1 pr-2">{v.meaning}</td>
                  <td className="py-1 italic">{v.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Block>
      )}
      {plan.readingText && (
        <Block title={t("Reading text")}>
          <p className="font-serif whitespace-pre-wrap">{plan.readingText}</p>
        </Block>
      )}
      {plan.listeningScript && (
        <Block title={t("Listening script (for the teacher)")}>
          <p className="whitespace-pre-wrap">{plan.listeningScript}</p>
        </Block>
      )}
      {plan.exercises.length > 0 && (
        <Block title={t("Exercises")}>
          <ol className="grid list-decimal gap-2 pl-5">
            {plan.exercises.map((e, i) => (
              <li key={i}>
                <span className="text-muted-foreground text-xs">{t(EXERCISE_LABELS[e.type])} · </span>
                {e.prompt}
                {e.options.length > 0 && <span className="block text-xs">{e.options.join(" · ")}</span>}
                <span className="block text-xs text-emerald-700 dark:text-emerald-400">{t("Answer: {answer}", { answer: e.answer })}</span>
                {e.explanation && <span className="text-muted-foreground block text-xs">{e.explanation}</span>}
              </li>
            ))}
          </ol>
        </Block>
      )}
      {plan.speakingPrompts.length > 0 && (
        <Block title={t("Speaking prompts")}>
          <List items={plan.speakingPrompts} />
        </Block>
      )}
      {plan.writingPrompt && (
        <Block title={t("Writing task")}>
          <p>{plan.writingPrompt.task}</p>
          <p className="text-muted-foreground mt-1">
            {t("{minWords}–{maxWords} words · Criteria: {criteria}", { minWords: plan.writingPrompt.minWords, maxWords: plan.writingPrompt.maxWords, criteria: plan.writingPrompt.criteria.join("; ") })}
          </p>
        </Block>
      )}
      {plan.differentiation && (
        <Block title={t("Differentiated activities")}>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["support", "core", "challenge"] as const).map((k) => (
              <div key={k}>
                <h4 className="font-medium capitalize">{k}</h4>
                <List items={plan.differentiation![k]} />
              </div>
            ))}
          </div>
        </Block>
      )}
      <Block title={t("Homework")}>
        <p>{plan.homework.instructions}</p>
        <List items={plan.homework.tasks} ordered />
      </Block>
    </article>
  )
}

async function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-1.5 font-semibold">{title}</h3>
      {children}
    </section>
  )
}

function List({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul"
  return (
    <Tag className={ordered ? "grid list-decimal gap-1 pl-5" : "grid list-disc gap-1 pl-5"}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </Tag>
  )
}
