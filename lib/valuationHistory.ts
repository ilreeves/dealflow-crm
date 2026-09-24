// Pure helpers for the Fund Performance valuation-history chart. No imports, so
// vitest can exercise them without the "@/" alias.

export type SnapshotPoint = { date: string; invested: number; value: number }
export type FundSeries = { fund: string; points: SnapshotPoint[] }

/**
 * Roll several vehicles' marks into one series.
 *
 * Vehicles are marked on different days, so summing only the points that share
 * an exact date made each combined bar cover a different subset of vehicles —
 * A at $10M on Dec 31 and B at $3M on Jun 30 read as "−$7.0M". Instead every
 * date in the union carries each vehicle's most recent mark on or before it
 * forward; a vehicle with no mark yet simply isn't in the total until its first.
 */
export function combineSeries(fund: string, series: FundSeries[]): FundSeries | null {
  const dates = Array.from(new Set(series.flatMap((s) => s.points.map((p) => p.date)))).sort()
  if (!dates.length) return null
  const sorted = series.map((s) => [...s.points].sort((a, b) => a.date.localeCompare(b.date)))
  const points = dates.map((date) => {
    let invested = 0
    let value = 0
    for (const pts of sorted) {
      let last: SnapshotPoint | null = null
      for (const p of pts) {
        if (p.date > date) break
        last = p
      }
      if (last) { invested += last.invested; value += last.value }
    }
    return { date, invested, value }
  })
  return { fund, points }
}

/** Largest bar across the given series — the shared 120px scale. */
export function seriesMax(series: FundSeries[]): number {
  return Math.max(1, ...series.flatMap((s) => s.points.flatMap((p) => [p.invested, p.value])))
}
