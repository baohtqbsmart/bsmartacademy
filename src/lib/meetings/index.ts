/**
 * Meeting providers for the Online Teaching Center. BSmart does not host
 * video: sessions point to a Google Meet, Zoom or Microsoft Teams meeting.
 *
 * Today teachers create the meeting in the provider's app and paste the link
 * (validated here and by private.meeting_url_valid() in the database; the
 * patterns must stay in step: tests/db/online.test.ts compares them).
 *
 * Automatic creation later: implement MeetingIntegration for a provider (in
 * a server-only module, using the provider's API with credentials from the
 * environment), register it in `integrations`, and have the session action
 * call createMeeting() when `isConfigured()`; the result is stored with
 * link_source 'api' and external_meeting_id (unique per provider, so a
 * retried request cannot create a second session). Provider webhooks
 * (meeting started/ended, participants) would update the session and could
 * pre-fill attendance, which the teacher still confirms.
 */

export const MEETING_PROVIDERS = ["google_meet", "zoom", "microsoft_teams", "other"] as const
export type MeetingProviderId = (typeof MEETING_PROVIDERS)[number]

type ProviderInfo = {
  label: string
  pattern: RegExp
  example: string
  /** Where a teacher creates a meeting by hand today. */
  createUrl: string | null
  help: string
}

export const PROVIDERS: Record<MeetingProviderId, ProviderInfo> = {
  google_meet: {
    label: "Google Meet",
    pattern: /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}([?#].*)?$/,
    example: "https://meet.google.com/abc-defg-hij",
    createUrl: "https://meet.new",
    help: "Open Google Meet, start or schedule a meeting, and copy its link.",
  },
  zoom: {
    label: "Zoom",
    pattern: /^https:\/\/([a-z0-9-]+\.)?zoom\.(us|com)\/(j|w|my|s)\/[A-Za-z0-9._-]+([?#].*)?$/,
    example: "https://us02web.zoom.us/j/81234567890?pwd=…",
    createUrl: "https://zoom.us/meeting/schedule",
    help: "Schedule the meeting in Zoom and copy the invite link (with the passcode).",
  },
  microsoft_teams: {
    label: "Microsoft Teams",
    pattern: /^https:\/\/teams\.(microsoft|live)\.com\/\S+$/,
    example: "https://teams.microsoft.com/l/meetup-join/…",
    createUrl: "https://teams.microsoft.com",
    help: "Create the meeting in Teams (Calendar → New meeting) and copy the join link.",
  },
  other: {
    label: "Other",
    pattern: /^https:\/\/\S+$/,
    example: "https://…",
    createUrl: null,
    help: "Any other meeting link starting with https://.",
  },
}

export function isValidMeetingUrl(provider: MeetingProviderId, url: string) {
  return /^https:\/\/\S+$/.test(url) && url.length <= 500 && PROVIDERS[provider].pattern.test(url)
}

/** The provider a pasted link belongs to (so teachers need not choose). */
export function detectProvider(url: string): MeetingProviderId | null {
  const trimmed = url.trim()
  for (const id of ["google_meet", "zoom", "microsoft_teams"] as const) {
    if (PROVIDERS[id].pattern.test(trimmed)) return id
  }
  return /^https:\/\/\S+$/.test(trimmed) ? "other" : null
}

// ---------------------------------------------------------------------------
// Future automatic integration
// ---------------------------------------------------------------------------

export type CreateMeetingInput = { title: string; startsAt: string; endsAt: string; hostEmail: string | null }
export type CreatedMeeting = { url: string; meetingCode?: string; passcode?: string; externalMeetingId: string }

export interface MeetingIntegration {
  provider: MeetingProviderId
  /** True once credentials are configured for this provider. */
  isConfigured(): boolean
  createMeeting(input: CreateMeetingInput): Promise<CreatedMeeting>
  updateMeeting(externalMeetingId: string, input: CreateMeetingInput): Promise<void>
  cancelMeeting(externalMeetingId: string): Promise<void>
}

/** No provider API is connected yet; every session uses a pasted link. */
const integrations: Partial<Record<MeetingProviderId, MeetingIntegration>> = {}

export function getIntegration(provider: MeetingProviderId): MeetingIntegration | null {
  const integration = integrations[provider]
  return integration?.isConfigured() ? integration : null
}
