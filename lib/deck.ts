// Share links expire 4 weeks after they were last sent
export const DECK_LINK_TTL_MS = 28 * 24 * 60 * 60 * 1000

export function isExpired(sharedAt: string | null): boolean {
  if (!sharedAt) return true
  const sharedMs = new Date(sharedAt).getTime()
  // An unparsable timestamp must fail CLOSED — this gates public share links.
  if (Number.isNaN(sharedMs)) return true
  return Date.now() - sharedMs > DECK_LINK_TTL_MS
}

// What the deck-share email says about the company. Every field is optional —
// a null line simply doesn't appear in the body.
export interface DeckEmailInfo {
  name: string
  sector?: string | null
  series?: string | null
  clinicalStage?: string | null
  currentRaise?: string | null
  valuation?: string | null
  /** Deals carry a fundraising-to-date figure; portfolio companies don't. */
  raisedToDate?: string | null
  website?: string | null
}

// The email behind DecksSection's Share button, shared by the deal modal and
// the portfolio company detail (which had drifted-prone copies of it).
export function buildDeckEmail(info: DeckEmailInfo, deckUrl: string, label: string): { subject: string; body: string } {
  const named = label && label.toLowerCase() !== 'deck'
  const details = [
    info.sector ? `Sector: ${info.sector}` : null,
    info.series ? `Series: ${info.series}` : null,
    info.clinicalStage ? `Clinical stage: ${info.clinicalStage}` : null,
    info.currentRaise ? `Current raise: ${info.currentRaise}` : null,
    info.valuation ? `Valuation: ${info.valuation}` : null,
    info.raisedToDate ? `Raised to date: ${info.raisedToDate}` : null,
    info.website ? `Website: ${info.website}` : null,
  ].filter(Boolean) as string[]
  const body = [
    'Hi,',
    '',
    `I wanted to share the ${named ? label + ' ' : ''}non-confidential deck for ${info.name}.`,
    '',
    ...details,
    '',
    `View the deck here: ${deckUrl}`,
    '(link active for 4 weeks)',
    '',
    'Best,',
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n')
  return { subject: named ? `${info.name} — ${label} deck` : `${info.name} — non-confidential overview`, body }
}
