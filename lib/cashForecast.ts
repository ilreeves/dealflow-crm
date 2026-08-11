import type { PortfolioCash, PortfolioCashForecast } from "./types"
import { DAYS_PER_MONTH, isBurning, runwayMonths } from "./runway"

/**
 * Projected cash and burn — the forward half of the runway picture.
 *
 * Kept in its own module rather than folded into lib/runway.ts on purpose. Every
 * function in runway.ts answers "what is true now" from reported figures, and
 * the one rule that file enforces above all others is that a projection never
 * gets mistaken for a report. Keeping the forecast helpers behind a separate
 * import means a caller has to reach for them deliberately.
 *
 * ⚠️ ORDERING IS THE OPPOSITE OF portfolio_cash. Observations are held
 * newest-first because the question there is "what's the latest". A forecast is
 * a curve, and a curve is read left to right, so these are OLDEST-first. Do not
 * assume sortCash's ordering here.
 */

/** Oldest → newest, the order a curve is drawn in. */
export function sortForecast(rows: PortfolioCashForecast[]): PortfolioCashForecast[] {
  return [...rows].sort((a, b) => a.period_end.localeCompare(b.period_end))
}

/** Distinct vintages, newest first. Each is one deck's view of the future. */
export function forecastVintages(rows: PortfolioCashForecast[]): string[] {
  return [...new Set(rows.map((r) => r.forecast_as_of))].sort((a, b) => b.localeCompare(a))
}

/** Distinct scenarios in a vintage. NULL (the base case) sorts first. */
export function forecastScenarios(rows: PortfolioCashForecast[]): (string | null)[] {
  const seen = [...new Set(rows.map((r) => r.scenario))]
  return seen.sort((a, b) => (a === null ? -1 : b === null ? 1 : a.localeCompare(b)))
}

/**
 * One coherent curve: a single vintage, a single scenario, oldest first.
 *
 * Defaults to the newest vintage and its first scenario. Mixing vintages would
 * splice two different views of the same future into one line and read as a
 * forecast that revised itself mid-curve; mixing scenarios would splice a funded
 * path into an unfunded one, which is worse.
 */
export function forecastSeries(
  rows: PortfolioCashForecast[],
  opts: { vintage?: string; scenario?: string | null } = {},
): PortfolioCashForecast[] {
  if (rows.length === 0) return []
  const vintage = opts.vintage ?? forecastVintages(rows)[0]
  const inVintage = rows.filter((r) => r.forecast_as_of === vintage)
  const scenario = opts.scenario !== undefined ? opts.scenario : forecastScenarios(inVintage)[0]
  return sortForecast(inVintage.filter((r) => r.scenario === scenario))
}

/**
 * The deepest projected cash shortfall, and when it lands.
 *
 * ⭐ THIS IS THE MOST USEFUL NUMBER ON AN UNFUNDED CURVE and it is not otherwise
 * visible anywhere: it is the size of the raise the company's own model implies.
 * Francis's August-2026 path bottoms at -$49M in Q1-2029, which is why a $35M
 * first tranche does not settle the question and a $75M note does.
 *
 * Null when the curve never goes negative — a company that funds itself out of
 * the trough has no funding need to state.
 */
export function peakFundingNeed(
  series: PortfolioCashForecast[],
): { amount: number; period_end: string } | null {
  let worst: { amount: number; period_end: string } | null = null
  for (const r of series) {
    if (r.cash_on_hand == null) continue
    const v = Number(r.cash_on_hand)
    if (v >= 0) continue
    if (worst == null || v < worst.amount) worst = { amount: v, period_end: r.period_end }
  }
  return worst
}

/**
 * The first period the projected balance goes negative — the forecast's own
 * out-of-cash date, at period resolution.
 *
 * Deliberately NOT interpolated to a day. The series is quarterly end-points, so
 * a precise-looking date would be invented precision; when a deck states a
 * crossing date in words, that belongs in portfolio_cash.out_of_cash_date where
 * it is a company claim rather than our arithmetic.
 */
export function forecastZeroCrossing(series: PortfolioCashForecast[]): string | null {
  return series.find((r) => r.cash_on_hand != null && Number(r.cash_on_hand) < 0)?.period_end ?? null
}

/**
 * The first period the company is projected to stop burning.
 *
 * Uses isBurning's threshold (≤ 0) rather than a second one of its own, so
 * "not burning" means the same thing here as everywhere else in the app.
 *
 * Worth surfacing because it changes what the runway question even means: a
 * company projected to reach breakeven needs a BRIDGE of a known size, not
 * runway forever, and the two get financed completely differently.
 *
 * ⚠️ BURN IS NOT MONOTONIC, so this is NOT the bottom of the cash curve and the
 * two must not be used interchangeably. Francis touches zero burn in Q3-2028,
 * drifts slightly positive again for two quarters, and only turns durably
 * cash-generating in Q2-2029 — while its cash trough is Q1-2029, a full two
 * quarters AFTER breakeven was first reached. Use peakFundingNeed for the hole.
 */
export function forecastBreakeven(series: PortfolioCashForecast[]): string | null {
  return series.find((r) => r.monthly_burn != null && !isBurning({ monthly_burn: r.monthly_burn }))
    ?.period_end ?? null
}

/** One point on the merged chart — reported and projected share an axis. */
export interface BurnPoint {
  date: string
  cash: number | null
  burn: number | null
  /** Reported figures and projected ones must never render identically. */
  projected: boolean
  burnBasis: string | null
  label: string | null
  /**
   * That observation's OWN runway, so a reported series can visibly go green →
   * orange as the company burns down. NULL on projected points on purpose:
   * a runway band is a verdict about where a company stands today, and pinning
   * one to a quarter three years out would dress a projection up as a finding.
   */
  runwayMonths: number | null
}

/**
 * Start of the chart window: 1 January of the current year.
 *
 * Isaiah, 2026-08-10: "We don't need to see data from previous years here
 * (though previous months/quarters in the current year are worthwhile)." A
 * runway chart is about where the money goes next; a balance from two years ago
 * costs a column and settles nothing. Earlier observations stay in the table
 * below the chart and in the accuracy pairs — this trims the DRAWING, not the data.
 */
export function chartWindowStart(today: string): string {
  return today.slice(0, 4) + "-01-01"
}

/**
 * Reported history and the projected curve on one timeline.
 *
 * The forecast is TRUNCATED to periods after the last reported balance. A deck
 * projects from its own starting point, so its early quarters overlap history
 * that has since been reported — drawing both would show two bars for one
 * quarter and invite the reader to treat a superseded projection as current.
 * Where they overlap the report wins; the projection is still on file for the
 * accuracy comparison, which is the only thing that should look at it.
 */
export function burnTimeline(
  actuals: PortfolioCash[],
  forecast: PortfolioCashForecast[],
  /** Drop reported points before this date. Projections are never trimmed. */
  since?: string,
): BurnPoint[] {
  const withFigures = actuals.filter((r) => r.cash_on_hand != null || r.monthly_burn != null)
  // ⚠️ THE NEWEST REPORTED BALANCE ALWAYS SURVIVES THE WINDOW. Stimdia is why:
  // its only balance is 12/31/2025, so a straight "current year" cut left a
  // chart that was 100% projection with nothing solid to anchor it — and a
  // company whose last balance is stale is precisely the one where seeing how
  // old that anchor is matters most. The window trims history, never the anchor.
  const anchor = withFigures.reduce<string | null>(
    (a, r) => (r.cash_on_hand != null && (a == null || r.as_of > a) ? r.as_of : a), null)

  const reported: BurnPoint[] = withFigures
    // Only the REPORTED side is windowed. A forecast that starts before the
    // window would leave the curve beginning mid-air, and every projected point
    // is by definition about what happens next.
    .filter((r) => since == null || r.as_of >= since || r.as_of === anchor)
    .map((r) => ({
      date: r.as_of,
      cash: r.cash_on_hand == null ? null : Number(r.cash_on_hand),
      burn: r.monthly_burn == null ? null : Number(r.monthly_burn),
      projected: false,
      burnBasis: r.burn_basis,
      label: null,
      runwayMonths: runwayMonths(r)?.months ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const lastReported = reported.length ? reported[reported.length - 1].date : null
  const projected: BurnPoint[] = forecastSeries(forecast)
    .filter((r) => lastReported == null || r.period_end > lastReported)
    .map((r) => ({
      date: r.period_end,
      cash: r.cash_on_hand == null ? null : Number(r.cash_on_hand),
      burn: r.monthly_burn == null ? null : Number(r.monthly_burn),
      projected: true,
      burnBasis: r.burn_basis,
      label: r.scenario,
      runwayMonths: null,
    }))

  return [...reported, ...projected]
}

/** How close a forecast landed, once the actual for that period arrived. */
export interface ForecastHit {
  period_end: string
  vintage: string
  projected: number
  actual: number
  /** Signed: positive means the company held MORE cash than it projected. */
  errorPct: number
  /** How far ahead the projection was looking, in months. */
  horizonMonths: number
}

/** An actual within this many days counts as the same period. */
export const FORECAST_MATCH_DAYS = 20

/**
 * Pair each projection with the balance that was later reported for the same
 * period — the raw material for "how reliable are this company's projections".
 *
 * ⚠️ RETURNS PAIRS, NOT A SCORE, AND THAT IS DELIBERATE. A burn-reliability run
 * on 2026-08-08 found month-to-month cash movement far too noisy to reduce to a
 * single number — 4 of 13 windows were distorted outright by financing and
 * payment timing. Pairs let a reader see the horizon and the sample size before
 * drawing a conclusion; a mean would hide both. Any score built on top of this
 * needs to exclude financing periods and use long horizons, or it will say more
 * about when money landed than about how well anyone forecasts.
 *
 * Matching is on period end within FORECAST_MATCH_DAYS because decks project
 * quarter-ends while balances get reported at month-ends that do not always
 * coincide. The NEAREST actual wins, so a quarter with two nearby balances
 * cannot double-count.
 */
export function forecastAccuracy(
  forecast: PortfolioCashForecast[],
  actuals: PortfolioCash[],
): ForecastHit[] {
  const withCash = actuals.filter((r) => r.cash_on_hand != null)
  const hits: ForecastHit[] = []

  for (const f of forecast) {
    if (f.cash_on_hand == null) continue
    const target = Date.parse(f.period_end + "T00:00:00")
    let best: PortfolioCash | null = null
    let bestGap = Infinity
    for (const a of withCash) {
      const gap = Math.abs(Date.parse(a.as_of + "T00:00:00") - target) / 86_400_000
      if (gap <= FORECAST_MATCH_DAYS && gap < bestGap) { best = a; bestGap = gap }
    }
    if (!best) continue
    // A projection of its own vintage-period is not a forecast, it's a restatement
    // of a balance already known. Only forward-looking pairs say anything.
    if (f.period_end <= f.forecast_as_of) continue

    const projected = Number(f.cash_on_hand)
    const actual = Number(best.cash_on_hand)
    if (projected === 0) continue
    hits.push({
      period_end: f.period_end,
      vintage: f.forecast_as_of,
      projected,
      actual,
      errorPct: ((actual - projected) / Math.abs(projected)) * 100,
      horizonMonths:
        (Date.parse(f.period_end + "T00:00:00") - Date.parse(f.forecast_as_of + "T00:00:00")) /
        86_400_000 / DAYS_PER_MONTH,
    })
  }
  return hits.sort((a, b) => a.period_end.localeCompare(b.period_end))
}

/**
 * Does the forecast agree with the flat cash ÷ burn the runway page computes?
 *
 * Francis is the case that motivates this: on $75M of committed funding the
 * flat-burn pro-forma reports "dry Feb 2029", while the company's own curve with
 * that same $75M never goes negative at all — because burn collapses after PMA
 * submission and inverts in Q2-2029. A single flat rate cannot represent a curve
 * that changes sign, so where a forecast exists it is the better answer and the
 * arithmetic is the cross-check, exactly as a stated runway outranks a derived one.
 */
export function forecastContradictsFlatBurn(
  row: PortfolioCash,
  series: PortfolioCashForecast[],
): boolean {
  if (!isBurning(row) || row.cash_on_hand == null) return false
  if (series.length === 0) return false
  const crossing = forecastZeroCrossing(series)
  const flatMonths = Number(row.cash_on_hand) / Number(row.monthly_burn)
  const flatDate = new Date(Date.parse(row.as_of + "T00:00:00") + flatMonths * DAYS_PER_MONTH * 86_400_000)
  // Never running dry, against arithmetic that says it does, is the loudest
  // possible disagreement — and the direction Francis actually points.
  if (crossing == null) return true
  return Math.abs(Date.parse(crossing + "T00:00:00") - flatDate.getTime()) / 86_400_000 / DAYS_PER_MONTH > 3
}
