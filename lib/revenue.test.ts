import { describe, it, expect } from "vitest"
import type { PortfolioRevenue } from "./types"
import {
  sortRows,
  variance,
  varianceBandColor,
  REVENUE_COLORS,
  yoyGrowth,
  sequentialGrowth,
  ytdActual,
  annualActual,
  annualProjection,
  annualMismatch,
  plannedPeriods,
  planYearFor,
  latestActual,
  periodEnd,
} from "./revenue"

// These are conventions, not preferences. Each one exists because getting it
// wrong produces a plausible-looking number rather than an error — an annualized
// partial year, a Q3-over-FY growth rate, a null read as zero. The assertions
// below are the guard rails; if one fails, a figure somewhere is now lying.

let seq = 0
function row(p: Partial<PortfolioRevenue> & { period_type: string; fiscal_year: number }): PortfolioRevenue {
  return {
    id: `r${seq++}`,
    company_id: "c1",
    period_end: periodEnd(p.period_type, p.fiscal_year),
    projected: null,
    actual: null,
    projected_source: null,
    projected_as_of: null,
    actual_source: null,
    notes: null,
    created_by: null,
    created_at: "",
    updated_at: "",
    ...p,
  }
}

const quarters = (year: number, vals: [number | null, number | null][]) =>
  vals.map(([projected, actual], i) => row({ period_type: `Q${i + 1}`, fiscal_year: year, projected, actual }))

describe("sortRows", () => {
  it("puts FY ahead of Q4 despite the identical period_end", () => {
    const rows = sortRows([
      row({ period_type: "Q4", fiscal_year: 2025 }),
      row({ period_type: "FY", fiscal_year: 2025 }),
    ])
    expect(rows.map((r) => r.period_type)).toEqual(["FY", "Q4"])
  })

  it("orders newest first across years", () => {
    const rows = sortRows([
      row({ period_type: "Q1", fiscal_year: 2025 }),
      row({ period_type: "Q1", fiscal_year: 2026 }),
    ])
    expect(rows.map((r) => r.fiscal_year)).toEqual([2026, 2025])
  })
})

describe("variance", () => {
  it("is null unless BOTH sides exist — a missing actual is not a shortfall", () => {
    expect(variance({ projected: 100, actual: null })).toBeNull()
    expect(variance({ projected: null, actual: 100 })).toBeNull()
  })

  it("computes signed absolute and percent", () => {
    expect(variance({ projected: 100, actual: 110 })).toEqual({ abs: 10, pct: 10 })
    expect(variance({ projected: 100, actual: 90 })).toEqual({ abs: -10, pct: -10 })
  })

  it("returns a null percent rather than dividing by zero", () => {
    expect(variance({ projected: 0, actual: 50 })).toEqual({ abs: 50, pct: null })
  })
})

describe("varianceBandColor", () => {
  it("is navy inside the band, at either edge, and at zero", () => {
    for (const pct of [0, 10, -10, 9.9, -9.9]) {
      expect(varianceBandColor(pct)).toBe(REVENUE_COLORS.navy)
    }
  })

  it("is green only beyond +10 and orange only beyond -10", () => {
    expect(varianceBandColor(10.01)).toBe(REVENUE_COLORS.green)
    expect(varianceBandColor(-10.01)).toBe(REVENUE_COLORS.orange)
  })

  it("is navy — never orange — when there is nothing to compare", () => {
    expect(varianceBandColor(null)).toBe(REVENUE_COLORS.navy)
    expect(varianceBandColor(undefined)).toBe(REVENUE_COLORS.navy)
    expect(varianceBandColor(NaN)).toBe(REVENUE_COLORS.navy)
  })
})

describe("yoyGrowth", () => {
  const rows = [
    row({ period_type: "Q3", fiscal_year: 2026, actual: 150 }),
    row({ period_type: "Q3", fiscal_year: 2025, actual: 100 }),
    row({ period_type: "FY", fiscal_year: 2025, actual: 900 }),
  ]

  it("compares the same quarter a year earlier", () => {
    expect(yoyGrowth(rows, rows[0])).toBe(50)
  })

  it("never compares across cadences — no Q3-over-FY", () => {
    const noPriorQ3 = [
      row({ period_type: "Q3", fiscal_year: 2026, actual: 150 }),
      row({ period_type: "FY", fiscal_year: 2025, actual: 900 }),
    ]
    expect(yoyGrowth(noPriorQ3, noPriorQ3[0])).toBeNull()
  })

  it("is null when the row itself has no actual", () => {
    const r = row({ period_type: "Q3", fiscal_year: 2026, projected: 150 })
    expect(yoyGrowth([r, ...rows], r)).toBeNull()
  })
})

describe("sequentialGrowth", () => {
  it("walks Q1 back to the prior year's Q4", () => {
    const rows = [
      row({ period_type: "Q1", fiscal_year: 2026, actual: 120 }),
      row({ period_type: "Q4", fiscal_year: 2025, actual: 100 }),
    ]
    expect(sequentialGrowth(rows, rows[0])).toBe(20)
  })

  it("is null for FY rows — that would just duplicate YoY", () => {
    const r = row({ period_type: "FY", fiscal_year: 2026, actual: 100 })
    expect(sequentialGrowth([r], r)).toBeNull()
  })
})

describe("annualActual", () => {
  it("refuses to sum a partial year", () => {
    const rows = quarters(2026, [[null, 10], [null, 20], [null, null], [null, null]])
    expect(annualActual(rows, 2026)).toBeNull()
  })

  it("sums a complete four-quarter year", () => {
    const rows = quarters(2025, [[null, 10], [null, 20], [null, 30], [null, 40]])
    expect(annualActual(rows, 2025)).toEqual({ value: 100, basis: "Q1 + Q2 + Q3 + Q4" })
  })

  it("prefers the FY row over the quarters", () => {
    const rows = [
      ...quarters(2025, [[null, 10], [null, 20], [null, 30], [null, 40]]),
      row({ period_type: "FY", fiscal_year: 2025, actual: 105 }),
    ]
    expect(annualActual(rows, 2025)).toEqual({ value: 105, basis: "FY" })
  })
})

describe("annualProjection", () => {
  it("refuses a partial plan rather than understating the year", () => {
    // Doubling an H1 plan understates by 15-17% on the real data, because
    // plans ramp. Returning null is the point of this function.
    const rows = quarters(2026, [[100, null], [120, null], [null, null], [null, null]])
    expect(annualProjection(rows, 2026)).toBeNull()
  })

  it("sums only when all four quarters are planned", () => {
    const rows = quarters(2026, [[100, null], [120, null], [140, null], [160, null]])
    expect(annualProjection(rows, 2026)).toEqual({ value: 520, basis: "Q1 + Q2 + Q3 + Q4" })
  })

  it("prefers the FY row", () => {
    const rows = [
      ...quarters(2026, [[100, null], [120, null], [140, null], [160, null]]),
      row({ period_type: "FY", fiscal_year: 2026, projected: 600 }),
    ]
    expect(annualProjection(rows, 2026)).toEqual({ value: 600, basis: "FY" })
  })
})

describe("annualMismatch", () => {
  it("flags an FY plan that contradicts its own quarters", () => {
    // Vesalio FY2026: 12,660,000 on the FY row, 11,861,468 across the quarters.
    const rows = [
      ...quarters(2026, [[2050666, null], [2857802, null], [3133000, null], [3820000, null]]),
      row({ period_type: "FY", fiscal_year: 2026, projected: 12660000 }),
    ]
    const m = annualMismatch(rows, 2026, "projected")
    expect(m).not.toBeNull()
    expect(m!.fy).toBe(12660000)
    expect(m!.quarters).toBe(11861468)
    expect(m!.pct).toBeCloseTo(-6.31, 1)
  })

  it("tolerates a documented basis difference", () => {
    // Vesalio FY2025 actual: quarters are product sales, the FY row is net
    // sales, so they differ by 11,932 (0.15%). That is not an error.
    const rows = [
      ...quarters(2025, [[null, 1964748], [null, 1682425], [null, 2108789], [null, 1991092]]),
      row({ period_type: "FY", fiscal_year: 2025, actual: 7758986 }),
    ]
    expect(annualMismatch(rows, 2025, "actual")).toBeNull()
  })

  it("stays silent when any quarter's plan is a reforecast", () => {
    // Vektor 2025: FY is January's original $2.6M goal; Q3 and Q4 are mid-year
    // reforecasts. Different basis by design — the sums are not meant to tie.
    const rows = [
      row({ period_type: "Q1", fiscal_year: 2025, projected: 365000, projected_source: "Board deck" }),
      row({ period_type: "Q2", fiscal_year: 2025, projected: 450000, projected_source: "Board deck" }),
      row({ period_type: "Q3", fiscal_year: 2025, projected: 685000, projected_source: "Reforecast" }),
      row({ period_type: "Q4", fiscal_year: 2025, projected: 900000, projected_source: "Reforecast" }),
      row({ period_type: "FY", fiscal_year: 2025, projected: 2600000, projected_source: "Board deck" }),
    ]
    expect(annualMismatch(rows, 2025, "projected")).toBeNull()
  })

  it("stays silent on a partly populated year", () => {
    const rows = [
      ...quarters(2026, [[100, null], [120, null], [null, null], [null, null]]),
      row({ period_type: "FY", fiscal_year: 2026, projected: 999 }),
    ]
    expect(annualMismatch(rows, 2026, "projected")).toBeNull()
  })
})

describe("ytdActual", () => {
  it("does not double count a company holding both halves and quarters", () => {
    const rows = [
      ...quarters(2026, [[null, 10], [null, 20], [null, null], [null, null]]),
      row({ period_type: "H1", fiscal_year: 2026, actual: 30 }),
    ]
    expect(ytdActual(rows, 2026)).toEqual({ value: 30, coverage: "Q1–Q2" })
  })

  it("reports a partial year, unlike annualActual", () => {
    const rows = quarters(2026, [[null, 10], [null, 20], [null, null], [null, null]])
    expect(ytdActual(rows, 2026)?.value).toBe(30)
    expect(annualActual(rows, 2026)).toBeNull()
  })
})

describe("plannedPeriods", () => {
  it("lists the sub-periods carrying a plan, ignoring the FY row", () => {
    const rows = [
      ...quarters(2026, [[100, null], [120, null], [null, null], [null, null]]),
      row({ period_type: "FY", fiscal_year: 2026, projected: 500 }),
    ]
    expect(plannedPeriods(rows, 2026)).toEqual(["Q1", "Q2"])
  })
})

describe("planYearFor", () => {
  it("stays on the year that has both an annual plan and a reported period", () => {
    const rows = [
      row({ period_type: "FY", fiscal_year: 2027, projected: 900 }),
      row({ period_type: "FY", fiscal_year: 2026, projected: 500 }),
      row({ period_type: "Q1", fiscal_year: 2026, actual: 100 }),
    ]
    expect(planYearFor(rows, 2026)).toBe(2026)
  })

  it("falls back to the latest annual plan when nothing is reported yet", () => {
    const rows = [row({ period_type: "FY", fiscal_year: 2027, projected: 900 })]
    expect(planYearFor(rows, 2026)).toBe(2027)
  })
})

describe("latestActual", () => {
  it("skips periods with no actual", () => {
    const rows = sortRows([
      row({ period_type: "Q3", fiscal_year: 2026, projected: 300 }),
      row({ period_type: "Q2", fiscal_year: 2026, actual: 200 }),
    ])
    expect(latestActual(rows)?.period_type).toBe("Q2")
  })
})
