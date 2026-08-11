import { describe, it, expect } from "vitest"
import type { PortfolioCash, PortfolioCashForecast } from "./types"
import {
  sortForecast,
  forecastVintages,
  forecastScenarios,
  forecastSeries,
  peakFundingNeed,
  forecastZeroCrossing,
  forecastBreakeven,
  burnTimeline,
  forecastAccuracy,
  forecastContradictsFlatBurn,
  FORECAST_MATCH_DAYS,
} from "./cashForecast"

// The failure these guard against is the same one the whole runway feature
// exists to prevent, just pointed forwards: a projection presented as a report.
// The second failure is subtler — splicing two vintages, or a funded path into
// an unfunded one, produces a smooth plausible curve that never existed.

let seq = 0
function f(p: Partial<PortfolioCashForecast> & { period_end: string }): PortfolioCashForecast {
  return {
    id: `f${seq++}`, company_id: "co1", forecast_as_of: "2026-08-10",
    cash_on_hand: null, monthly_burn: null, burn_basis: null, scenario: null,
    source: null, source_detail: null, notes: null,
    created_by: null, updated_by: null, created_at: "", updated_at: "", ...p,
  }
}
function a(p: Partial<PortfolioCash> & { as_of: string }): PortfolioCash {
  return {
    id: `a${seq++}`, company_id: "co1", cash_on_hand: null, monthly_burn: null,
    burn_basis: null, runway_months: null, out_of_cash_date: null, committed_funding: null,
    mismatch_ack_pct: null, mismatch_ack_note: null, mismatch_acked_at: null,
    mismatch_acked_by: null, source: null, source_detail: null, notes: null,
    created_by: null, updated_by: null, created_at: "", updated_at: "", ...p,
  }
}

// Francis Medical, Piper Sandler board deck 2026-08-10 p.9 — the unfunded path,
// in dollars. Quarterly burn from the deck divided by 3 to a monthly rate.
const FRANCIS: PortfolioCashForecast[] = [
  ["2026-09-30", 22_000_000, 3_000_000], ["2026-12-31", 10_000_000, 4_000_000],
  ["2027-03-31", -5_000_000, 5_000_000], ["2027-06-30", -17_000_000, 4_000_000],
  ["2027-09-30", -25_000_000, 2_666_667], ["2027-12-31", -34_000_000, 3_000_000],
  ["2028-03-31", -42_000_000, 2_666_667], ["2028-06-30", -46_000_000, 1_666_667],
  ["2028-09-30", -47_000_000, 0], ["2028-12-31", -48_000_000, 666_667],
  ["2029-03-31", -49_000_000, 333_333], ["2029-06-30", -45_000_000, -1_333_333],
  ["2029-09-30", -39_000_000, -2_000_000], ["2029-12-31", -35_000_000, -1_333_333],
].map(([period_end, cash_on_hand, monthly_burn]) =>
  f({ period_end: period_end as string, cash_on_hand: cash_on_hand as number,
      monthly_burn: monthly_burn as number, scenario: "Unfunded" }))

describe("a curve is read left to right", () => {
  it("orders oldest first, the opposite of portfolio_cash", () => {
    const out = sortForecast([f({ period_end: "2027-03-31" }), f({ period_end: "2026-09-30" })])
    expect(out.map((r) => r.period_end)).toEqual(["2026-09-30", "2027-03-31"])
  })
})

describe("one vintage, one scenario — never spliced", () => {
  const mixed = [
    f({ period_end: "2026-12-31", forecast_as_of: "2026-03-24", cash_on_hand: 20_000_000 }),
    f({ period_end: "2026-12-31", forecast_as_of: "2026-08-10", cash_on_hand: 10_000_000 }),
    f({ period_end: "2027-03-31", forecast_as_of: "2026-08-10", cash_on_hand: -5_000_000 }),
  ]

  it("keeps both vintages of the same period — the change IS the finding", () => {
    expect(forecastVintages(mixed)).toEqual(["2026-08-10", "2026-03-24"])
  })

  it("defaults to the newest vintage only", () => {
    const s = forecastSeries(mixed)
    expect(s).toHaveLength(2)
    expect(s.every((r) => r.forecast_as_of === "2026-08-10")).toBe(true)
    // The March view of Q4-2026 was $20M against August's $10M. Splicing them
    // would draw a curve that halves mid-quarter and never existed.
    expect(s[0].cash_on_hand).toBe(10_000_000)
  })

  it("can be asked for an older vintage explicitly", () => {
    const s = forecastSeries(mixed, { vintage: "2026-03-24" })
    expect(s).toHaveLength(1)
    expect(s[0].cash_on_hand).toBe(20_000_000)
  })

  it("never mixes a funded path into an unfunded one", () => {
    const scenarios = [
      f({ period_end: "2027-03-31", cash_on_hand: -5_000_000, scenario: "Unfunded" }),
      f({ period_end: "2027-03-31", cash_on_hand: 45_000_000, scenario: "J&J note" }),
    ]
    expect(forecastScenarios(scenarios)).toEqual(["J&J note", "Unfunded"])
    expect(forecastSeries(scenarios, { scenario: "Unfunded" })[0].cash_on_hand).toBe(-5_000_000)
    expect(forecastSeries(scenarios, { scenario: "J&J note" })[0].cash_on_hand).toBe(45_000_000)
  })

  it("base case is NULL scenario and sorts first", () => {
    const rows = [f({ period_end: "2027-03-31", scenario: "Haircut" }), f({ period_end: "2027-03-31" })]
    expect(forecastScenarios(rows)[0]).toBeNull()
  })
})

describe("the numbers that only a curve can give you", () => {
  it("reports the peak funding need, which is the size of the raise", () => {
    // Francis: -$49M in Q1-2029. This is why $35M does not settle it and $75M does.
    const need = peakFundingNeed(FRANCIS)!
    expect(need.amount).toBe(-49_000_000)
    expect(need.period_end).toBe("2029-03-31")
  })

  it("has no funding need when the curve never goes negative", () => {
    const funded = FRANCIS.map((r) => f({ ...r, cash_on_hand: Number(r.cash_on_hand) + 75_000_000 }))
    expect(peakFundingNeed(funded)).toBeNull()
    expect(forecastZeroCrossing(funded)).toBeNull()
  })

  it("finds the first negative period, at period resolution and not interpolated", () => {
    expect(forecastZeroCrossing(FRANCIS)).toBe("2027-03-31")
  })

  it("finds the first period the company stops burning", () => {
    // Changes the question from "runway" to "a bridge of a known size".
    expect(forecastBreakeven(FRANCIS)).toBe("2028-09-30")
  })

  it("does NOT treat breakeven as the bottom of the curve — burn isn't monotonic", () => {
    // Francis touches zero burn in Q3-2028, drifts positive again for two
    // quarters, and only turns durably cash-generating in Q2-2029. Its cash
    // trough is Q1-2029 — two quarters AFTER breakeven was first reached.
    // Reading breakeven as "the worst is behind us" would understate the hole
    // by $2M and the timing by six months.
    const breakeven = forecastBreakeven(FRANCIS)!
    const trough = peakFundingNeed(FRANCIS)!
    expect(trough.period_end > breakeven).toBe(true)
    expect(FRANCIS.find((r) => r.period_end === "2028-12-31")!.monthly_burn).toBeGreaterThan(0)
  })
})

describe("reported history and projection on one timeline", () => {
  const actuals = [
    a({ as_of: "2026-03-31", cash_on_hand: 42_136_000, monthly_burn: 3_736_000 }),
    a({ as_of: "2026-05-31", cash_on_hand: 36_332_539, monthly_burn: 3_416_667 }),
  ]

  it("marks every point so a projection can never render as a report", () => {
    const t = burnTimeline(actuals, FRANCIS)
    expect(t.filter((p) => !p.projected)).toHaveLength(2)
    expect(t.filter((p) => p.projected).length).toBeGreaterThan(0)
  })

  it("truncates the forecast to after the last reported balance", () => {
    // A deck projects from its own start, so its early quarters overlap history
    // that has since been reported. Two bars for one quarter invites reading a
    // superseded projection as current.
    const overlapping = [f({ period_end: "2026-03-31", cash_on_hand: 40_000_000 }), ...FRANCIS]
    const t = burnTimeline(actuals, overlapping)
    expect(t.filter((p) => p.date === "2026-03-31")).toHaveLength(1)
    expect(t.find((p) => p.date === "2026-03-31")!.projected).toBe(false)
    expect(t.find((p) => p.date === "2026-03-31")!.cash).toBe(42_136_000)
  })

  it("stays in chronological order across the join", () => {
    const t = burnTimeline(actuals, FRANCIS)
    expect(t.map((p) => p.date)).toEqual([...t.map((p) => p.date)].sort())
  })

  it("draws the whole forecast when nothing has been reported yet", () => {
    expect(burnTimeline([], FRANCIS)).toHaveLength(FRANCIS.length)
  })
})

describe("forecast accuracy is PAIRS, never a score", () => {
  const vintage = [
    f({ period_end: "2026-06-30", forecast_as_of: "2026-03-24", cash_on_hand: 31_400_000 }),
    f({ period_end: "2026-09-30", forecast_as_of: "2026-03-24", cash_on_hand: 25_000_000 }),
  ]

  it("pairs a projection with the balance later reported for that period", () => {
    const hits = forecastAccuracy(vintage, [a({ as_of: "2026-06-30", cash_on_hand: 33_000_000 })])
    expect(hits).toHaveLength(1)
    expect(hits[0].errorPct).toBeCloseTo(((33 - 31.4) / 31.4) * 100, 4)
    expect(hits[0].horizonMonths).toBeCloseTo(3.2, 1)
  })

  it("matches a month-end balance to a quarter-end projection within the window", () => {
    // Decks project quarter-ends; balances get reported at month-ends that don't
    // always coincide. 2026-06-30 vs 2026-06-15 is the same period.
    expect(forecastAccuracy(vintage, [a({ as_of: "2026-06-15", cash_on_hand: 33_000_000 })])).toHaveLength(1)
    expect(FORECAST_MATCH_DAYS).toBe(20)
  })

  it("takes the NEAREST actual, so one quarter cannot double-count", () => {
    const hits = forecastAccuracy(vintage, [
      a({ as_of: "2026-06-30", cash_on_hand: 33_000_000 }),
      a({ as_of: "2026-06-15", cash_on_hand: 35_000_000 }),
    ])
    expect(hits).toHaveLength(1)
    expect(hits[0].actual).toBe(33_000_000)
  })

  it("ignores a period the forecast already knew — that is a restatement, not a forecast", () => {
    const backward = [f({ period_end: "2026-03-31", forecast_as_of: "2026-08-10", cash_on_hand: 42_000_000 })]
    expect(forecastAccuracy(backward, [a({ as_of: "2026-03-31", cash_on_hand: 42_136_000 })])).toHaveLength(0)
  })

  it("returns nothing when no actual has landed yet", () => {
    expect(forecastAccuracy(FRANCIS, [a({ as_of: "2026-05-31", cash_on_hand: 36_332_539 })])).toHaveLength(0)
  })
})

describe("a curve outranks a flat rate when the two disagree", () => {
  const row = a({ as_of: "2026-05-31", cash_on_hand: 36_332_539, monthly_burn: 3_416_667 })

  it("flags Francis, where flat burn says dry and the curve says never", () => {
    // $75M committed: flat burn reports "dry Feb 2029", the company's own curve
    // never goes negative, because burn inverts in Q2-2029. A single rate cannot
    // represent a curve that changes sign.
    const funded = FRANCIS.map((r) => f({ ...r, cash_on_hand: Number(r.cash_on_hand) + 75_000_000 }))
    expect(forecastContradictsFlatBurn(row, funded)).toBe(true)
  })

  it("stays quiet when the curve and the arithmetic broadly agree", () => {
    // Flat burn puts this row dry ~mid-Apr 2027; a curve crossing that quarter agrees.
    const agreeing = [f({ period_end: "2027-03-31", cash_on_hand: -1_000_000 })]
    expect(forecastContradictsFlatBurn(row, agreeing)).toBe(false)
  })

  it("says nothing without a forecast, or about a company that isn't burning", () => {
    expect(forecastContradictsFlatBurn(row, [])).toBe(false)
    expect(forecastContradictsFlatBurn(a({ as_of: "2026-05-31", cash_on_hand: 5e6, monthly_burn: 0 }), FRANCIS)).toBe(false)
  })
})
