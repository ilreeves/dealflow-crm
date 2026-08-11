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
 * Which plan a figure is measured against.
 *
 * "original" is strictly the start-of-year budget; a restatement never counts.
 * That is what makes projection reliability meaningful — scoring a company
 * against a target rewritten once the year was half known flatters it.
 *
 * "revised" is the current expectation: the restatement where one exists, and
 * the original everywhere else. The fallback is the whole point — only a handful
 * of periods are ever restated, so without it the revised basis would blank out
 * most of the book rather than reading as "unchanged".
 */
export type PlanBasis = "original" | "revised"

/** The two plan slots. Loosened from PortfolioRevenue so chart points can pass literals. */
type PlanFields = { projected?: number | null; revised_projected?: number | null }

/** The plan figure for a period on a given basis. Null when that basis has none. */
export function planValue(r: PlanFields, basis: PlanBasis): number | null {
  if (basis === "revised" && r.revised_projected != null) return Number(r.revised_projected)
  return r.projected == null ? null : Number(r.projected)
}

/** True when the period's plan was restated, so the two bases actually differ. */
export function isRevised(r: PlanFields): boolean {
  return r.revised_projected != null
}

/**
 * Variance of actual against plan. Returns null unless BOTH sides exist —
 * a missing actual is "not reported yet", not a shortfall, and showing it as
 * -100% would read as a business collapse.
 *
 * Defaults to the ORIGINAL plan so a caller that hasn't thought about basis gets
 * the conservative answer rather than silently being scored against a softened
 * target; the revenue surfaces opt into "revised" explicitly.
 */
export function variance(
  r: PlanFields & Pick<PortfolioRevenue, "actual">,
  basis: PlanBasis = "original",
): { abs: number; pct: number | null } | null {
  const plan = planValue(r, basis)
  if (plan == null || r.actual == null) return null
  const a = Number(r.actual)
  return { abs: a - plan, pct: plan !== 0 ? ((a - plan) / Math.abs(plan)) * 100 : null }
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

/**
 * Y-axis ticks for the revenue chart: zero plus rounded steps up the scale.
 *
 * Steps snap to 1 / 2 / 2.5 / 5 × a power of ten so the labels read as round
 * money — $25K, $2.0M — rather than as arbitrary fractions of whatever the
 * tallest bar happens to be. Without an axis the chart only shows which bar is
 * biggest; a portfolio where one year is 200× another (iO Urology: $20K actuals
 * beside a $4.3M plan) renders the small periods as invisible slivers, and
 * there is no way to tell an invisible bar from an absent one.
 *
 * Never emits a tick above `max`, which already carries the chart's headroom —
 * a label pinned to the ceiling would sit outside the plotted area.
 */
export function axisTicks(max: number, target = 4): number[] {
  if (!isFinite(max) || max <= 0) return [0]
  const raw = max / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  // toFixed guards the float drift that repeated += would otherwise accumulate
  // into labels like $2,000,000.0000001.
  for (let v = 0; v <= max; v += step) out.push(Number(v.toFixed(6)))
  return out
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
      // "Q1–Q3" promises all three periods are in the sum. When one is missing
      // in the middle (Q1 and Q3 reported, Q2 not yet), spell the sum out
      // instead — the range label would silently overstate the coverage.
      const idx = hits.map((p) => set.indexOf(p))
      const contiguous = idx[idx.length - 1] - idx[0] === idx.length - 1
      return {
        value: inYear.filter((r) => hits.includes(r.period_type)).reduce((s, r) => s + Number(r.actual), 0),
        coverage: hits.length === 1 ? hits[0] : contiguous ? `${hits[0]}–${hits[hits.length - 1]}` : hits.join(" + "),
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
export function planYearFor(rows: PortfolioRevenue[], fallback: number, basis: PlanBasis = "original"): number {
  const years = Array.from(new Set(rows.map((r) => r.fiscal_year))).sort((a, b) => b - a)
  // Same definition of "has an annual plan" as the chart: an FY row OR all
  // four quarters planned. Requiring an FY row here made a quarterly-only
  // planner never qualify, so its plan year fell back to the calendar year
  // and the progress column went blank despite a complete plan on file.
  const hasAnnualPlan = (y: number) => annualProjection(rows, y, basis) != null
  for (const y of years) {
    if (hasAnnualPlan(y) && ytdActual(rows, y)) return y
  }
  // No year qualifies yet — fall back to the most recent year with an annual
  // plan, so a company that has a plan but no reported periods still shows it.
  for (const y of years) {
    if (hasAnnualPlan(y)) return y
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
  /**
   * The plan the variance is measured against, on this page's basis, for the
   * same period as latestActual — so the comparison is like with like.
   */
  latestProjected: number | null
  /** The ORIGINAL plan for that period. Equals latestProjected when nothing was restated. */
  latestOriginal: number | null
  /** True when latestProjected came from a restatement rather than the original budget. */
  latestRevised: boolean
  /**
   * Variance against the ORIGINAL plan — carried only when a restatement exists,
   * so the table can show what the period looked like before the target moved.
   * Null when there is nothing to contrast.
   */
  originalVariancePct: number | null
  varianceAbs: number | null
  variancePct: number | null
  fyProjected: number | null
  fyProjectedBasis: string | null
  /** Annual plan on the ORIGINAL basis. Null when the year has no complete original plan. */
  fyOriginal: number | null
  /** True when the annual figure includes at least one restated period. */
  fyRevised: boolean
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
  // The Revenue page reports the current expectation, so a restated period is
  // measured against the target that now stands. /analytics deliberately does
  // NOT use this builder — reliability there stays on the original budget.
  basis: PlanBasis = "revised",
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
      const v = last ? variance(last, basis) : null
      // Only meaningful as a contrast — when nothing was restated the two bases
      // are the same number and showing it twice would just read as noise.
      const vOriginal = last && isRevised(last) ? variance(last, "original") : null
      // The annual plan and the progress column both follow the company's own
      // plan year, so the two can never disagree about which year they describe.
      const planYear = planYearFor(rs, fiscalYear, basis)
      const fyProj = annualProjection(rs, planYear, basis)
      const fyOrig = annualProjection(rs, planYear, "original")
      const ytd = ytdActual(rs, planYear)
      const pctOfPlan = fyProj && fyProj.value !== 0 && ytd ? (ytd.value / fyProj.value) * 100 : null
      const prior = annualActual(rs, fiscalYear - 1)
      const seqPct = last ? sequentialGrowth(rs, last) : null
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        tracked: !!c.track_revenue,
        periodCount: rs.length,
        latestPeriod: last ? periodLabel(last) : null,
        latestActual: last?.actual != null ? Number(last.actual) : null,
        latestProjected: last ? planValue(last, basis) : null,
        latestOriginal: last ? planValue(last, "original") : null,
        latestRevised: !!last && basis === "revised" && isRevised(last),
        originalVariancePct: vOriginal?.pct ?? null,
        varianceAbs: v?.abs ?? null,
        variancePct: v?.pct ?? null,
        fyProjected: fyProj?.value ?? null,
        fyProjectedBasis: fyProj
          ? `Basis: ${fyProj.basis} ${planYear}${fyProj.revised ? " · includes a revised period" : ""}`
          : null,
        fyOriginal: fyOrig?.value ?? null,
        fyRevised: !!fyProj?.revised,
        priorYearActual: prior?.value ?? null,
        yoyPct: last ? yoyGrowth(rs, last) : null,
        seqPct,
        seqBasis: (() => {
          if (!last || seqPct == null) return null
          const prev = PRIOR_PERIOD[last.period_type]
          if (!prev) return null
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
 * Summing an INCOMPLETE set of planned quarters and drawing it as the annual
 * plan would understate the year and make the bar read as a miss the company
 * never had — so a partial plan returns null here and the bar simply carries
 * no tick.
 */
export function annualProjection(
  rows: PortfolioRevenue[],
  year: number,
  basis: PlanBasis = "original",
): { value: number; basis: string; revised: boolean } | null {
  const fy = rows.find((r) => r.fiscal_year === year && r.period_type === "FY" && planValue(r, basis) != null)
  if (fy) return { value: planValue(fy, basis)!, basis: "FY", revised: basis === "revised" && isRevised(fy) }
  const quarters = rows.filter(
    (r) => r.fiscal_year === year && QUARTER_TYPES.has(r.period_type) && planValue(r, basis) != null,
  )
  if (quarters.length !== 4) return null
  return {
    value: quarters.reduce((s, r) => s + planValue(r, basis)!, 0),
    basis: "Q1 + Q2 + Q3 + Q4",
    // A year is "revised" as soon as ANY of its quarters was restated — the
    // annual figure is then a mix, which is exactly what the reader needs to know.
    revised: basis === "revised" && quarters.some(isRevised),
  }
}

/**
 * Which sub-periods of a year carry a plan. Lets the UI say "Q1 + Q2 planned
 * only" instead of silently showing nothing where an annual figure would go.
 */
export function plannedPeriods(rows: PortfolioRevenue[], year: number, basis: PlanBasis = "original"): string[] {
  return rows
    .filter((r) => r.fiscal_year === year && r.period_type !== "FY" && planValue(r, basis) != null)
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
 * Each field reconciles only against itself. Mixing bases is what used to make
 * this noisy: Vektor's 2025 FY row is January's original $2.6M goal while its Q3
 * and Q4 were mid-year reforecasts stored in the same column, so the sum was
 * never meant to tie and the check needed a `projected_source === 'Reforecast'`
 * escape hatch. Restatements now live in `revised_projected`, so an original is
 * only ever compared with originals and that special case is gone.
 */
export function annualMismatch(
  rows: PortfolioRevenue[],
  year: number,
  field: "projected" | "revised_projected" | "actual",
): { fy: number; quarters: number; diff: number; pct: number } | null {
  const fyRow = rows.find((r) => r.fiscal_year === year && r.period_type === "FY" && r[field] != null)
  if (!fyRow) return null
  const qs = rows.filter(
    (r) => r.fiscal_year === year && QUARTER_TYPES.has(r.period_type) && r[field] != null,
  )
  if (qs.length !== 4) return null
  const fy = Number(fyRow[field])
  const quarters = qs.reduce((s, r) => s + Number(r[field]), 0)
  const diff = quarters - fy
  if (fy === 0 || Math.abs(diff) / Math.abs(fy) <= ANNUAL_RECONCILE_TOLERANCE) return null
  return { fy, quarters, diff, pct: (diff / Math.abs(fy)) * 100 }
}
