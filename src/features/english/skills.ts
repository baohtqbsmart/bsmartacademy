import type { Enums } from "@/types/database"

export type EnglishSkill = Enums<"english_skill">
export type PartOfSpeech = Enums<"part_of_speech">
export type VocabularyActivity = Enums<"vocabulary_activity">
export type ContentStatus = Enums<"content_status">
export type ResponseMode = Enums<"response_mode">

export const ENGLISH_SKILLS = [
  "vocabulary",
  "grammar",
  "reading",
  "listening",
  "speaking",
  "writing",
  "pronunciation",
] as const satisfies readonly EnglishSkill[]

export const LESSON_SKILLS = ENGLISH_SKILLS.filter((s) => s !== "vocabulary") as Exclude<EnglishSkill, "vocabulary">[]
export type LessonSkill = Exclude<EnglishSkill, "vocabulary">

export const SKILL_LABELS: Record<EnglishSkill, string> = {
  vocabulary: "Vocabulary",
  grammar: "Grammar",
  reading: "Reading",
  listening: "Listening",
  speaking: "Speaking",
  writing: "Writing",
  pronunciation: "Pronunciation",
}

/** Skills whose lessons collect work for a teacher; the others have exercises. */
export const WORK_SKILLS = ["speaking", "writing", "pronunciation"] as const
export const isWorkSkill = (skill: EnglishSkill) => (WORK_SKILLS as readonly string[]).includes(skill)

export const PARTS_OF_SPEECH = [
  "noun",
  "verb",
  "adjective",
  "adverb",
  "pronoun",
  "preposition",
  "conjunction",
  "determiner",
  "interjection",
  "phrasal_verb",
  "phrase",
  "idiom",
] as const satisfies readonly PartOfSpeech[]

export const PART_OF_SPEECH_LABELS: Record<PartOfSpeech, string> = {
  noun: "noun",
  verb: "verb",
  adjective: "adjective",
  adverb: "adverb",
  pronoun: "pronoun",
  preposition: "preposition",
  conjunction: "conjunction",
  determiner: "determiner",
  interjection: "interjection",
  phrasal_verb: "phrasal verb",
  phrase: "phrase",
  idiom: "idiom",
}

export const ACTIVITIES = [
  "flashcards",
  "matching",
  "multiple_choice",
  "fill_blank",
  "spelling",
  "pronunciation",
] as const satisfies readonly VocabularyActivity[]

export const ACTIVITY_LABELS: Record<VocabularyActivity, { title: string; description: string }> = {
  flashcards: { title: "Flashcards", description: "See the word, recall its meaning, then check." },
  matching: { title: "Matching", description: "Match each word with its Vietnamese meaning." },
  multiple_choice: { title: "Multiple choice", description: "Choose the word that fits the definition." },
  fill_blank: { title: "Fill in the blank", description: "Complete the example sentence." },
  spelling: { title: "Spelling", description: "Listen and type the word." },
  pronunciation: { title: "Pronunciation", description: "Listen, record yourself, compare." },
}

export const RESPONSE_MODE_LABELS: Record<ResponseMode, string> = {
  text: "Written answer",
  audio: "Audio recording",
  video: "Video recording",
  audio_or_video: "Audio or video recording",
}

export const STATUS_LABELS: Record<ContentStatus, string> = { draft: "Draft", published: "Published", archived: "Archived" }

// ---------------------------------------------------------------------------
// Practice rounds (vocabulary answers are not secret: they are on the word
// cards, so rounds are built and checked in the browser and only the results
// are recorded)
// ---------------------------------------------------------------------------

export type PracticeWord = {
  id: string
  word: string
  ipa: string | null
  part_of_speech: PartOfSpeech
  meaning_vi: string
  definition_en: string | null
  example: string | null
  audioUrl: string | null
  imageUrl: string | null
}

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Case, spacing and a final full stop do not matter. */
export function sameAnswer(given: string, expected: string) {
  const normalize = (s: string) =>
    s
      .normalize("NFC")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[.!?]+$/, "")
      .toLowerCase()
  return normalize(given) !== "" && normalize(given) === normalize(expected)
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * The example sentence with the word blanked out ("The ___ jumped."), or null
 * when the example does not contain the word (also plural -s/-es).
 */
export function blankExample(word: string, example: string | null) {
  if (!example) return null
  const pattern = new RegExp(`\\b${escapeRegExp(word)}(es|s)?\\b`, "i")
  const match = pattern.exec(example)
  if (!match) return null
  return { sentence: example.replace(pattern, "___"), answer: match[0] }
}

export type ChoiceQuestion = { wordId: string; prompt: string; options: string[]; answer: string }

/** "Which word means …?" with 3 distractors from the same set. */
export function buildChoiceQuestions(words: PracticeWord[], random: () => number = Math.random): ChoiceQuestion[] {
  return shuffle(words, random).map((w) => {
    const distractors = shuffle(
      words.filter((o) => o.id !== w.id && o.word.toLowerCase() !== w.word.toLowerCase()).map((o) => o.word),
      random
    ).slice(0, 3)
    return {
      wordId: w.id,
      prompt: w.definition_en || w.meaning_vi,
      options: shuffle([w.word, ...distractors], random),
      answer: w.word,
    }
  })
}

export type BlankQuestion = { wordId: string; sentence: string; answer: string; hint: string }

/** Fill-in questions for the words whose example contains them. */
export function buildBlankQuestions(words: PracticeWord[], random: () => number = Math.random): BlankQuestion[] {
  return shuffle(words, random).flatMap((w) => {
    const blanked = blankExample(w.word, w.example)
    return blanked ? [{ wordId: w.id, sentence: blanked.sentence, answer: blanked.answer, hint: w.meaning_vi }] : []
  })
}

// ---------------------------------------------------------------------------
// Skill profile (dashboard)
// ---------------------------------------------------------------------------

export type SkillRow = { skill: EnglishSkill; activities: number; average_percent: number | null; last_activity: string | null }

/** Every skill in a fixed order, with gaps for skills not practised yet. */
export function skillProfile(rows: { skill: EnglishSkill; activities: number | string; average_percent: number | string | null; last_activity: string | null }[]): SkillRow[] {
  const bySkill = new Map(rows.map((r) => [r.skill, r]))
  return ENGLISH_SKILLS.map((skill) => {
    const row = bySkill.get(skill)
    return {
      skill,
      activities: row ? Number(row.activities) : 0,
      average_percent: row?.average_percent === null || row?.average_percent === undefined ? null : Number(row.average_percent),
      last_activity: row?.last_activity ?? null,
    }
  })
}

/** The practised skill with the lowest average, then any skill never practised. */
export function weakestSkill(profile: SkillRow[]): EnglishSkill | null {
  const practised = profile.filter((p) => p.average_percent !== null)
  if (practised.length > 0) return [...practised].sort((a, b) => a.average_percent! - b.average_percent!)[0].skill
  return profile[0]?.skill ?? null
}

/** Leitner boxes 4–5 count as learnt. */
export const MASTERED_BOX = 4
