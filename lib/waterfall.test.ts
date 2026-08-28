import { describe, it, expect } from "vitest"
import { computeWaterfall, lastRoundPrice, ShareClassWithHoldings } from "./waterfall"

// Minimal class builder — only the fields the waterfall reads.
let nextId = 0
function cls(over: Partial<ShareClassWithHoldings>): ShareClassWithHoldings {
  return {
    id: `c${nextId++}`,
    company_id: "co",
    name: over.name ?? "class",
    class_type: "Preferred",
    shares_outstanding: null,
    price_per_share: null,
    liq_pref_multiple: null,
    seniority: null,
    participating: null,
    convertible_balance: null,
    conversion_price: null,
    notes: null,
    created_at: "",
    portfolio_class_holdings: [],
    ...over,
  } as ShareClassWithHoldings
}

const payoutOf = (rows: ReturnType<typeof computeWaterfall>, name: string) => {
  const r = rows.find((x) => x.name === name)
  if (!r) throw new Error(`no row ${name}`)
  return r
}
const total = (rows: ReturnType<typeof computeWaterfall>) => rows.reduce((t, r) => t + r.payout, 0)

describe("lastRoundPrice", () => {
  it("picks the most senior priced preferred", () => {
    // Stimdia shape: A1 is pricier ($5.21) but B (seniority 1) is the last round
    const classes = [
      cls({ name: "B", shares_outstanding: 100, price_per_share: 4.69, seniority: 1 }),
      cls({ name: "A1", shares_outstanding: 100, price_per_share: 5.21, seniority: 2 }),
    ]
    expect(lastRoundPrice(classes)).toBe(4.69)
  })

  it("breaks a seniority tie by higher price, ignores unpriced and non-preferred", () => {
    const classes = [
      cls({ name: "B-1", shares_outstanding: 100, price_per_share: 2, seniority: 1 }),
      cls({ name: "B-2", shares_outstanding: 100, price_per_share: 3, seniority: 1 }),
      cls({ name: "A", shares_outstanding: 100, seniority: 2 }), // no price
      cls({ name: "Common", class_type: "Common", shares_outstanding: 100, price_per_share: 9 }),
    ]
    expect(lastRoundPrice(classes)).toBe(3)
  })

  it("is null with no priced preferred (e.g. the KSI II units row)", () => {
    expect(lastRoundPrice([cls({ class_type: "Other", shares_outstanding: 100 })])).toBeNull()
  })
})

describe("computeWaterfall — non-participating regimes", () => {
  // Simple stack: 1M common; pref A 1M sh @ $10 (basis $10M, sen 1); pref B 1M sh @ $0.50 (basis $0.5M, sen 2)
  const stack = () => [
    cls({ name: "A", shares_outstanding: 1_000_000, price_per_share: 10, seniority: 1 }),
    cls({ name: "B", shares_outstanding: 1_000_000, price_per_share: 0.5, seniority: 2 }),
    cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
  ]

  it("high exit: everyone converts and splits pro-rata", () => {
    const rows = computeWaterfall(60_000_000, stack(), 0.2)
    // $60M / 3M shares = $20/sh — beats both preferences
    for (const name of ["A", "B", "Common"]) expect(payoutOf(rows, name).payout).toBeCloseTo(20_000_000, 3)
    expect(payoutOf(rows, "A").mode).toBe("converted")
    expect(payoutOf(rows, "Common").mode).toBe("as-converted")
    expect(total(rows)).toBeCloseTo(60_000_000, 3)
  })

  it("mixed regime: cheap pref converts, expensive pref takes its preference", () => {
    const rows = computeWaterfall(12_000_000, stack(), 0.2)
    // B converts ($1/sh beats $0.50 basis-per-share); A stays on its $10M preference
    expect(payoutOf(rows, "A").payout).toBeCloseTo(10_000_000, 3)
    expect(payoutOf(rows, "A").mode).toBe("preference")
    expect(payoutOf(rows, "B").payout).toBeCloseTo(1_000_000, 3)
    expect(payoutOf(rows, "B").mode).toBe("converted")
    expect(payoutOf(rows, "Common").payout).toBeCloseTo(1_000_000, 3)
    expect(total(rows)).toBeCloseTo(12_000_000, 3)
  })

  it("insufficient exit: seniority pays down in order, juniors partial, common wiped", () => {
    const rows = computeWaterfall(10_200_000, stack(), 0.2)
    expect(payoutOf(rows, "A").payout).toBeCloseTo(10_000_000, 3) // sen 1, whole
    expect(payoutOf(rows, "B").payout).toBeCloseTo(200_000, 3) // sen 2, partial
    expect(payoutOf(rows, "B").mode).toBe("partial preference")
    expect(payoutOf(rows, "Common").payout).toBe(0)
    expect(payoutOf(rows, "Common").mode).toBe("wiped")
    expect(total(rows)).toBeCloseTo(10_200_000, 3)
  })

  it("pro-rates by basis within a seniority tier", () => {
    const rows = computeWaterfall(3_000_000, [
      cls({ name: "B-1", shares_outstanding: 1_000_000, price_per_share: 4, seniority: 1 }), // basis 4M
      cls({ name: "B-2", shares_outstanding: 1_000_000, price_per_share: 2, seniority: 1 }), // basis 2M
      cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
    ], 0.2)
    // $3M across a $6M pari tier → half of each basis
    expect(payoutOf(rows, "B-1").payout).toBeCloseTo(2_000_000, 3)
    expect(payoutOf(rows, "B-2").payout).toBeCloseTo(1_000_000, 3)
  })

  it("respects the liq-pref multiple, assuming 1× only when silent", () => {
    const rows = computeWaterfall(5_000_000, [
      cls({ name: "A", shares_outstanding: 1_000_000, price_per_share: 2, liq_pref_multiple: 2, seniority: 1 }), // basis 4M
      cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
    ], 0.2)
    expect(payoutOf(rows, "A").payout).toBeCloseTo(4_000_000, 3)
    expect(payoutOf(rows, "A").assumed).toBeNull() // multiple stated → no assumption tag
    const silent = computeWaterfall(5_000_000, [
      cls({ name: "A", shares_outstanding: 1_000_000, price_per_share: 2, seniority: 1 }),
      cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
    ], 0.2)
    expect(payoutOf(silent, "A").assumed).toContain("1× multiple assumed")
  })

  it("treats priceless preferred as as-converted, tagged", () => {
    const rows = computeWaterfall(2_000_000, [
      cls({ name: "A", shares_outstanding: 1_000_000, seniority: 1 }), // no price → no preference
      cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
    ], 0.2)
    expect(payoutOf(rows, "A").payout).toBeCloseTo(1_000_000, 3)
    expect(payoutOf(rows, "A").assumed).toContain("no price on file")
  })
})

describe("computeWaterfall — participating preferred", () => {
  const classes = () => [
    cls({ name: "P", shares_outstanding: 1_000_000, price_per_share: 5, seniority: 1, participating: true }), // basis 5M
    cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
  ]

  it("takes its preference AND shares pro-rata", () => {
    const rows = computeWaterfall(15_000_000, classes(), 0.2)
    // 5M off the top, then 10M residual across 2M shares
    expect(payoutOf(rows, "P").payout).toBeCloseTo(5_000_000 + 5_000_000, 3)
    expect(payoutOf(rows, "P").mode).toBe("participating")
    expect(payoutOf(rows, "Common").payout).toBeCloseTo(5_000_000, 3)
    expect(total(rows)).toBeCloseTo(15_000_000, 3)
  })

  it("joins the seniority pay-down when the exit is short of the stack", () => {
    const rows = computeWaterfall(3_000_000, classes(), 0.2)
    expect(payoutOf(rows, "P").payout).toBeCloseTo(3_000_000, 3)
    expect(payoutOf(rows, "Common").payout).toBe(0)
  })

  it("regression: Francis at the workbook's $1B scenario", () => {
    // "Francis all entity waterfall.xlsx" (4/6/2026): gross exit $985.5M after
    // fees, preference $158,032,236 returned, then pro-rata over 159,889,938
    // shares — its "exit proceeds after preference" line is $827,467,763.6.
    const francis = [
      cls({ name: "Preferred", shares_outstanding: 126_374_519, price_per_share: 1.2505057, liq_pref_multiple: 1, seniority: 1, participating: true }),
      cls({ name: "Common", class_type: "Common", shares_outstanding: 1_537_432 }),
      cls({ name: "Pool granted", class_type: "Option pool", shares_outstanding: 18_488_330 }),
      cls({ name: "Pool available", class_type: "Option pool", shares_outstanding: 13_489_657 }),
    ]
    const rows = computeWaterfall(985_500_000, francis, 0.2)
    const pref = payoutOf(rows, "Preferred")
    const basis = 126_374_519 * 1.2505057
    // The stored price is the blended $158,032,236 / 126,374,519 rounded to 7
    // decimals, which puts the basis ~$180 off the workbook — 0.0001% of the
    // preference, immaterial for a directional tool but documented here.
    expect(Math.abs(basis - 158_032_236)).toBeLessThan(250)
    const residual = 985_500_000 - basis
    expect(Math.abs(residual - 827_467_763.6)).toBeLessThan(250)
    const perShare = residual / 159_889_938
    expect(pref.payout).toBeCloseTo(basis + 126_374_519 * perShare, 0)
    expect(total(rows)).toBeCloseTo(985_500_000, 0)
  })
})

describe("computeWaterfall — unconverted notes", () => {
  const base = () => [
    cls({ name: "B", shares_outstanding: 1_000_000, price_per_share: 2, seniority: 1 }), // basis 2M, last round $2
    cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
  ]

  it("derives the conversion price from the discount to the last round", () => {
    const rows = computeWaterfall(50_000_000, [...base(), cls({ name: "Note", class_type: "Other", convertible_balance: 1_600_000 })], 0.2)
    const note = payoutOf(rows, "Note")
    // $2 × (1 − 20%) = $1.60 → 1M note shares
    expect(note.shares).toBeCloseTo(1_000_000, 3)
    expect(note.assumed).toContain("20% discount")
    expect(total(rows)).toBeCloseTo(50_000_000, 3)
  })

  it("uses documented conversion terms over the discount", () => {
    const rows = computeWaterfall(50_000_000, [...base(), cls({ name: "2025A", class_type: "Other", convertible_balance: 2_000_000, conversion_price: 0.7528 })], 0.2)
    const note = payoutOf(rows, "2025A")
    expect(note.shares).toBeCloseTo(2_000_000 / 0.7528, 1)
    expect(note.assumed).toContain("per note terms")
  })

  it("floors at its balance ahead of the preferred stack at a low exit", () => {
    const rows = computeWaterfall(1_500_000, [...base(), cls({ name: "Note", class_type: "Other", convertible_balance: 1_000_000 })], 0.2)
    // note (seniority 0, debt-like) is made whole first; B takes the remainder
    expect(payoutOf(rows, "Note").payout).toBeCloseTo(1_000_000, 3)
    expect(payoutOf(rows, "B").payout).toBeCloseTo(500_000, 3)
    expect(payoutOf(rows, "Common").payout).toBe(0)
  })

  it("holdings on a note row are dollars of balance, via unitTotal", () => {
    const rows = computeWaterfall(50_000_000, [
      ...base(),
      cls({
        name: "Note", class_type: "Other", convertible_balance: 1_600_000,
        portfolio_class_holdings: [{ id: "h", class_id: "c", entity: "Fund II", shares: 400_000, created_at: "" }],
      }),
    ], 0.2)
    const note = payoutOf(rows, "Note")
    expect(note.unitTotal).toBe(1_600_000) // dollars, not the 1M converted shares
    // Fund II's quarter of the balance → a quarter of the note's payout
    expect((note.payout * 400_000) / note.unitTotal).toBeCloseTo(note.payout / 4, 3)
  })

  it("skips a note it cannot price, and a convertible row with no balance", () => {
    const noPricedPref = [
      cls({ name: "Common", class_type: "Common", shares_outstanding: 1_000_000 }),
      cls({ name: "Note", class_type: "Other", convertible_balance: 1_000_000 }), // no last round, no documented price
      cls({ name: "Empty CN", class_type: "Other" }), // no balance at all
    ]
    const rows = computeWaterfall(10_000_000, noPricedPref, 0.2)
    expect(rows.find((r) => r.name === "Note")).toBeUndefined()
    expect(rows.find((r) => r.name === "Empty CN")).toBeUndefined()
    expect(total(rows)).toBeCloseTo(10_000_000, 3)
  })
})
