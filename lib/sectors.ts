// A company has one PRIMARY sector (`sector`) and optionally more
// (`secondary_sectors`) — e.g. Arrivo: Psychiatry & Neurology for SP-624,
// Gastroenterology for RABI-767. The primary is what shows where only one
// label fits (deck emails); everywhere else reads the full list.

type HasSectors = { sector: string | null; secondary_sectors?: string[] | null }

/** Primary first, then the rest — trimmed, de-duplicated, blanks dropped. */
export function allSectors(c: HasSectors): string[] {
  const out: string[] = []
  for (const s of [c.sector, ...(c.secondary_sectors ?? [])]) {
    const t = s?.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/** Display string: "Psychiatry & Neurology · IM - Gastroenterology". */
export function formatSectors(c: HasSectors, sep = ' · '): string | null {
  const all = allSectors(c)
  return all.length ? all.join(sep) : null
}

/** Secondary list to save: drops blanks, duplicates, and the primary itself. */
export function cleanSecondary(primary: string, secondary: string[]): string[] {
  const p = primary.trim()
  const out: string[] = []
  for (const s of secondary) {
    const t = s.trim()
    if (t && t !== p && !out.includes(t)) out.push(t)
  }
  return out
}

/**
 * The pair to save from a form. If the primary was cleared but secondaries
 * remain, the first secondary is promoted — a company never ends up with
 * "additional" sectors and no primary.
 */
export function sectorsPayload(primary: string, secondary: string[]): { sector: string | null; secondary_sectors: string[] } {
  const p = primary.trim() || secondary.map((s) => s.trim()).find(Boolean) || ''
  return { sector: p || null, secondary_sectors: cleanSecondary(p, secondary) }
}
