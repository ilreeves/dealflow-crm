import { describe, it, expect } from "vitest"
import { noteAccruedInterest, fmtMoney, valueColor, calendarDaysUntil, dayCount } from "./rounds"

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

describe("calendarDaysUntil", () => {
  it("is 0 on the day itself, whatever the time of day", () => {
    expect(calendarDaysUntil("2026-09-24", "2026-09-24")).toBe(0)
    // Default asOf is "now" — today's date must be 0 even late in the day
    // (the old ms-diff version said "matured 1 days ago" after noon).
    const d = new Date()
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    expect(calendarDaysUntil(today)).toBe(0)
  })

  it("counts whole calendar days, negative once passed", () => {
    expect(calendarDaysUntil("2026-09-25", "2026-09-24")).toBe(1)
    expect(calendarDaysUntil("2026-09-23", "2026-09-24")).toBe(-1)
    expect(calendarDaysUntil("2026-12-31", "2026-09-24")).toBe(98)
  })

  it("is not thrown off by a DST change", () => {
    // US DST ends 2026-11-01; a raw ms diff comes up an hour short.
    expect(calendarDaysUntil("2026-11-02", "2026-10-31")).toBe(2)
  })

  it("returns null on missing or unreadable dates", () => {
    expect(calendarDaysUntil(null)).toBeNull()
    expect(calendarDaysUntil("not-a-date", "2026-09-24")).toBeNull()
  })
})

describe("dayCount", () => {
  it("pluralises", () => {
    expect(dayCount(1)).toBe("1 day")
    expect(dayCount(0)).toBe("0 days")
    expect(dayCount(12)).toBe("12 days")
  })
})
