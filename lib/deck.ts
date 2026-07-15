// Share links expire 4 weeks after they were last sent
export const DECK_LINK_TTL_MS = 28 * 24 * 60 * 60 * 1000

export function isExpired(sharedAt: string | null): boolean {
  if (!sharedAt) return true
  return Date.now() - new Date(sharedAt).getTime() > DECK_LINK_TTL_MS
}
