// Shared helpers for runway tracking (portfolio Runway tab + the portfolio-wide
// Runway page).
//
// The organising idea: a cash balance is only meaningful together with the date
// it was measured. A deck from February saying "9 months of runway" describes a
// company that, unattended, is out of money in November — and by August that
// deck is not reassuring, it's a warning. So every figure here comes in two
// forms: what was REPORTED as of a date, and what that implies TODAY.
//
// The second organising idea: management's own runway claim and the arithmetic
// (cash ÷ burn) are kept separate and both retained. Companies know things the
// arithmetic doesn't — a planned hiring freeze, a milestone payment, a step-down
// after a trial completes — so the stated figure is the headline. But it is also
// the number most likely to be optimistic, so the derived figure is always
// computed alongside and a material gap is surfaced rather than resolved.

import type { PortfolioCash } from "./types"

/** Solas brand. Same set as lib/revenue's, so surfaces can't drift apart. */
export const RUNWAY_COLORS = { navy: "#023a51", green: "#5ba200", orange: "#e98925", red: "#dc2626" } as const

/**
 * Days per month, used for every month↔date conversion here.
 *
 * 365.25/12. Calendar-month arithmetic would be more precise but is not
 * obviously better: a runway of "about 9 months" carries error measured in
 * weeks, so month-length precision is false precision. One constant keeps
 * monthsBetween and addMonths exact inverses, which matters because the UI
 * shows both a month count and a date and they must agree.
 */
export const DAYS_PER_MONTH = 365.25 / 12

const MS_PER_DAY = 86_400_000

/** Parse a yyyy-mm-dd date as local midnight, not UTC. */
function parseDate(d: string): Date {
  return new Date(d + "T00:00:00")
}

/** Format a Date as yyyy-mm-dd from its LOCAL components. */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/** Months from `from` to `to`. Negative when `to` is earlier. */
export function monthsBetween(from: string, to: string): number {
  return (parseDate(to).getTime() - parseDate(from).getTime()) / MS_PER_DAY / DAYS_PER_MONTH
}

/**
 * `date` plus a fractional number of months, as yyyy-mm-dd.
 *
 * Rounded to the NEAREST day, and formatted from local components rather than
 * via toISOString — which, for a date parsed at local midnight, returns the
 * PREVIOUS day at any positive UTC offset. That would silently shift every
 * derived out-of-cash date back a day for anyone running the app outside the
 * Americas.
 */
export function addMonths(date: string, months: number): string {
  const days = Math.round(months * DAYS_PER_MONTH)
  return toISODate(new Date(parseDate(date).getTime() + days * MS_PER_DAY))
}

/** Today as yyyy-mm-dd, in local time. */
export function todayISO(): string {
  return toISODate(new Date())
}

/**
 * Is this company spending money?
 *
 * A burn of 0 or below is NOT zero runway — it's a company covering its own
 * costs, which is the best possible state and must never be painted as the
 * worst. Every runway calculation gates on this, and a non-burning company
 * simply has no runway figure rather than an infinite or zero one.
 */
export function isBurning(row: Pick<PortfolioCash, "monthly_burn">): boolean {
  return row.monthly_burn != null && Number(row.monthly_burn) > 0
}

/**
 * Runway implied by the arithmetic: cash ÷ monthly burn, in months.
 *
 * Null when either side is missing — an absent cash figure means "not
 * reported", never zero — and null when the company isn't burning.
 */
export function derivedRunwayMonths(row: Pick<PortfolioCash, "cash_on_hand" | "monthly_burn">): number | null {
  if (row.cash_on_hand == null || !isBurning(row)) return null
  return Number(row.cash_on_hand) / Number(row.monthly_burn)
}

/**
 * Runway as the COMPANY stated it, in months — either given directly, or backed
 * out of a stated out-of-cash date.
 *
 * A stated date is the stronger form of the same claim, so it's accepted here
 * as well; a deck that says "cash into Q2 2027" and one that says "11 months"
 * are the same statement and shouldn't land in different fields' worth of logic.
 */
export function statedRunwayMonths(
  row: Pick<PortfolioCash, "runway_months" | "out_of_cash_date" | "as_of">,
): number | null {
  if (row.runway_months != null) return Number(row.runway_months)
  if (row.out_of_cash_date) return monthsBetween(row.as_of, row.out_of_cash_date)
  return null
}

export type RunwayBasis = "stated" | "derived"

/**
 * THE runway figure for a row, and where it came from.
 *
 * Stated wins — see the file header. `derived` is always returned too, so every
 * surface can show the cross-check without recomputing it and possibly
 * disagreeing about the rule.
 */
export function runwayMonths(row: PortfolioCash): { months: number; basis: RunwayBasis; derived: number | null } | null {
  const stated = statedRunwayMonths(row)
  const derived = derivedRunwayMonths(row)
  if (stated != null) return { months: stated, basis: "stated", derived }
  if (derived != null) return { months: derived, basis: "derived", derived }
  return null
}

/**
 * The calendar date cash reaches zero — the ONE source of truth for both the
 * "out of cash" column and the months-remaining-today figure.
 *
 * Deriving both from a single absolute date is deliberate: computing the date
 * from the runway and the remaining months from the runway separately lets the
 * two drift apart by a rounding step, and a table showing "4.0 months left" next
 * to a date three months out destroys confidence in the whole tab.
 *
 * A stated date is used verbatim, because it's already absolute and needs no
 * aging.
 */
export function zeroCashDate(row: PortfolioCash): { date: string; basis: RunwayBasis } | null {
  if (row.out_of_cash_date) return { date: row.out_of_cash_date, basis: "stated" }
  const r = runwayMonths(row)
  if (!r) return null
  return { date: addMonths(row.as_of, r.months), basis: r.basis }
}

/**
 * Months of runway left as of `today`, from the same zero date the UI displays.
 *
 * GOES NEGATIVE, on purpose. A company whose last reported runway has already
 * lapsed is the single most important thing this tab can tell you, and clamping
 * at zero makes "ran out two months ago" look identical to "runs out today".
 * Callers should treat <= 0 as lapsed and say so in words, not print a negative
 * month count.
 */
export function monthsLeft(row: PortfolioCash, today = todayISO()): number | null {
  const z = zeroCashDate(row)
  return z ? monthsBetween(today, z.date) : null
}

/**
 * Cash implied to remain today, if burn continued at the reported rate.
 *
 * This is an EXTRAPOLATION, never a reported figure, and every surface showing
 * it must label it as such. It exists because the alternative — showing a
 * six-month-old balance as though it were current — is the specific error this
 * tab is meant to prevent.
 *
 * Can go negative for the same reason monthsLeft can.
 */
export function impliedCash(row: PortfolioCash, today = todayISO()): number | null {
  if (row.cash_on_hand == null || !isBurning(row)) return null
  return Number(row.cash_on_hand) - Number(row.monthly_burn) * monthsBetween(row.as_of, today)
}

/**
 * Runway including capital that's committed but not yet in the bank.
 *
 * Kept strictly separate from the headline: a signed tranche is not cash, and
 * folding it in would flatter every company with a paper commitment. Shown only
 * where a committed figure was actually recorded.
 */
export function proFormaRunwayMonths(row: PortfolioCash): number | null {
  if (row.committed_funding == null || row.cash_on_hand == null || !isBurning(row)) return null
  return (Number(row.cash_on_hand) + Number(row.committed_funding)) / Number(row.monthly_burn)
}

/** A cash figure older than this many months no longer describes the present. */
export const STALE_MONTHS = 4

/**
 * How old the observation is, and whether that's old enough to distrust.
 *
 * Four months is one board cycle plus slack: a company reporting quarterly
 * should always have something newer, so crossing this line means a deck was
 * missed rather than that the company is simply between meetings.
 */
export function staleness(row: PortfolioCash, today = todayISO()): { months: number; stale: boolean } {
  const months = monthsBetween(row.as_of, today)
  return { months, stale: months > STALE_MONTHS }
}

/** Stated and derived runway disagree by more than this fraction of the stated figure. */
export const RUNWAY_RECONCILE_TOLERANCE = 0.2

/** …but never flag a gap smaller than this, in months. */
export const RUNWAY_RECONCILE_FLOOR_MONTHS = 1.5

/**
 * Flags a stated runway that its own cash and burn don't support.
 *
 * Never rewrites anything — the stated figure still wins, exactly as with the
 * FY-vs-quarters reconciler on revenue. It exists because the gap is otherwise
 * invisible: a deck can say "12 months" over a slide showing $3M and $400K/mo,
 * and nobody divides.
 *
 * Both a percentage and an absolute floor, because either alone misfires. A
 * pure percentage nags about a 2.0-vs-2.4-month gap on a company about to run
 * out, where the difference is noise against the news; a pure month floor
 * ignores a 30-month claim against 20 months of arithmetic. The gap must clear
 * both.
 *
 * A legitimate gap is common and expected — burn is forecast to fall after a
 * trial completes, or to rise on a planned build-out — so this is a prompt to
 * read the note, not an error.
 */
export function runwayMismatch(row: PortfolioCash): { stated: number; derived: number; diff: number; pct: number } | null {
  const stated = statedRunwayMonths(row)
  const derived = derivedRunwayMonths(row)
  if (stated == null || derived == null || stated === 0) return null
  const diff = derived - stated
  if (Math.abs(diff) < RUNWAY_RECONCILE_FLOOR_MONTHS) return null
  if (Math.abs(diff) / Math.abs(stated) <= RUNWAY_RECONCILE_TOLERANCE) return null
  return { stated, derived, diff, pct: (diff / Math.abs(stated)) * 100 }
}

/**
 * Urgency bands, in months of runway remaining. Thresholds chosen around how
 * long a raise actually takes: under 6 months there is no time to run a
 * process, 6–12 means the raise should already be live, past 12 is comfortable.
 */
export const RUNWAY_BANDS = { critical: 6, caution: 12 } as const

/**
 * THE runway colour rule — one definition, so the page and the tab can never
 * disagree about whether a company is in trouble.
 *
 * ⚠️ Green and orange are indistinguishable under protanopia, and red/orange
 * are close, so colour must never be the only thing carrying the verdict. Every
 * surface using this also prints the month count or the date.
 */
export function runwayBandColor(months: number | null | undefined): string {
  if (months == null || isNaN(Number(months))) return RUNWAY_COLORS.navy
  const n = Number(months)
  if (n <= 0) return RUNWAY_COLORS.red
  if (n < RUNWAY_BANDS.critical) return RUNWAY_COLORS.orange
  if (n < RUNWAY_BANDS.caution) return RUNWAY_COLORS.navy
  return RUNWAY_COLORS.green
}

/**
 * Compact dollars for basis captions only ("$12.9M"). Deliberately local rather
 * than reusing lib/rounds' fmtMoney: this file is pure logic with no UI
 * dependency, and these strings are explanatory text, not displayed figures.
 */
function fmtCompact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (a >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

/** "9.4 months", "out" — how a runway length reads in a cell. */
export function fmtMonths(months: number | null | undefined): string {
  if (months == null || isNaN(Number(months))) return "—"
  const n = Number(months)
  if (n <= 0) return "out"
  return `${n.toFixed(1)} mo`
}

/** Newest-first, the order every consumer here relies on. */
export function sortCash(rows: PortfolioCash[]): PortfolioCash[] {
  return [...rows].sort((a, b) => b.as_of.localeCompare(a.as_of))
}

/**
 * Change in monthly burn between the two most recent observations that both
 * report one, as a percentage.
 *
 * Compares the two most recent REPORTING rows rather than the two most recent
 * rows, so a snapshot that recorded only a cash balance doesn't break the
 * series. Null unless two comparable figures exist — and null when the bases
 * differ, since net burn against gross opex burn is not a trend, it's two
 * different measurements.
 */
export function burnTrendPct(rows: PortfolioCash[]): { pct: number; from: PortfolioCash; to: PortfolioCash } | null {
  const withBurn = sortCash(rows).filter((r) => r.monthly_burn != null)
  if (withBurn.length < 2) return null
  const [to, from] = withBurn
  const a = Number(from.monthly_burn)
  if (a === 0) return null
  if ((from.burn_basis ?? "") !== (to.burn_basis ?? "")) return null
  return { pct: ((Number(to.monthly_burn) - a) / Math.abs(a)) * 100, from, to }
}

/** Most recent observation carrying a cash balance. */
export function latestCash(rows: PortfolioCash[]): PortfolioCash | null {
  return sortCash(rows).find((r) => r.cash_on_hand != null) ?? null
}

/** Two cash balances closer together than this can't support a monthly rate. */
export const MIN_MOVEMENT_MONTHS = 0.5

/**
 * Burn implied by the ACTUAL movement in the cash balance between the two most
 * recent observations that report one.
 *
 * This is the only burn figure that is comparable across the whole portfolio.
 * Decks define "burn" incompatibly — iO Urology's includes CapEx, Vesalio's
 * stated none at all so ours is an operating loss that excludes CapEx and
 * accrued note interest — so summing `monthly_burn` across companies adds up
 * different measurements. The change in the bank balance over elapsed time is
 * the same quantity for everyone, and needs no judgement about what to include.
 *
 * Reported alongside the deck's own figure, never instead of it: management's
 * number is what they steer by, and it's forward-looking where this is
 * backward-looking.
 *
 * ⚠️ `cashRose` IS THE WHOLE POINT OF THE RETURN SHAPE. A company that closed a
 * financing between two observations shows cash going UP, and a naive
 * (older − newer) reads that as negative burn — which `isBurning` would then
 * treat as "covering its own costs". That would paint the most cash-hungry
 * companies as the healthiest. Callers MUST check this flag and refuse to use
 * `perMonth` as a burn rate when it is set.
 */
export function cashMovementBurn(rows: PortfolioCash[]): {
  perMonth: number
  months: number
  from: PortfolioCash
  to: PortfolioCash
  /** Cash INCREASED — a raise landed, so this is not a burn rate. */
  cashRose: boolean
} | null {
  const withCash = sortCash(rows).filter((r) => r.cash_on_hand != null)
  if (withCash.length < 2) return null
  const [to, from] = withCash
  const months = monthsBetween(from.as_of, to.as_of)
  if (months < MIN_MOVEMENT_MONTHS) return null
  const spent = Number(from.cash_on_hand) - Number(to.cash_on_hand)
  return { perMonth: spent / months, months, from, to, cashRose: spent < 0 }
}

/**
 * One company's runway picture for the Runway page. Computed on the server so
 * the rules can't drift between surfaces.
 */
export type CompanyRunway = {
  id: string
  name: string
  status: string | null
  /** Number of cash observations recorded. */
  snapshotCount: number
  asOf: string | null
  cashOnHand: number | null
  monthlyBurn: number | null
  burnBasis: string | null
  /** Runway as of `asOf` — stated where given, else cash ÷ burn. */
  runwayMonths: number | null
  runwayBasis: RunwayBasis | null
  /** cash ÷ burn, always, so the cross-check is available in a tooltip. */
  derivedMonths: number | null
  outOfCash: string | null
  /** Months left counted from today, not from asOf. Negative means lapsed. */
  monthsLeft: number | null
  /** Extrapolated, never reported. Negative means the runway has lapsed. */
  impliedCashToday: number | null
  staleMonths: number | null
  stale: boolean
  /** Set when the stated runway and the arithmetic materially disagree. */
  mismatchPct: number | null
  proFormaMonths: number | null
  committedFunding: number | null
  burnTrendPct: number | null
  /** True when the company reported a burn of zero or below — not a shortfall. */
  notBurning: boolean
  /**
   * Burn from the actual movement in the cash balance — the one figure that IS
   * comparable across companies. Null when fewer than two balances exist, or
   * when cash rose (a raise landed, so it isn't a burn rate).
   */
  movementBurn: number | null
  /** e.g. "$13.4M → $12.9M over 1.0 mo" — the basis for movementBurn. */
  movementBasis: string | null
}

/**
 * Builds the Runway page rows.
 *
 * Covers every ACTIVE company whether or not it has data — a company with no
 * cash figures is a gap in our own coverage, and the page is the only place
 * that gap is visible, so it must not be silently omitted. Legacy and Exited
 * companies are excluded unless they carry recorded figures, in which case they
 * come through flagged rather than being dropped: nothing already entered
 * should ever become invisible.
 */
export function buildCompanyRunway(
  companies: { id: string; name: string; status: string | null }[],
  rows: PortfolioCash[],
  today = todayISO(),
): CompanyRunway[] {
  const byCompany = new Map<string, PortfolioCash[]>()
  for (const r of rows) {
    if (!byCompany.has(r.company_id)) byCompany.set(r.company_id, [])
    byCompany.get(r.company_id)!.push(r)
  }
  return companies
    .filter((c) => isActive(c.status) || byCompany.has(c.id))
    .map((c) => {
      const rs = sortCash(byCompany.get(c.id) ?? [])
      // Headline figures come from the most recent row WITH a cash balance. A
      // newer row that recorded only a burn figure updates the trend but must
      // not blank out the balance we do have.
      const last = latestCash(rs) ?? rs[0] ?? null
      const r = last ? runwayMonths(last) : null
      const z = last ? zeroCashDate(last) : null
      const stale = last ? staleness(last, today) : null
      const mm = last ? runwayMismatch(last) : null
      const trend = burnTrendPct(rs)
      // Only usable as a burn rate when cash actually fell — see cashMovementBurn.
      const mv = cashMovementBurn(rs)
      const usableMv = mv && !mv.cashRose ? mv : null
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        snapshotCount: rs.length,
        asOf: last?.as_of ?? null,
        cashOnHand: last?.cash_on_hand != null ? Number(last.cash_on_hand) : null,
        monthlyBurn: last?.monthly_burn != null ? Number(last.monthly_burn) : null,
        burnBasis: last?.burn_basis ?? null,
        runwayMonths: r?.months ?? null,
        runwayBasis: r?.basis ?? null,
        derivedMonths: r?.derived ?? null,
        outOfCash: z?.date ?? null,
        monthsLeft: last ? monthsLeft(last, today) : null,
        impliedCashToday: last ? impliedCash(last, today) : null,
        staleMonths: stale?.months ?? null,
        stale: !!stale?.stale,
        mismatchPct: mm?.pct ?? null,
        proFormaMonths: last ? proFormaRunwayMonths(last) : null,
        committedFunding: last?.committed_funding != null ? Number(last.committed_funding) : null,
        burnTrendPct: trend?.pct ?? null,
        notBurning: !!last && last.monthly_burn != null && Number(last.monthly_burn) <= 0,
        movementBurn: usableMv?.perMonth ?? null,
        movementBasis: usableMv
          ? `${fmtCompact(Number(usableMv.from.cash_on_hand))} → ${fmtCompact(Number(usableMv.to.cash_on_hand))} over ${usableMv.months.toFixed(1)} mo`
          : null,
      }
    })
    .sort(byUrgency)
}

/** Active companies are the ones a runway question applies to at all. */
export function isActive(status: string | null): boolean {
  return status !== "Legacy" && status !== "Exited"
}

/**
 * Soonest out of cash first — the opposite of the alphabetical order used on the
 * Revenue page, and deliberately so. Revenue is a table you read across;
 * runway is a queue of who needs attention, and the company closest to zero
 * belongs at the top whatever its name.
 *
 * Rows with no runway figure sort last (they're handled as a separate group in
 * the UI), ties broken alphabetically so the order is stable between loads.
 */
export function byUrgency(a: CompanyRunway, b: CompanyRunway): number {
  const av = a.monthsLeft, bv = b.monthsLeft
  if (av == null && bv == null) return a.name.localeCompare(b.name)
  if (av == null) return 1
  if (bv == null) return -1
  return av - bv || a.name.localeCompare(b.name)
}
