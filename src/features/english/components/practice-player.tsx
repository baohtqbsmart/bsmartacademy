"use client"

import { CheckIcon, RotateCcwIcon, XIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { recordPracticeAction } from "@/features/english/actions"
import { AudioRecorder, SpeakButton } from "@/features/english/components/media"
import {
  ACTIVITY_LABELS,
  buildBlankQuestions,
  buildChoiceQuestions,
  PART_OF_SPEECH_LABELS,
  sameAnswer,
  shuffle,
  type PracticeWord,
  type VocabularyActivity,
} from "@/features/english/skills"
import { cn } from "@/lib/utils"

type Result = { wordId: string; correct: boolean }

const GOOD = "border-transparent bg-[#0ca30c]/12 text-[#006300] dark:text-[#0ca30c]"
const BAD = "border-transparent bg-[#d03b3b]/12 text-[#b02a2a] dark:text-[#ef7b7b]"

/** Runs one practice round, then records the results (spaced repetition). */
export function PracticePlayer({ setId, activity, words }: { setId: string; activity: VocabularyActivity; words: PracticeWord[] }) {
  const [round, setRound] = useState(0)
  const [results, setResults] = useState<Result[] | null>(null)

  if (results) {
    return <Summary setId={setId} activity={activity} words={words} results={results} onAgain={() => { setResults(null); setRound((r) => r + 1) }} />
  }
  const done = (r: Result[]) => setResults(r)
  const key = `${activity}-${round}`
  switch (activity) {
    case "flashcards":
      return <Flashcards key={key} words={words} onDone={done} />
    case "matching":
      return <Matching key={key} words={words} onDone={done} />
    case "multiple_choice":
      return <MultipleChoice key={key} words={words} onDone={done} />
    case "fill_blank":
      return <FillBlank key={key} words={words} onDone={done} />
    case "spelling":
      return <Spelling key={key} words={words} onDone={done} />
    case "pronunciation":
      return <Pronunciation key={key} words={words} onDone={done} />
  }
}

function Progress({ index, total }: { index: number; total: number }) {
  return (
    <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
      {Math.min(index + 1, total)} / {total}
    </p>
  )
}

function WordHeading({ word, showMeaning = false }: { word: PracticeWord; showMeaning?: boolean }) {
  return (
    <div className="grid justify-items-center gap-2 text-center">
      {word.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={word.imageUrl} alt="" className="max-h-40 rounded-md" />
      )}
      <p className="text-3xl font-semibold">{word.word}</p>
      <p className="text-muted-foreground">
        {word.ipa} <span className="italic">{PART_OF_SPEECH_LABELS[word.part_of_speech]}</span>
      </p>
      <SpeakButton text={word.word} audioUrl={word.audioUrl} />
      {showMeaning && (
        <div className="grid gap-1">
          <p className="text-lg">{word.meaning_vi}</p>
          {word.definition_en && <p className="text-muted-foreground">{word.definition_en}</p>}
          {word.example && <p className="italic">“{word.example}”</p>}
        </div>
      )}
    </div>
  )
}

// --- Flashcards ------------------------------------------------------------

function Flashcards({ words, onDone }: { words: PracticeWord[]; onDone: (r: Result[]) => void }) {
  const deck = useMemo(() => shuffle(words), [words])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [results, setResults] = useState<Result[]>([])
  const word = deck[index]

  function answer(correct: boolean) {
    const next = [...results, { wordId: word.id, correct }]
    if (index + 1 >= deck.length) return onDone(next)
    setResults(next)
    setIndex(index + 1)
    setFlipped(false)
  }

  return (
    <Card>
      <CardContent className="grid gap-6 py-6">
        <Progress index={index} total={deck.length} />
        <WordHeading word={word} showMeaning={flipped} />
        <div className="flex flex-wrap justify-center gap-2">
          {!flipped ? (
            <Button onClick={() => setFlipped(true)}>Show meaning</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => answer(false)}>
                <XIcon aria-hidden /> Not yet
              </Button>
              <Button onClick={() => answer(true)}>
                <CheckIcon aria-hidden /> I knew it
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Matching --------------------------------------------------------------

function Matching({ words, onDone }: { words: PracticeWord[]; onDone: (r: Result[]) => void }) {
  const round = useMemo(() => shuffle(words).slice(0, 8), [words])
  const meanings = useMemo(() => shuffle(round), [round])
  const [selected, setSelected] = useState<string | null>(null)
  const [matched, setMatched] = useState<string[]>([])
  const [missed, setMissed] = useState<string[]>([])
  const [wrong, setWrong] = useState<string | null>(null)

  function pick(meaningOf: string) {
    if (!selected || matched.includes(meaningOf)) return
    if (meaningOf === selected) {
      const next = [...matched, selected]
      setMatched(next)
      setSelected(null)
      if (next.length === round.length) onDone(round.map((w) => ({ wordId: w.id, correct: !missed.includes(w.id) })))
    } else {
      setWrong(meaningOf)
      if (!missed.includes(selected)) setMissed([...missed, selected])
      setTimeout(() => setWrong(null), 600)
    }
  }

  return (
    <Card>
      <CardContent className="grid gap-4 py-6">
        <p className="text-muted-foreground text-sm">Choose a word, then its meaning.</p>
        <div className="grid grid-cols-2 gap-3">
          <ul className="grid gap-2">
            {round.map((w) => (
              <li key={w.id}>
                <Button
                  variant="outline"
                  className={cn("w-full justify-start", matched.includes(w.id) && GOOD, selected === w.id && "ring-ring/50 ring-2")}
                  disabled={matched.includes(w.id)}
                  aria-pressed={selected === w.id}
                  onClick={() => setSelected(w.id)}
                >
                  {w.word}
                </Button>
              </li>
            ))}
          </ul>
          <ul className="grid gap-2">
            {meanings.map((w) => (
              <li key={w.id}>
                <Button
                  variant="outline"
                  className={cn("h-auto w-full justify-start py-2 text-left whitespace-normal", matched.includes(w.id) && GOOD, wrong === w.id && BAD)}
                  disabled={matched.includes(w.id)}
                  onClick={() => pick(w.id)}
                >
                  {w.meaning_vi}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Multiple choice ---------------------------------------------------------

function MultipleChoice({ words, onDone }: { words: PracticeWord[]; onDone: (r: Result[]) => void }) {
  const questions = useMemo(() => buildChoiceQuestions(words), [words])
  const [index, setIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const q = questions[index]

  function next() {
    const all = [...results, { wordId: q.wordId, correct: picked === q.answer }]
    if (index + 1 >= questions.length) return onDone(all)
    setResults(all)
    setIndex(index + 1)
    setPicked(null)
  }

  return (
    <Card>
      <CardContent className="grid gap-4 py-6">
        <Progress index={index} total={questions.length} />
        <p className="text-lg font-medium">Which word means: “{q.prompt}”?</p>
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {q.options.map((option) => (
            <Button
              key={option}
              role="radio"
              aria-checked={picked === option}
              variant="outline"
              className={cn("justify-start", picked && option === q.answer && GOOD, picked === option && option !== q.answer && BAD)}
              disabled={picked !== null}
              onClick={() => setPicked(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        {picked && (
          <div className="flex flex-wrap items-center gap-2">
            <Feedback correct={picked === q.answer} answer={q.answer} />
            <Button onClick={next}>{index + 1 >= questions.length ? "Finish" : "Next"}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Typed answers (fill in the blank, spelling) --------------------------------

function TypedRound({
  items,
  onDone,
  render,
}: {
  items: { wordId: string; answer: string; say?: string; audioUrl?: string | null }[]
  onDone: (r: Result[]) => void
  render: (index: number) => React.ReactNode
}) {
  const [index, setIndex] = useState(0)
  const [value, setValue] = useState("")
  const [checked, setChecked] = useState<boolean | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const input = useRef<HTMLInputElement>(null)
  const item = items[index]

  useEffect(() => input.current?.focus(), [index])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (checked === null) {
      setChecked(sameAnswer(value, item.answer))
      return
    }
    const all = [...results, { wordId: item.wordId, correct: checked }]
    if (index + 1 >= items.length) return onDone(all)
    setResults(all)
    setIndex(index + 1)
    setValue("")
    setChecked(null)
  }

  return (
    <Card>
      <CardContent className="grid gap-4 py-6">
        <Progress index={index} total={items.length} />
        {render(index)}
        <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
          <Input
            ref={input}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={checked !== null}
            className={cn("max-w-xs", checked === true && GOOD, checked === false && BAD)}
            aria-label="Your answer"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <Button type="submit" disabled={checked === null && value.trim() === ""}>
            {checked === null ? "Check" : index + 1 >= items.length ? "Finish" : "Next"}
          </Button>
        </form>
        {checked !== null && <Feedback correct={checked} answer={item.answer} />}
      </CardContent>
    </Card>
  )
}

function FillBlank({ words, onDone }: { words: PracticeWord[]; onDone: (r: Result[]) => void }) {
  const questions = useMemo(() => buildBlankQuestions(words), [words])
  if (questions.length === 0) {
    return <p className="text-muted-foreground text-sm">None of these words has an example sentence yet.</p>
  }
  return (
    <TypedRound
      items={questions}
      onDone={onDone}
      render={(i) => (
        <div className="grid gap-1">
          <p className="text-lg">{questions[i].sentence}</p>
          <p className="text-muted-foreground text-sm">Hint: {questions[i].hint}</p>
        </div>
      )}
    />
  )
}

function Spelling({ words, onDone }: { words: PracticeWord[]; onDone: (r: Result[]) => void }) {
  const deck = useMemo(() => shuffle(words), [words])
  return (
    <TypedRound
      items={deck.map((w) => ({ wordId: w.id, answer: w.word }))}
      onDone={onDone}
      render={(i) => (
        <div className="grid gap-2">
          <p>Listen and type the word.</p>
          <div className="flex flex-wrap items-center gap-2">
            <SpeakButton text={deck[i].word} audioUrl={deck[i].audioUrl} label="Play the word" />
            <span className="text-muted-foreground text-sm">
              {deck[i].meaning_vi} · {PART_OF_SPEECH_LABELS[deck[i].part_of_speech]}
            </span>
          </div>
        </div>
      )}
    />
  )
}

// --- Pronunciation ---------------------------------------------------------

function Pronunciation({ words, onDone }: { words: PracticeWord[]; onDone: (r: Result[]) => void }) {
  const deck = useMemo(() => shuffle(words), [words])
  const [index, setIndex] = useState(0)
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null)
  const [results, setResults] = useState<Result[]>([])
  const word = deck[index]

  function answer(correct: boolean) {
    const next = [...results, { wordId: word.id, correct }]
    if (recordingUrl) URL.revokeObjectURL(recordingUrl)
    if (index + 1 >= deck.length) return onDone(next)
    setResults(next)
    setIndex(index + 1)
    setRecordingUrl(null)
  }

  return (
    <Card>
      <CardContent className="grid gap-5 py-6">
        <Progress index={index} total={deck.length} />
        <WordHeading word={word} />
        <div className="grid justify-items-center gap-2">
          <p className="text-muted-foreground text-sm">Listen, then record yourself and compare. Your recording stays on this device.</p>
          <AudioRecorder maxSeconds={10} onRecorded={(_file, url) => setRecordingUrl(url)} />
          {recordingUrl && <audio controls src={recordingUrl} className="w-full max-w-xs" />}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" onClick={() => answer(false)}>
            Needs more practice
          </Button>
          <Button onClick={() => answer(true)}>Sounded right</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// --- Results ---------------------------------------------------------------

function Feedback({ correct, answer }: { correct: boolean; answer: string }) {
  return correct ? (
    <Badge variant="outline" className={cn("gap-1", GOOD)}>
      <CheckIcon className="size-3" aria-hidden /> Correct
    </Badge>
  ) : (
    <Badge variant="outline" className={cn("gap-1", BAD)}>
      <XIcon className="size-3" aria-hidden /> Answer: {answer}
    </Badge>
  )
}

function Summary({
  setId,
  activity,
  words,
  results,
  onAgain,
}: {
  setId: string
  activity: VocabularyActivity
  words: PracticeWord[]
  results: Result[]
  onAgain: () => void
}) {
  const [saved, setSaved] = useState<"saving" | "saved" | string>("saving")
  const sent = useRef(false)
  useEffect(() => {
    if (sent.current) return
    sent.current = true
    void recordPracticeAction({ setId, activity, results }).then((r) => setSaved(r.ok ? "saved" : r.error.message))
  }, [setId, activity, results])

  const correct = results.filter((r) => r.correct).length
  const missed = results.filter((r) => !r.correct).map((r) => words.find((w) => w.id === r.wordId)).filter(Boolean) as PracticeWord[]

  return (
    <Card>
      <CardContent className="grid gap-4 py-6">
        <p className="text-2xl font-semibold tabular-nums">
          {correct} / {results.length}
        </p>
        <p className="text-muted-foreground text-sm">
          {ACTIVITY_LABELS[activity].title} ·{" "}
          {saved === "saving" ? "saving…" : saved === "saved" ? "saved to your progress" : `not saved: ${saved}`}
        </p>
        {missed.length > 0 && (
          <div className="grid gap-1">
            <p className="text-sm font-medium">Practise these again</p>
            <ul className="grid gap-1 text-sm">
              {missed.map((w) => (
                <li key={w.id}>
                  <span className="font-medium">{w.word}</span> – {w.meaning_vi}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <Button onClick={onAgain}>
            <RotateCcwIcon aria-hidden /> Practise again
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
