import { describe, it, expect } from "vitest"
import { noteAccruedInterest, fmtMoney, valueColor } from "./rounds"

describe("noteAccruedInterest", () => {
  it("computes 10% simple Actual/365 — the firm convention", () => {
    // $1M at 10% for exactly one 365-day year = $100,000
    expect(noteAccruedInterest(1_000_000, 10, "2025-01-01", "2026-01-01")).toBeCloseTo(100_000, 5)
  })

  it("counts actual calendar days (366 across a leap year)", () => {
    // 2024 is a leap year: Jan 1 2024 → Jan 1 2025 is 366 days
    expect(noteAccruedInterest(1_000_000, 10, "2024-01-01", "2025-01-01")).toBeCloseTo(
      1_000_000 * 0.1 * (366 / 365), 5,
    )
  })

  it("is zero on the start date itself", () => {
    expect(noteAccruedInterest(500_000, 10, "2026-08-11", "2026-08-11")).toBe(0)
  })

  it("returns null rather than a negative accrual for a future start date", () => {
    expect(noteAccruedInterest(500_000, 10, "2027-01-01", "2026-08-11")).toBeNull()
  })

  it("returns null on missing inputs", () => {
    expect(noteAccruedInterest(null, 10, "2026-01-01", "2026-08-11")).toBeNull()
    expect(noteAccruedInterest(500_000, null, "2026-01-01", "2026-08-11")).toBeNull()
    expect(noteAccruedInterest(500_000, 10, null, "2026-08-11")).toBeNull()
    expect(noteAccruedInterest(500_000, 10, "not-a-date", "2026-08-11")).toBeNull()
  })

  it("part-year accrual: 73 days is exactly a fifth of a year", () => {
    expect(noteAccruedInterest(1_000_000, 10, "2026-01-01", "2026-03-15")).toBeCloseTo(20_000, 5)
  })
})

describe("fmtMoney", () => {
  it("puts the sign outside the currency symbol", () => {
    expect(fmtMoney(-4_500_000)).toBe("-$4.5M")
  })

  it("promotes the unit where K would round up to 1000", () => {
    expect(fmtMoney(999_500)).toBe("$1.0M") // used to render "$1000K"
    expect(fmtMoney(999_499)).toBe("$999K")
  })
})

describe("valueColor", () => {
  it("stays neutral when there is no cost basis", () => {
    expect(valueColor(1_000_000, null)).toBe("#64748b")
  })

  it("a real $0 basis still paints a positive value as a gain", () => {
    expect(valueColor(1_000_000, 0)).toBe("#5ba200")
  })
})
