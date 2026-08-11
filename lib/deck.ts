// Share links expire 4 weeks after they were last sent
export const DECK_LINK_TTL_MS = 28 * 24 * 60 * 60 * 1000

export function isExpired(sharedAt: string | null): boolean {
  if (!sharedAt) return true
  const sharedMs = new Date(sharedAt).getTime()
  // An unparsable timestamp must fail CLOSED — this gates public share links.
  if (Number.isNaN(sharedMs)) return true
  return Date.now() - sharedMs > DECK_LINK_TTL_MS
}
