import { describe, it, expect } from "vitest"
import type { PortfolioCash } from "./types"
import {
  DAYS_PER_MONTH,
  monthsBetween,
  addMonths,
  isBurning,
  derivedRunwayMonths,
  statedRunwayMonths,
  runwayMonths,
  zeroCashDate,
  monthsLeft,
  impliedCash,
  proFormaRunwayMonths,
  runwayMismatch,
  staleness,
  runwayBandColor,
  median,
  fmtMonths,
  sortCash,
  burnTrendPct,
  cashMovementBurn,
  movementUnderstatesBurn,
  latestCash,
  latestRunwaySource,
  buildCompanyRunway,
  byUrgency,
  isActive,
  RUNWAY_COLORS,
  RUNWAY_BANDS,
  STALE_MONTHS,
} from "./runway"

// These are conventions, not preferences. Each exists because getting it wrong
// produces a plausible-looking number rather than an error — a cash-positive
// company painted as having zero runway, a stale balance presented as current, a
// stated runway silently overwritten by arithmetic. If one of these fails, a
// figure somewhere is now lying.

let seq = 0
function row(p: Partial<PortfolioCash> & { as_of: string }): PortfolioCash {
  return {
    id: `c${seq++}`,
    company_id: "co1",
    cash_on_hand: null,
    monthly_burn: null,
    burn_basis: null,
    runway_months: null,
    out_of_cash_date: null,
    committed_funding: null,
    source: null,
    source_detail: null,
    notes: null,
    created_by: null,
    updated_by: null,
    created_at: "",
    updated_at: "",
    ...p,
  }
}

describe("date arithmetic", () => {
  it("monthsBetween and addMonths round-trip to within half a day", () => {
    // The UI shows a month count AND a date derived from the same runway, so
    // these must not drift visibly. A calendar date is day-resolution by nature,
    // so half a day (0.017 months) is the tightest achievable — and invisible at
    // the one decimal place the UI prints. What this pins down is that the error
    // stays a ROUNDING, and doesn't grow with the interval.
    const start = "2026-01-15"
    for (const m of [1, 6, 9.4, 18, 0.5, 37]) {
      expect(monthsBetween(start, addMonths(start, m))).toBeCloseTo(m, 1)
    }
  })

  it("formats from local components, not UTC", () => {
    // toISOString on a local-midnight date returns the PREVIOUS day at any
    // positive UTC offset, which would shift every derived out-of-cash date.
    expect(addMonths("2026-01-15", 0)).toBe("2026-01-15")
    expect(addMonths("2026-03-01", 1)).toBe("2026-03-31")
  })

  it("is negative when the target date is earlier", () => {
    expect(monthsBetween("2026-08-01", "2026-05-01")).toBeLessThan(0)
  })

  it("uses a fixed 365.25/12 month", () => {
    expect(DAYS_PER_MONTH).toBeCloseTo(30.4375, 6)
  })
})

describe("burn is zero or below", () => {
  // The failure this prevents: a profitable company sorting to the top of the
  // urgency queue in red, because 0 burn was read as 0 months of runway.
  it("is not burning", () => {
    expect(isBurning(row({ as_of: "2026-06-30", monthly_burn: 0 }))).toBe(false)
    expect(isBurning(row({ as_of: "2026-06-30", monthly_burn: -50_000 }))).toBe(false)
    expect(isBurning(row({ as_of: "2026-06-30", monthly_burn: 1 }))).toBe(true)
  })

  it("yields no runway rather than zero runway", () => {
    const r = row({ as_of: "2026-06-30", cash_on_hand: 5_000_000, monthly_burn: 0 })
    expect(derivedRunwayMonths(r)).toBeNull()
    expect(runwayMonths(r)).toBeNull()
    expect(zeroCashDate(r)).toBeNull()
    expect(impliedCash(r, "2026-08-07")).toBeNull()
  })
})

describe("null is not zero", () => {
  it("no cash figure yields no runway", () => {
    expect(derivedRunwayMonths(row({ as_of: "2026-06-30", monthly_burn: 400_000 }))).toBeNull()
  })

  it("no burn figure yields no derived runway", () => {
    expect(derivedRunwayMonths(row({ as_of: "2026-06-30", cash_on_hand: 4_000_000 }))).toBeNull()
  })

  it("but a stated runway still stands without a burn figure", () => {
    // Decks often state runway without ever printing a burn number. Losing the
    // runway because the arithmetic can't be done would discard real data.
    const r = row({ as_of: "2026-06-30", cash_on_hand: 4_000_000, runway_months: 10 })
    expect(runwayMonths(r)).toMatchObject({ months: 10, basis: "stated", derived: null })
  })
})

describe("stated wins, derived is retained", () => {
  it("prefers the company's own figure", () => {
    const r = row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 500_000, runway_months: 9 })
    const got = runwayMonths(r)!
    expect(got.basis).toBe("stated")
    expect(got.months).toBe(9)
    // Arithmetic says 6 — kept, not discarded, so the gap stays visible.
    expect(got.derived).toBeCloseTo(6, 6)
  })

  it("falls back to arithmetic when nothing was stated", () => {
    const r = row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 500_000 })
    expect(runwayMonths(r)).toMatchObject({ basis: "derived" })
    expect(runwayMonths(r)!.months).toBeCloseTo(6, 6)
  })

  it("reads a stated out-of-cash date as the same claim as a stated month count", () => {
    const r = row({ as_of: "2026-06-30", out_of_cash_date: "2027-03-31" })
    expect(statedRunwayMonths(r)).toBeCloseTo(monthsBetween("2026-06-30", "2027-03-31"), 6)
    expect(runwayMonths(r)!.basis).toBe("stated")
  })
})

describe("zero-cash date is the single source of truth", () => {
  it("months left is measured from the displayed date, so the two agree", () => {
    const r = row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 500_000 })
    const z = zeroCashDate(r)!
    expect(monthsLeft(r, "2026-08-07")).toBeCloseTo(monthsBetween("2026-08-07", z.date), 6)
  })

  it("uses a stated date verbatim rather than re-deriving it", () => {
    const r = row({
      as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 500_000, out_of_cash_date: "2027-06-30",
    })
    expect(zeroCashDate(r)).toEqual({ date: "2027-06-30", basis: "stated" })
  })
})

describe("aging a report forward to today", () => {
  // The core purpose of the tab. A February deck saying "9 months" must not read
  // as 9 months in August.
  const feb = row({ as_of: "2026-02-01", cash_on_hand: 4_500_000, monthly_burn: 500_000 })

  it("shrinks the remaining runway as time passes", () => {
    expect(runwayMonths(feb)!.months).toBeCloseTo(9, 6)
    expect(monthsLeft(feb, "2026-08-07")!).toBeLessThan(3)
  })

  it("goes negative once the runway has lapsed, rather than clamping at zero", () => {
    // "Ran out two months ago" and "runs out today" must not look identical.
    expect(monthsLeft(feb, "2026-12-31")!).toBeLessThan(0)
    expect(impliedCash(feb, "2026-12-31")!).toBeLessThan(0)
  })

  it("extrapolates cash at the reported burn rate", () => {
    // Six months on from Feb 1 at $500K/mo: about $1.5M of the $4.5M left.
    expect(impliedCash(feb, "2026-08-01")!).toBeCloseTo(4_500_000 - 500_000 * monthsBetween("2026-02-01", "2026-08-01"), 6)
  })

  it("flags an observation older than one board cycle plus slack", () => {
    expect(staleness(feb, "2026-08-07").stale).toBe(true)
    expect(staleness(row({ as_of: "2026-07-01" }), "2026-08-07").stale).toBe(false)
    expect(STALE_MONTHS).toBe(4)
  })
})

describe("committed funding is not cash", () => {
  const r = row({ as_of: "2026-06-30", cash_on_hand: 2_000_000, monthly_burn: 500_000, committed_funding: 3_000_000 })

  it("is excluded from the headline runway", () => {
    expect(runwayMonths(r)!.months).toBeCloseTo(4, 6)
  })

  it("drives a separate pro-forma figure", () => {
    expect(proFormaRunwayMonths(r)).toBeCloseTo(10, 6)
  })

  it("is absent when nothing was committed, rather than equalling the headline", () => {
    expect(proFormaRunwayMonths(row({ as_of: "2026-06-30", cash_on_hand: 2_000_000, monthly_burn: 500_000 }))).toBeNull()
  })
})

describe("stated-vs-derived reconciliation", () => {
  it("flags a stated runway the cash and burn don't support", () => {
    // Deck says 12 months over a slide showing $3M and $400K/mo, which is 7.5.
    const r = row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 400_000, runway_months: 12 })
    const mm = runwayMismatch(r)!
    expect(mm.stated).toBe(12)
    expect(mm.derived).toBeCloseTo(7.5, 6)
    expect(mm.pct).toBeLessThan(0)
  })

  it("stays quiet on a small absolute gap even when the percentage is large", () => {
    // 2.0 stated vs 2.8 derived is a 40% gap — well past the percentage
    // tolerance — but only 0.8 months, which is noise against the news that the
    // company is nearly out either way. Only the absolute floor catches this
    // one; the percentage test alone would fire.
    const r = row({ as_of: "2026-06-30", cash_on_hand: 1_400_000, monthly_burn: 500_000, runway_months: 2 })
    expect(runwayMismatch(r)).toBeNull()
  })

  it("stays quiet on a small percentage even when the absolute gap is large", () => {
    // 30 stated vs 33 derived: 3 months, but only 10% — expected forecasting noise.
    const r = row({ as_of: "2026-06-30", cash_on_hand: 3_300_000, monthly_burn: 100_000, runway_months: 30 })
    expect(runwayMismatch(r)).toBeNull()
  })

  it("needs both sides to compare", () => {
    expect(runwayMismatch(row({ as_of: "2026-06-30", runway_months: 12 }))).toBeNull()
    expect(runwayMismatch(row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 400_000 }))).toBeNull()
  })

  it("never rewrites the stated figure it flags", () => {
    const r = row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 400_000, runway_months: 12 })
    expect(runwayMismatch(r)).not.toBeNull()
    expect(runwayMonths(r)!.months).toBe(12)
  })
})

describe("burn trend", () => {
  it("compares the two most recent observations that report a burn", () => {
    const rows = [
      row({ as_of: "2026-06-30", monthly_burn: 600_000, burn_basis: "Net burn" }),
      // A cash-only snapshot in between must not break the series.
      row({ as_of: "2026-05-31", cash_on_hand: 1_000_000 }),
      row({ as_of: "2026-03-31", monthly_burn: 500_000, burn_basis: "Net burn" }),
    ]
    const t = burnTrendPct(rows)!
    expect(t.pct).toBeCloseTo(20, 6)
    expect(t.from.as_of).toBe("2026-03-31")
  })

  it("refuses to compare across different bases", () => {
    // Net burn against gross opex is two measurements, not a trend.
    const rows = [
      row({ as_of: "2026-06-30", monthly_burn: 600_000, burn_basis: "Gross opex" }),
      row({ as_of: "2026-03-31", monthly_burn: 500_000, burn_basis: "Net burn" }),
    ]
    expect(burnTrendPct(rows)).toBeNull()
  })

  it("needs two figures", () => {
    expect(burnTrendPct([row({ as_of: "2026-06-30", monthly_burn: 600_000 })])).toBeNull()
  })
})

describe("cash-movement burn — the only cross-company comparable figure", () => {
  it("reads the actual monthly spend out of two balances", () => {
    // InterShunt's real numbers: $13,428,717 at 5/31 to $12,929,120 at 6/30.
    const rows = [
      row({ as_of: "2026-06-30", cash_on_hand: 12_929_120 }),
      row({ as_of: "2026-05-31", cash_on_hand: 13_428_717 }),
    ]
    const m = cashMovementBurn(rows)!
    expect(m.cashRose).toBe(false)
    expect(m.perMonth).toBeCloseTo((13_428_717 - 12_929_120) / monthsBetween("2026-05-31", "2026-06-30"), 4)
    expect(m.perMonth).toBeGreaterThan(480_000)
    expect(m.perMonth).toBeLessThan(530_000)
  })

  it("FLAGS a rise in cash rather than reporting negative burn", () => {
    // The dangerous case: a raise lands between observations, cash goes UP, and
    // a naive (older − newer) reads as negative burn — which isBurning() would
    // treat as "covering its own costs". That would paint the most cash-hungry
    // company in the book as the healthiest.
    const rows = [
      row({ as_of: "2026-06-30", cash_on_hand: 20_000_000 }),
      row({ as_of: "2026-03-31", cash_on_hand: 4_000_000 }),
    ]
    const m = cashMovementBurn(rows)!
    expect(m.cashRose).toBe(true)
    expect(m.perMonth).toBeLessThan(0)
  })

  it("is excluded from the page row when cash rose", () => {
    const raised = [
      { ...row({ as_of: "2026-06-30", cash_on_hand: 20_000_000, monthly_burn: 500_000 }), company_id: "a" },
      { ...row({ as_of: "2026-03-31", cash_on_hand: 4_000_000 }), company_id: "a" },
    ] as PortfolioCash[]
    const built = buildCompanyRunway([{ id: "a", name: "Raised", status: "Active" }], raised, "2026-08-07")[0]
    expect(built.movementBurn).toBeNull()
    expect(built.movementBasis).toBeNull()
  })

  it("FLAGS financing that merely OFFSETS burn, which cashRose cannot catch", () => {
    // Tvardi's real numbers. Cash drifts DOWN $20.648M → $19.851M over 9 months
    // while operating burn runs $1.953M/mo, because ~$21M was raised over the
    // window. cashRose stays FALSE because the balance fell — yet the movement
    // figure is an eightfold understatement. Without this check nothing catches it.
    const rows = [
      row({ as_of: "2026-03-31", cash_on_hand: 19_851_000, monthly_burn: 1_953_000 }),
      row({ as_of: "2025-06-30", cash_on_hand: 20_648_000 }),
    ]
    const m = cashMovementBurn(rows)!
    expect(m.cashRose).toBe(false)
    expect(m.perMonth).toBeLessThan(400_000)
    expect(movementUnderstatesBurn(1_953_000, m.perMonth)).toBe(true)
  })

  it("does not flag a movement that agrees with the reported burn", () => {
    // Francis Medical: $2,560,148 movement vs $2,607,000 reported — inside 2%.
    expect(movementUnderstatesBurn(2_607_000, 2_560_148)).toBe(false)
    // Vektor: $1,151,552 vs $1,127,000 — movement slightly HIGHER, fine.
    expect(movementUnderstatesBurn(1_127_000, 1_151_552)).toBe(false)
  })

  it("needs both figures to compare, and ignores a non-positive reported burn", () => {
    expect(movementUnderstatesBurn(null, 300_000)).toBe(false)
    expect(movementUnderstatesBurn(1_000_000, null)).toBe(false)
    expect(movementUnderstatesBurn(0, 300_000)).toBe(false)
  })

  it("surfaces the flag on the page row", () => {
    const rows = [
      { ...row({ as_of: "2026-03-31", cash_on_hand: 19_851_000, monthly_burn: 1_953_000 }), company_id: "t" },
      { ...row({ as_of: "2025-06-30", cash_on_hand: 20_648_000 }), company_id: "t" },
    ] as PortfolioCash[]
    const built = buildCompanyRunway([{ id: "t", name: "Tvardi", status: "Active" }], rows, "2026-08-07")[0]
    expect(built.movementUnderstated).toBe(true)
  })

  it("refuses balances too close together to imply a monthly rate", () => {
    const rows = [
      row({ as_of: "2026-06-30", cash_on_hand: 4_000_000 }),
      row({ as_of: "2026-06-25", cash_on_hand: 4_200_000 }),
    ]
    expect(cashMovementBurn(rows)).toBeNull()
  })

  it("needs two balances, not two rows", () => {
    // A burn-only snapshot doesn't count as a second balance.
    const rows = [
      row({ as_of: "2026-06-30", cash_on_hand: 4_000_000 }),
      row({ as_of: "2026-03-31", monthly_burn: 500_000 }),
    ]
    expect(cashMovementBurn(rows)).toBeNull()
  })
})

describe("row selection and ordering", () => {
  it("sorts newest first", () => {
    const rows = sortCash([row({ as_of: "2026-01-31" }), row({ as_of: "2026-06-30" }), row({ as_of: "2026-03-31" })])
    expect(rows.map((r) => r.as_of)).toEqual(["2026-06-30", "2026-03-31", "2026-01-31"])
  })

  it("sources CASH and RUNWAY from different rows when it has to", () => {
    // Stimdia's real shape: newest balance has no burn so yields no runway, and a
    // LATER investor presentation states a date with no balance attached. Keying
    // both off the cash row threw the statement away and showed no runway at all.
    const rows = [
      row({ as_of: "2026-04-23", out_of_cash_date: "2027-08-31" }),
      row({ as_of: "2025-12-31", cash_on_hand: 1_554_080 }),
    ]
    expect(latestCash(rows)!.as_of).toBe("2025-12-31")
    expect(latestRunwaySource(rows)!.as_of).toBe("2026-04-23")

    const built = buildCompanyRunway(
      [{ id: "s", name: "Stimdia", status: "Active" }],
      rows.map((r) => ({ ...r, company_id: "s" })) as PortfolioCash[],
      "2026-08-08",
    )[0]
    expect(built.cashOnHand).toBe(1_554_080)
    expect(built.asOf).toBe("2025-12-31")          // cash vintage
    expect(built.runwayAsOf).toBe("2026-04-23")    // runway vintage, later
    expect(built.outOfCash).toBe("2027-08-31")
    expect(built.monthsLeft!).toBeGreaterThan(11)
    // Staleness still describes the CASH figure — that's what goes stale.
    expect(built.stale).toBe(true)
  })

  it("leaves both vintages equal when one row carries everything", () => {
    const rows = [
      { ...row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 500_000 }), company_id: "a" },
    ] as PortfolioCash[]
    const built = buildCompanyRunway([{ id: "a", name: "A", status: "Active" }], rows, "2026-08-08")[0]
    expect(built.asOf).toBe(built.runwayAsOf)
  })

  it("takes the headline from the newest row that has a balance", () => {
    // A newer burn-only update must not blank out the cash figure we do have.
    const rows = [
      row({ as_of: "2026-06-30", monthly_burn: 500_000 }),
      row({ as_of: "2026-03-31", cash_on_hand: 4_000_000 }),
    ]
    expect(latestCash(rows)!.as_of).toBe("2026-03-31")
  })
})

describe("urgency ordering", () => {
  it("puts the soonest out of cash first and no-figure rows last", () => {
    const mk = (name: string, monthsLeft: number | null) => ({ name, monthsLeft }) as never
    const sorted = [mk("Alpha", 14), mk("Beta", null), mk("Gamma", 2), mk("Delta", -3)].sort(byUrgency)
    expect(sorted.map((r: { name: string }) => r.name)).toEqual(["Delta", "Gamma", "Alpha", "Beta"])
  })

  it("breaks ties alphabetically so the order is stable between loads", () => {
    const mk = (name: string, monthsLeft: number | null) => ({ name, monthsLeft }) as never
    const sorted = [mk("Zeta", 6), mk("Alpha", 6)].sort(byUrgency)
    expect(sorted.map((r: { name: string }) => r.name)).toEqual(["Alpha", "Zeta"])
  })
})

describe("roster", () => {
  const companies = [
    { id: "a", name: "Active WithData", status: "Active" },
    { id: "b", name: "Active NoData", status: "Active" },
    { id: "c", name: "Legacy NoData", status: "Legacy" },
    { id: "d", name: "Legacy WithData", status: "Legacy" },
    { id: "e", name: "Exited NoData", status: "Exited" },
  ]
  const cash = [
    { ...row({ as_of: "2026-06-30", cash_on_hand: 3_000_000, monthly_burn: 500_000 }), company_id: "a" },
    { ...row({ as_of: "2026-06-30", cash_on_hand: 100_000 }), company_id: "d" },
  ]

  it("covers active companies whether or not they have data", () => {
    // A company with no cash figures is a gap in our own coverage, and this page
    // is the only place that gap is visible.
    const names = buildCompanyRunway(companies, cash, "2026-08-07").map((r) => r.name)
    expect(names).toContain("Active WithData")
    expect(names).toContain("Active NoData")
  })

  it("drops wound-down companies with nothing recorded", () => {
    const names = buildCompanyRunway(companies, cash, "2026-08-07").map((r) => r.name)
    expect(names).not.toContain("Legacy NoData")
    expect(names).not.toContain("Exited NoData")
  })

  it("keeps wound-down companies that DO have figures, so nothing entered becomes invisible", () => {
    const names = buildCompanyRunway(companies, cash, "2026-08-07").map((r) => r.name)
    expect(names).toContain("Legacy WithData")
  })

  it("classifies status", () => {
    expect(isActive("Active")).toBe(true)
    expect(isActive(null)).toBe(true)
    expect(isActive("Legacy")).toBe(false)
    expect(isActive("Exited")).toBe(false)
  })

  it("computes each row from the same helpers the tab uses", () => {
    const r = buildCompanyRunway(companies, cash, "2026-08-07").find((x) => x.id === "a")!
    expect(r.runwayMonths).toBeCloseTo(6, 6)
    expect(r.runwayBasis).toBe("derived")
    expect(r.monthsLeft!).toBeLessThan(6)
    expect(r.snapshotCount).toBe(1)
  })
})

describe("presentation", () => {
  it("bands runway by how long a raise takes — Isaiah's four thresholds", () => {
    // >12 green · 6-12 navy · 3-6 orange · <3 red (and red once lapsed).
    expect(runwayBandColor(18)).toBe(RUNWAY_COLORS.green)
    expect(runwayBandColor(12)).toBe(RUNWAY_COLORS.green)
    expect(runwayBandColor(11.9)).toBe(RUNWAY_COLORS.navy)
    expect(runwayBandColor(9)).toBe(RUNWAY_COLORS.navy)
    expect(runwayBandColor(6)).toBe(RUNWAY_COLORS.navy)
    expect(runwayBandColor(5.9)).toBe(RUNWAY_COLORS.orange)
    expect(runwayBandColor(3)).toBe(RUNWAY_COLORS.orange)
    expect(runwayBandColor(2.9)).toBe(RUNWAY_COLORS.red)
    expect(runwayBandColor(1)).toBe(RUNWAY_COLORS.red)
    expect(runwayBandColor(0)).toBe(RUNWAY_COLORS.red)
    expect(runwayBandColor(-4)).toBe(RUNWAY_COLORS.red)
  })

  it("keeps the bands ordered so no gap or overlap can open up", () => {
    expect(RUNWAY_BANDS.critical).toBeLessThan(RUNWAY_BANDS.acute)
    expect(RUNWAY_BANDS.acute).toBeLessThan(RUNWAY_BANDS.caution)
  })

  it("treats an absent runway as neutral, never as a warning", () => {
    // No data is not bad news; painting it orange would invent a problem.
    expect(runwayBandColor(null)).toBe(RUNWAY_COLORS.navy)
    expect(runwayBandColor(undefined)).toBe(RUNWAY_COLORS.navy)
  })

  it("prints a lapsed runway in words rather than as a negative month count", () => {
    expect(fmtMonths(-2.5)).toBe("out")
    expect(fmtMonths(0)).toBe("out")
    expect(fmtMonths(9.44)).toBe("9.4 mo")
    expect(fmtMonths(null)).toBe("—")
  })
})

describe("median", () => {
  it("takes the middle value, and averages the middle two on an even count", () => {
    expect(median([1, 5, 3])).toBe(3)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it("ignores nulls rather than counting them as zero", () => {
    // A company with no runway figure must not drag the portfolio median down —
    // "not measured" is not "out of money".
    expect(median([10, null, 20, undefined])).toBe(15)
    expect(median([null, undefined])).toBeNull()
    expect(median([])).toBeNull()
  })

  it("sorts numerically, not lexicographically", () => {
    // The default Array.prototype.sort would order these 1, 10, 2 and return 10.
    expect(median([1, 10, 2])).toBe(2)
  })

  // The whole reason the tile is a median: one long-runway company must not
  // drag the headline away from where most of the book actually sits.
  it("resists an outlier that would distort a mean", () => {
    const book = [1, 2.7, 5.4, 5.8, 6.7, 7.7, 8.7, 9.2, 11.6, 12.7, 17.8, 32.9]
    const mean = book.reduce((a, b) => a + b, 0) / book.length
    expect(median(book)).toBe(8.2)
    expect(mean).toBeGreaterThan(10)
  })

  it("keeps lapsed companies in — excluding them would flatter the book", () => {
    expect(median([-3, 1, 2])).toBe(1)
    expect(median([-6, -2])).toBe(-4)
  })

  it("drops non-finite values instead of returning NaN", () => {
    expect(median([1, NaN, 3])).toBe(2)
    expect(median([Infinity, 4, 6])).toBe(5)
  })
})
