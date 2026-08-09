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
  planValue,
  isRevised,
  plannedPeriods,
  planYearFor,
  axisTicks,
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
    revised_projected: null,
    actual: null,
    projected_source: null,
    projected_as_of: null,
    revised_source: null,
    revised_as_of: null,
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
    expect(annualProjection(rows, 2026)).toEqual({ value: 520, basis: "Q1 + Q2 + Q3 + Q4", revised: false })
  })

  it("prefers the FY row", () => {
    const rows = [
      ...quarters(2026, [[100, null], [120, null], [140, null], [160, null]]),
      row({ period_type: "FY", fiscal_year: 2026, projected: 600 }),
    ]
    expect(annualProjection(rows, 2026)).toEqual({ value: 600, basis: "FY", revised: false })
  })

  // The two bases must not bleed into each other. A restatement raising one
  // quarter has to move the revised annual figure and leave the original alone —
  // if it moved both, /analytics would silently start scoring companies against
  // the softer target, which is the exact failure the column split prevents.
  it("keeps the original basis clean when a quarter is restated", () => {
    const rows = quarters(2026, [[100, null], [120, null], [140, null], [160, null]])
    rows[1] = { ...rows[1], revised_projected: 200 }
    expect(annualProjection(rows, 2026, "original")).toEqual({
      value: 520, basis: "Q1 + Q2 + Q3 + Q4", revised: false,
    })
    expect(annualProjection(rows, 2026, "revised")).toEqual({
      value: 600, basis: "Q1 + Q2 + Q3 + Q4", revised: true,
    })
  })

  // A revision on one quarter must not make the other three vanish — the revised
  // basis falls back to the original per period, so the year stays complete.
  it("falls back to the original for periods that were never restated", () => {
    const rows = quarters(2026, [[100, null], [120, null], [140, null], [160, null]])
    rows[0] = { ...rows[0], revised_projected: 90 }
    expect(annualProjection(rows, 2026, "revised")!.value).toBe(510)
  })

  // Only the FY row was restated, so the revised annual figure is that number and
  // the original annual figure is still January's.
  it("prefers a restated FY row on the revised basis only", () => {
    const rows = [row({ period_type: "FY", fiscal_year: 2026, projected: 600, revised_projected: 450 })]
    expect(annualProjection(rows, 2026, "original")!.value).toBe(600)
    expect(annualProjection(rows, 2026, "revised")).toEqual({ value: 450, basis: "FY", revised: true })
  })
})

describe("axisTicks", () => {
  // The axis exists because the chart spans wildly different magnitudes. iO
  // Urology's quarterly view runs $20K actuals against a $4.28M 2027 plan, so
  // without labelled gridlines the 2026 bars are unreadable slivers.
  it("gives round money across a 200x range", () => {
    expect(axisTicks(4_281_000 * 1.08)).toEqual([0, 2_000_000, 4_000_000])
    expect(axisTicks(76_098 * 1.08)).toEqual([0, 25_000, 50_000, 75_000])
    expect(axisTicks(65_200_000 * 1.08)).toEqual([0, 20_000_000, 40_000_000, 60_000_000])
  })

  // A tick above the ceiling would render outside the plot band, since `max`
  // already includes the headroom the chart leaves above the tallest bar.
  it("never emits a tick above the ceiling", () => {
    for (const m of [1, 999, 4_623_480, 1e9]) {
      expect(Math.max(...axisTicks(m))).toBeLessThanOrEqual(m)
    }
  })

  it("always starts at zero, so bar heights are read against a real baseline", () => {
    for (const m of [1_000, 250_000, 12_577_000]) expect(axisTicks(m)[0]).toBe(0)
  })

  // Repeated += on a float accumulates drift; a label reading $2,000,000.0000001
  // would be the visible symptom.
  it("returns clean values, not float drift", () => {
    for (const t of axisTicks(12_577_000)) expect(t).toBe(Number(t.toFixed(6)))
  })

  it("degrades safely rather than looping forever on junk input", () => {
    expect(axisTicks(0)).toEqual([0])
    expect(axisTicks(-5)).toEqual([0])
    expect(axisTicks(NaN)).toEqual([0])
    expect(axisTicks(Infinity)).toEqual([0])
  })
})

describe("planValue / variance across bases", () => {
  // The fallback is what makes "revised" usable at all: only a handful of periods
  // are ever restated, and without it most of the book would read as having no plan.
  it("falls back to the original when nothing was restated", () => {
    const r = row({ period_type: "Q1", fiscal_year: 2026, projected: 100 })
    expect(planValue(r, "original")).toBe(100)
    expect(planValue(r, "revised")).toBe(100)
    expect(isRevised(r)).toBe(false)
  })

  it("uses the restatement on the revised basis and never on the original", () => {
    const r = row({ period_type: "Q1", fiscal_year: 2026, projected: 100, revised_projected: 60 })
    expect(planValue(r, "original")).toBe(100)
    expect(planValue(r, "revised")).toBe(60)
    expect(isRevised(r)).toBe(true)
  })

  // The case that motivated the split: a period beats a lowered target while
  // missing the one actually set. Both readings have to survive.
  it("scores the same actual differently on each basis", () => {
    const r = row({ period_type: "Q2", fiscal_year: 2026, projected: 100, revised_projected: 50, actual: 60 })
    expect(variance(r, "original")!.pct).toBeCloseTo(-40)
    expect(variance(r, "revised")!.pct).toBeCloseTo(20)
  })

  // Vektor Q3 2025: the reforecast is the only plan on record. It must not be
  // borrowed as an original — /analytics has to see "no target", not an easy one.
  it("reports no original plan when only a restatement exists", () => {
    const r = row({ period_type: "Q3", fiscal_year: 2025, revised_projected: 685000, actual: 616350 })
    expect(planValue(r, "original")).toBeNull()
    expect(variance(r, "original")).toBeNull()
    expect(variance(r, "revised")!.pct).toBeLessThan(0)
  })

  it("defaults to the original basis, so an unconsidered caller gets the strict answer", () => {
    const r = row({ period_type: "Q2", fiscal_year: 2026, projected: 100, revised_projected: 50, actual: 60 })
    expect(variance(r)!.pct).toBeCloseTo(-40)
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

  // Vektor 2025, the case that used to need a `projected_source === 'Reforecast'`
  // escape hatch here. Now that a restatement lives in its own column, Q3/Q4 carry
  // no original at all, so the year simply isn't fully planned on the original
  // basis and the check falls silent for the honest reason.
  it("stays silent when a year's restated quarters leave no original plan", () => {
    const rows = [
      row({ period_type: "Q1", fiscal_year: 2025, projected: 365000, projected_source: "Board deck" }),
      row({ period_type: "Q2", fiscal_year: 2025, projected: 450000, projected_source: "Board deck" }),
      row({ period_type: "Q3", fiscal_year: 2025, revised_projected: 685000, revised_source: "Company reforecast" }),
      row({ period_type: "Q4", fiscal_year: 2025, revised_projected: 900000, revised_source: "Company reforecast" }),
      row({ period_type: "FY", fiscal_year: 2025, projected: 2600000, projected_source: "Board deck" }),
    ]
    expect(annualMismatch(rows, 2025, "projected")).toBeNull()
    // And no false alarm on the revised column either — the FY row was never restated.
    expect(annualMismatch(rows, 2025, "revised_projected")).toBeNull()
  })

  // Each basis reconciles against itself. A restated FY row that contradicts its
  // own restated quarters is just as worth flagging as the original pair was.
  it("flags a revised FY row that contradicts its revised quarters", () => {
    const rows = [
      ...quarters(2026, [[100, null], [100, null], [100, null], [100, null]]).map((r) => ({
        ...r, revised_projected: 200,
      })),
      row({ period_type: "FY", fiscal_year: 2026, projected: 400, revised_projected: 1000 }),
    ]
    expect(annualMismatch(rows, 2026, "projected")).toBeNull()
    const m = annualMismatch(rows, 2026, "revised_projected")
    expect(m).not.toBeNull()
    expect(m!.fy).toBe(1000)
    expect(m!.quarters).toBe(800)
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
