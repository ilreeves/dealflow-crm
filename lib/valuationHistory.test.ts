import { describe, it, expect } from 'vitest'
import { combineSeries, seriesMax } from './valuationHistory'

describe('combineSeries', () => {
  it('carries each vehicle forward instead of summing same-date points only', () => {
    const c = combineSeries('SPVs', [
      { fund: 'A', points: [{ date: '2025-12-31', invested: 8, value: 10 }] },
      { fund: 'B', points: [{ date: '2026-06-30', invested: 3, value: 3 }] },
    ])!
    expect(c.points).toEqual([
      { date: '2025-12-31', invested: 8, value: 10 },
      // A's Dec mark still counts in June — no phantom −$7 drop.
      { date: '2026-06-30', invested: 11, value: 13 },
    ])
  })

  it('uses the latest mark on or before each date', () => {
    const c = combineSeries('SPVs', [
      { fund: 'A', points: [{ date: '2026-06-30', invested: 5, value: 6 }, { date: '2025-12-31', invested: 5, value: 4 }] },
      { fund: 'B', points: [{ date: '2026-03-31', invested: 1, value: 1 }] },
    ])!
    expect(c.points.map((p) => [p.date, p.value])).toEqual([
      ['2025-12-31', 4],
      ['2026-03-31', 5],
      ['2026-06-30', 7],
    ])
  })

  it('returns null with no points', () => {
    expect(combineSeries('SPVs', [])).toBeNull()
    expect(combineSeries('SPVs', [{ fund: 'A', points: [] }])).toBeNull()
  })
})

describe('seriesMax', () => {
  it('is at least 1 and covers invested and value', () => {
    expect(seriesMax([])).toBe(1)
    expect(seriesMax([{ fund: 'A', points: [{ date: 'x', invested: 9, value: 4 }] }])).toBe(9)
  })
})
