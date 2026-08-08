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
 * Breadth of a period, used only to break ties on period_end. FY and Q4 both end
 * 12-31, and H1/Q2 both end 06-30, so period_end alone leaves the "latest period"
 * ambiguous and the headline figure could flip between a quarter and a full year
 * depending on row order. Wider periods win: an annual figure is the more
 * meaningful headline, and it's the one a plan is usually attached to.
 */
function periodRank(periodType: string): number {
  if (periodType === "FY") return 3
  if (periodType === "H1" || periodType === "H2") return 2
  return 1
}

/**
 * Canonical newest-first order. Every consumer must sort with this rather than
 * relying on the DB's `period_end desc` alone — see periodRank for why.
 */
export function sortRows(rows: PortfolioRevenue[]): PortfolioRevenue[] {
  return [...rows].sort(
    (a, b) =>
      (b.period_end ?? "").localeCompare(a.period_end ?? "") ||
      periodRank(b.period_type) - periodRank(a.period_type) ||
      a.period_type.localeCompare(b.period_type),
  )
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

/** Solas brand. One definition so every revenue surface draws from the same set. */
export const REVENUE_COLORS = { navy: "#023a51", green: "#5ba200", orange: "#e98925", red: "#dc2626" } as const

/** Variance beyond this many percent counts as a material beat or miss. */
export const VARIANCE_BAND_PCT = 10

/** A miss beyond this many percent is severe enough to read as red, not amber. */
export const SEVERE_MISS_PCT = 50

/**
 * THE variance colour rule — every surface uses this one, so the chart and the
 * tables can never disagree about whether a quarter was a beat.
 *
 * Green a material beat, orange a material miss, red a severe miss, navy
 * anything inside the band.
 * Threshold-based rather than sign-based: an earlier sign-based helper painted
 * a +0.3% beat green, which reads as a result when it is noise. Removed in
 * favour of this — do not reintroduce a second convention.
 *
 * Null means no comparison is possible (no plan recorded, or nothing reported
 * yet) and returns navy — the neutral, never orange. A missing plan is not a
 * miss, and the chart draws no plan tick in that case so the absence is visible.
 *
 * ⚠️ Green and orange are indistinguishable under protanopia (OKLab ΔE ~0.6),
 * and red compounds that — it is the same hue family as orange to a protanope,
 * so this colour must never be the ONLY thing carrying the verdict. Every
 * surface using it also shows the signed variance, and in the chart the bar's
 * distance from the plan tick encodes the same fact positionally.
 */
export function varianceBandColor(pct: number | null | undefined): string {
  if (pct == null || isNaN(Number(pct))) return REVENUE_COLORS.navy
  const n = Number(pct)
  if (n > VARIANCE_BAND_PCT) return REVENUE_COLORS.green
  // Severe first — a -60% quarter would otherwise be painted the same amber as
  // a -11% one, which flattens the difference between a wobble and a failure.
  if (n < -SEVERE_MISS_PCT) return REVENUE_COLORS.red
  if (n < -VARIANCE_BAND_PCT) return REVENUE_COLORS.orange
  return REVENUE_COLORS.navy
}

/** Quarterly period types, the only cadence the chart draws. */
export const QUARTER_TYPES = new Set(["Q1", "Q2", "Q3", "Q4"])

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
 * Actuals reported so far in a year, and which periods they cover. Picks ONE
 * cadence so a company holding both an H1 row and Q1/Q2 rows isn't counted
 * twice: an FY actual wins, else quarters, else halves. Unlike annualActual this
 * does NOT require the year to be complete — it's a year-to-date figure.
 */
export function ytdActual(
  rows: PortfolioRevenue[],
  year: number,
): { value: number; coverage: string } | null {
  const inYear = rows.filter((r) => r.fiscal_year === year && r.actual != null)
  if (!inYear.length) return null
  const fy = inYear.find((r) => r.period_type === "FY")
  if (fy) return { value: Number(fy.actual), coverage: "FY" }
  for (const set of [["Q1", "Q2", "Q3", "Q4"], ["H1", "H2"]]) {
    const hits = set.filter((p) => inYear.some((r) => r.period_type === p))
    if (hits.length) {
      return {
        value: inYear.filter((r) => hits.includes(r.period_type)).reduce((s, r) => s + Number(r.actual), 0),
        coverage: hits.length > 1 ? `${hits[0]}–${hits[hits.length - 1]}` : hits[0],
      }
    }
  }
  return null
}

/**
 * The year the "progress vs plan" column should report on: the most recent year
 * that has BOTH an annual projection and at least one actual. So it stays on
 * 2026 while 2026 actuals accumulate, and moves to 2027 only once a 2027 annual
 * plan exists AND a 2027 period has been reported — not merely because a
 * forward-year plan was entered early.
 */
export function planYearFor(rows: PortfolioRevenue[], fallback: number): number {
  const years = Array.from(new Set(rows.map((r) => r.fiscal_year))).sort((a, b) => b - a)
  for (const y of years) {
    const hasPlan = rows.some((r) => r.fiscal_year === y && r.period_type === "FY" && r.projected != null)
    if (hasPlan && ytdActual(rows, y)) return y
  }
  // No year qualifies yet — fall back to the most recent year with an annual
  // plan, so a company that has a plan but no reported periods still shows it.
  for (const y of years) {
    if (rows.some((r) => r.fiscal_year === y && r.period_type === "FY" && r.projected != null)) return y
  }
  return fallback
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
  /** Growth vs the immediately preceding period of the same cadence. */
  seqPct: number | null
  /** Tooltip detail for the sequential column, e.g. "Q2 2026 vs Q1 2026". */
  seqBasis: string | null
  /** Year the annual plan and progress figures report on — follows the data. */
  planYear: number
  /** YTD actual as a % of that year's annual plan. Null if either side is absent. */
  pctOfPlan: number | null
  /** Tooltip detail for the progress column, e.g. "Q1–Q2 2026: $2.2M of $5.5M". */
  pctOfPlanBasis: string | null
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
      // Sorted here rather than trusting the query order — period_end ties.
      const rs = sortRows(byCompany.get(c.id) ?? [])
      const last = latestActual(rs)
      const v = last ? variance(last) : null
      // The annual plan and the progress column both follow the company's own
      // plan year, so the two can never disagree about which year they describe.
      const planYear = planYearFor(rs, fiscalYear)
      const fyProj = annualProjection(rs, planYear)
      const ytd = ytdActual(rs, planYear)
      const pctOfPlan = fyProj && fyProj.value !== 0 && ytd ? (ytd.value / fyProj.value) * 100 : null
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
        fyProjectedBasis: fyProj ? `Basis: ${fyProj.basis} ${planYear}` : null,
        priorYearActual: prior?.value ?? null,
        yoyPct: last ? yoyGrowth(rs, last) : null,
        seqPct: last ? sequentialGrowth(rs, last) : null,
        seqBasis: (() => {
          if (!last) return null
          const prev = PRIOR_PERIOD[last.period_type]
          if (!prev || sequentialGrowth(rs, last) == null) return null
          return `${periodLabel(last)} vs ${prev.type} ${last.fiscal_year + prev.yearOffset}`
        })(),
        planYear,
        pctOfPlan,
        pctOfPlanBasis:
          pctOfPlan != null && ytd && fyProj
            ? `${ytd.coverage} ${planYear} actual of the FY ${planYear} plan (basis: ${fyProj.basis})`
            : null,
      }
    })
    // Alphabetical. A revenue-size ordering re-ranks the table every time a
    // figure is entered, so a company you were looking at moves; alphabetical
    // keeps each row where you last saw it.
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** The period immediately before this one, at the same cadence. */
const PRIOR_PERIOD: Record<string, { type: string; yearOffset: number }> = {
  Q1: { type: "Q4", yearOffset: -1 },
  Q2: { type: "Q1", yearOffset: 0 },
  Q3: { type: "Q2", yearOffset: 0 },
  Q4: { type: "Q3", yearOffset: 0 },
  H1: { type: "H2", yearOffset: -1 },
  H2: { type: "H1", yearOffset: 0 },
}

/**
 * Growth against the immediately preceding period of the SAME cadence — Q2 vs
 * Q1, Q1 vs the prior Q4, H2 vs H1. Complements yoyGrowth rather than replacing
 * it: sequential growth shows momentum but carries seasonality, YoY strips
 * seasonality but needs a full year of history. Early-commercial companies
 * usually have only the former.
 *
 * FY rows return null — year-on-year for an annual period IS yoyGrowth, so
 * reporting it here too would just duplicate that column.
 */
export function sequentialGrowth(rows: PortfolioRevenue[], row: PortfolioRevenue): number | null {
  if (row.actual == null) return null
  const prev = PRIOR_PERIOD[row.period_type]
  if (!prev) return null
  const prior = rows.find(
    (r) => r.period_type === prev.type && r.fiscal_year === row.fiscal_year + prev.yearOffset && r.actual != null,
  )
  if (!prior || Number(prior.actual) === 0) return null
  return ((Number(row.actual) - Number(prior.actual)) / Math.abs(Number(prior.actual))) * 100
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
 * A year's ANNUAL projection — the mirror of annualActual, and the plan side of
 * the annual chart. The FY row if one exists, otherwise the sum of the quarters
 * but ONLY when all four are planned.
 *
 * Deliberately stricter than currentYearProjection below, which sums whatever
 * parts it finds so the stat card can still headline a number. Summing two
 * planned quarters and drawing it as the annual plan would understate the year
 * and make the bar read as a miss the company never had — so an incomplete
 * plan returns null here and the bar simply carries no tick.
 */
export function annualProjection(
  rows: PortfolioRevenue[],
  year: number,
): { value: number; basis: string } | null {
  const fy = rows.find((r) => r.fiscal_year === year && r.period_type === "FY" && r.projected != null)
  if (fy) return { value: Number(fy.projected), basis: "FY" }
  const quarters = rows.filter(
    (r) => r.fiscal_year === year && QUARTER_TYPES.has(r.period_type) && r.projected != null,
  )
  if (quarters.length !== 4) return null
  return {
    value: quarters.reduce((s, r) => s + Number(r.projected), 0),
    basis: "Q1 + Q2 + Q3 + Q4",
  }
}

/**
 * Which sub-periods of a year carry a plan. Lets the UI say "Q1 + Q2 planned
 * only" instead of silently showing nothing where an annual figure would go.
 */
export function plannedPeriods(rows: PortfolioRevenue[], year: number): string[] {
  return rows
    .filter((r) => r.fiscal_year === year && r.period_type !== "FY" && r.projected != null)
    .map((r) => r.period_type)
    .sort()
}

/** A year's FY figure and its quarters disagree by more than this fraction. */
export const ANNUAL_RECONCILE_TOLERANCE = 0.005

/**
 * Flags an FY row that contradicts its own four quarters on `field`.
 *
 * Both are legitimate rows and the FY one wins by convention, so this never
 * blocks or rewrites anything — it exists because a contradiction is otherwise
 * invisible until someone sums by hand. Vesalio's FY2026 plan reads $12,660,000
 * while its quarters sum to $11,861,468; that sat unnoticed until it was checked
 * manually.
 *
 * Null unless an FY row AND all four quarters carry the field, so a partly
 * planned year never trips it. The tolerance absorbs the basis differences that
 * are expected and documented — Vesalio's 2025 quarters sum $11,932 under the FY
 * actual (0.15%) because the quarters are product sales and the FY row is net
 * sales. That is not an error and must not nag.
 *
 * Also silent when any quarter's plan is a REFORECAST. Vektor's 2025 is the
 * case: the FY row is January's original $2.6M goal while Q3 and Q4 are
 * mid-year reforecasts entered because no original quarterly budget was ever
 * located. Those quarters are a different basis by design, so their sum is not
 * meant to reconcile to the original annual plan and flagging it would be noise.
 */
export function annualMismatch(
  rows: PortfolioRevenue[],
  year: number,
  field: "projected" | "actual",
): { fy: number; quarters: number; diff: number; pct: number } | null {
  const fyRow = rows.find((r) => r.fiscal_year === year && r.period_type === "FY" && r[field] != null)
  if (!fyRow) return null
  const qs = rows.filter(
    (r) => r.fiscal_year === year && QUARTER_TYPES.has(r.period_type) && r[field] != null,
  )
  if (qs.length !== 4) return null
  if (field === "projected" && qs.some((r) => r.projected_source === "Reforecast")) return null
  const fy = Number(fyRow[field])
  const quarters = qs.reduce((s, r) => s + Number(r[field]), 0)
  const diff = quarters - fy
  if (fy === 0 || Math.abs(diff) / Math.abs(fy) <= ANNUAL_RECONCILE_TOLERANCE) return null
  return { fy, quarters, diff, pct: (diff / Math.abs(fy)) * 100 }
}
