import type { TFunction } from "@/i18n/translate"

/**
 * Notifications are written by database triggers (supabase/migrations/
 * 20261008000100_communication.sql) in English, with class names, titles and
 * dates embedded. Only the fixed wording is translated here; the embedded
 * data (a class or assignment title) is shown as it was entered.
 */
const TITLE_PREFIXES = [
  "New assignment",
  "Due soon",
  "Grade returned",
  "Test marked",
  "Feedback returned",
  "English work reviewed",
  "Online lesson scheduled",
  "Online lesson cancelled",
  "Online lesson moved",
  "Timetable changed",
  "Enrolled",
  "Tuition overdue",
  "Tuition due",
] as const

const FIXED_BODIES = [
  "Marked absent by the class teacher. Contact the teacher if this is wrong.",
  "Check the new weekly times.",
  "The class now appears in the timetable and class list.",
] as const

export function translateNotificationTitle(t: TFunction, title: string): string {
  const message = /^New message from (.+)$/.exec(title)
  if (message) return t("New message from {name}", { name: message[1] })
  const absent = /^Absent: (.+) on (\d{2}\/\d{2}\/\d{4})$/.exec(title)
  if (absent) return t("Absent: {className} on {date}", { className: absent[1], date: absent[2] })
  const separator = title.indexOf(": ")
  if (separator > 0) {
    const prefix = title.slice(0, separator)
    if ((TITLE_PREFIXES as readonly string[]).includes(prefix)) return `${t(prefix)}: ${title.slice(separator + 2)}`
  }
  return title
}

export function translateNotificationBody(t: TFunction, body: string): string {
  if ((FIXED_BODIES as readonly string[]).includes(body)) return t(body)
  const dueUnsubmitted = /^Due (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}) and not handed in yet\.$/.exec(body)
  if (dueUnsubmitted) return t("Due {dateTime} and not handed in yet.", { dateTime: dueUnsubmitted[1] })
  const due = /^Due (\d{2}\/\d{2}\/\d{4} \d{2}:\d{2})$/.exec(body)
  if (due) return t("Due {dateTime}", { dateTime: due[1] })
  const tuition = /^([\d.,]+) đ due (\d{2}\/\d{2}\/\d{4})$/.exec(body)
  if (tuition) return t("{amount} đ due {date}", { amount: tuition[1], date: tuition[2] })
  return body
}
