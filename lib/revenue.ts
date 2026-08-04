// Shared helpers for revenue tracking (portfolio Revenue tab + the
// portfolio-wide roll-up on Fund Performance).

import type { PortfolioRevenue, RevenuePeriod } from "./types"
import { REVENUE_PERIOD_END } from "./types"

/** "Q3 2026", "FY 2025" — the label people actually use for a period. */
export function periodLabel(r: Pick<PortfolioRevenue, "period_type" | "fiscal_year">): string {
  return `${r.period_type} ${r.fiscal_year}`
}

/** Sortable period end derived from the period type + fiscal year. */
export function periodEnd(periodType: string, fiscalYear: number): string {
  const suffix = REVENUE_PERIOD_END[periodType as RevenuePeriod] ?? "12-31"
  return `${fiscalYear}-${suffix}`
}

/**
 * Variance of actual against projection. Returns null unless BOTH sides exist —
 * a missing actual is "not reported yet", not a shortfall, and showing it as
 * -100% would read as a business collapse.
 */
export function variance(r: Pick<PortfolioRevenue, "projected" | "actual">): { abs: number; pct: number | null } | null {
  if (r.projected == null || r.actual == null) return null
  const p = Number(r.projected)
  const a = Number(r.actual)
  return { abs: a - p, pct: p !== 0 ? ((a - p) / Math.abs(p)) * 100 : null }
}

/** Green above plan, orange below, navy on plan. Matches the valueColor convention. */
export function varianceColor(abs: number | null | undefined): string {
  if (abs == null) return "#64748b"
  if (abs > 0) return "#5ba200"
  if (abs < 0) return "#e98925"
  return "#023a51"
}

export function fmtSignedPct(pct: number | null | undefined): string {
  if (pct == null || isNaN(Number(pct))) return "—"
  const n = Number(pct)
  return `${n > 0 ? "+" : ""}${n.toFixed(1)}%`
}

/**
 * Growth of an actual against the same period one year earlier. Comparing like
 * periods only — Q3 vs Q3, FY vs FY — because Q3-over-FY is meaningless and a
 * naive "previous row" comparison produces exactly that on mixed cadences.
 */
export function yoyGrowth(rows: PortfolioRevenue[], row: PortfolioRevenue): number | null {
  if (row.actual == null) return null
  const prior = rows.find(
    (r) => r.period_type === row.period_type && r.fiscal_year === row.fiscal_year - 1 && r.actual != null,
  )
  if (!prior || Number(prior.actual) === 0) return null
  return ((Number(row.actual) - Number(prior.actual!)) / Math.abs(Number(prior.actual!))) * 100
}

/**
 * One company's revenue picture for the Revenue page. Computed once, on the
 * server, so the roll-up rules can't drift between surfaces.
 */
export type CompanyRevenue = {
  id: string
  name: string
  status: string | null
  /** On the roster. False here means "has figures but was untracked". */
  tracked: boolean
  periodCount: number
  latestPeriod: string | null
  latestActual: number | null
  /** Plan for that same period, so the variance compares like with like. */
  latestProjected: number | null
  varianceAbs: number | null
  variancePct: number | null
  fyProjected: number | null
  fyProjectedBasis: string | null
  priorYearActual: number | null
  yoyPct: number | null
}

/**
 * Builds the Revenue page rows: every company on the roster, plus any company
 * that has figures recorded but was untracked — so removing a company from the
 * roster can never make its data invisible.
 */
export function buildCompanyRevenue(
  companies: { id: string; name: string; status: string | null; track_revenue: boolean | null }[],
  rows: PortfolioRevenue[],
  fiscalYear: number,
): CompanyRevenue[] {
  const byCompany = new Map<string, PortfolioRevenue[]>()
  for (const r of rows) {
    if (!byCompany.has(r.company_id)) byCompany.set(r.company_id, [])
    byCompany.get(r.company_id)!.push(r)
  }
  return companies
    .filter((c) => c.track_revenue || byCompany.has(c.id))
    .map((c) => {
      const rs = byCompany.get(c.id) ?? []
      const last = latestActual(rs)
      const v = last ? variance(last) : null
      const fyProj = currentYearProjection(rs, fiscalYear)
      const prior = annualActual(rs, fiscalYear - 1)
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        tracked: !!c.track_revenue,
        periodCount: rs.length,
        latestPeriod: last ? periodLabel(last) : null,
        latestActual: last?.actual != null ? Number(last.actual) : null,
        latestProjected: last?.projected != null ? Number(last.projected) : null,
        varianceAbs: v?.abs ?? null,
        variancePct: v?.pct ?? null,
        fyProjected: fyProj?.value ?? null,
        fyProjectedBasis: fyProj ? `Basis: ${fyProj.basis}` : null,
        priorYearActual: prior?.value ?? null,
        yoyPct: last ? yoyGrowth(rs, last) : null,
      }
    })
    .sort(
      (a, b) =>
        (b.latestActual ?? -1) - (a.latestActual ?? -1) ||
        (b.fyProjected ?? -1) - (a.fyProjected ?? -1) ||
        a.name.localeCompare(b.name),
    )
}

/** Most recent period with a reported actual. Rows must be sorted newest-first. */
export function latestActual(rows: PortfolioRevenue[]): PortfolioRevenue | null {
  return rows.find((r) => r.actual != null) ?? null
}

/**
 * A company's ANNUAL actual for a year — the FY row if it exists, otherwise the
 * sum of sub-periods but ONLY when the year is fully reported (all four quarters,
 * or both halves). A partial year summed as if it were annual understates the
 * company and would quietly corrupt any portfolio total built on top of it, so
 * an incomplete year returns null instead.
 */
export function annualActual(
  rows: PortfolioRevenue[],
  year: number,
): { value: number; basis: string } | null {
  const fy = rows.find((r) => r.fiscal_year === year && r.period_type === "FY" && r.actual != null)
  if (fy) return { value: Number(fy.actual), basis: "FY" }
  const inYear = rows.filter((r) => r.fiscal_year === year && r.actual != null)
  const have = new Set(inYear.map((r) => r.period_type))
  const complete = ["Q1", "Q2", "Q3", "Q4"].every((q) => have.has(q))
    ? ["Q1", "Q2", "Q3", "Q4"]
    : ["H1", "H2"].every((h) => have.has(h))
      ? ["H1", "H2"]
      : null
  if (!complete) return null
  return {
    value: inYear.filter((r) => complete.includes(r.period_type)).reduce((s, r) => s + Number(r.actual), 0),
    basis: complete.join(" + "),
  }
}

/**
 * The projection to headline: the current fiscal year's FY row if there is one,
 * otherwise the sum of that year's quarters/halves so a company that only plans
 * quarterly still shows an annual number. Returns the basis so the UI can say
 * which it used rather than implying a precision it doesn't have.
 */
export function currentYearProjection(
  rows: PortfolioRevenue[],
  year: number,
): { value: number; basis: string } | null {
  const fy = rows.find((r) => r.fiscal_year === year && r.period_type === "FY" && r.projected != null)
  if (fy) return { value: Number(fy.projected), basis: `FY ${year}` }
  const parts = rows.filter((r) => r.fiscal_year === year && r.period_type !== "FY" && r.projected != null)
  if (!parts.length) return null
  return {
    value: parts.reduce((s, r) => s + Number(r.projected), 0),
    basis: `${parts.map((p) => p.period_type).sort().join(" + ")} ${year}`,
  }
}
