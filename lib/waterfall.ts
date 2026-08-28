// Quick-waterfall math — pure functions, extracted from CapTableTab so the
// regimes (convert-or-take, participating, seniority pay-down, note floors)
// are unit-testable. DIRECTIONAL by design; every assumption is tagged on the
// row it applies to. See the component for the UI and the caveat copy.
import { PortfolioShareClass, PortfolioClassHolding } from "./types"

export type ShareClassWithHoldings = PortfolioShareClass & { portfolio_class_holdings: PortfolioClassHolding[] }

// Per-share prices carry real sub-cent precision (e.g. Francis's ladder), so
// unlike fmtMoney this keeps up to 4 decimals and never abbreviates to K/M.
export function fmtPrice(n: number | null | undefined): string {
  return n == null || isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 })}`
}

/** "Last round" = the most senior priced preferred, highest price breaking a tie. */
export function lastRoundPrice(classes: ShareClassWithHoldings[]): number | null {
  const priced = classes.filter((c) => c.class_type === "Preferred" && c.price_per_share != null && c.shares_outstanding != null)
  if (!priced.length) return null
  const top = priced.slice().sort((a, b) => (a.seniority ?? 99) - (b.seniority ?? 99) || Number(b.price_per_share) - Number(a.price_per_share))[0]
  return Number(top.price_per_share)
}

export type WaterfallRow = {
  id: string
  name: string
  shares: number
  /** Denominator for holdings fractions: shares, except note rows where holdings are entered as DOLLARS of balance. */
  unitTotal: number
  solas: number
  prefBasis: number | null
  participating: boolean
  seniority: number | null
  payout: number
  mode: "preference" | "partial preference" | "participating" | "converted" | "as-converted" | "wiped"
  assumed: string | null
}

export function computeWaterfall(exitValue: number, classes: ShareClassWithHoldings[], noteDiscount: number): WaterfallRow[] {
  const rows: WaterfallRow[] = classes
    .filter((c) => c.shares_outstanding != null && Number(c.shares_outstanding) > 0)
    .map((c) => {
      const shares = Number(c.shares_outstanding)
      const hasPref = c.class_type === "Preferred" && c.price_per_share != null
      const mult = c.liq_pref_multiple != null ? Number(c.liq_pref_multiple) : 1
      return {
        id: c.id,
        name: c.name,
        shares,
        unitTotal: shares,
        solas: c.portfolio_class_holdings.reduce((t, h) => t + (Number(h.shares) || 0), 0),
        prefBasis: hasPref ? shares * Number(c.price_per_share) * mult : null,
        participating: hasPref && c.participating === true,
        seniority: c.seniority,
        payout: 0,
        mode: (hasPref ? "preference" : "as-converted") as WaterfallRow["mode"],
        assumed:
          c.class_type === "Preferred" && c.price_per_share == null
            ? "no price on file — treated as-converted, no preference"
            : hasPref && c.liq_pref_multiple == null
              ? "1× multiple assumed"
              : c.class_type === "Option pool" || c.class_type === "Warrants"
                ? "strike ignored"
                : null,
      }
    })

  // ── Unconverted notes/SAFEs (share-less rows with a balance) ──
  // Modeled as a most-senior preferred whose basis is its balance × multiple:
  // convert-or-take then gives the note its debt-like floor at low exits and
  // conversion upside at high ones. Conversion price = documented terms when
  // stated, else the given discount to the LAST ROUND price (the most senior
  // priced preferred). Holdings on note rows are entered as DOLLARS of balance,
  // so unitTotal is the balance rather than the share count.
  const refPrice = lastRoundPrice(classes)
  for (const c of classes) {
    if (c.shares_outstanding != null) continue
    const balance = Number(c.convertible_balance)
    if (!(balance > 0)) continue
    const documented = c.conversion_price != null ? Number(c.conversion_price) : null
    const convPrice = documented ?? (refPrice != null ? refPrice * (1 - noteDiscount) : null)
    if (convPrice == null || convPrice <= 0) continue
    const mult = c.liq_pref_multiple != null ? Number(c.liq_pref_multiple) : 1
    rows.push({
      id: c.id,
      name: c.name,
      shares: balance / convPrice,
      unitTotal: balance,
      solas: c.portfolio_class_holdings.reduce((t, h) => t + (Number(h.shares) || 0), 0),
      prefBasis: balance * mult,
      participating: c.participating === true,
      seniority: c.seniority ?? 0, // debt-like: ahead of the preferred stack unless told otherwise
      payout: 0,
      mode: "preference",
      assumed: documented != null
        ? `converts at ${fmtPrice(documented)} per note terms`
        : `assumed conversion at ${fmtPrice(convPrice)} — ${Math.round(noteDiscount * 100)}% discount to ${fmtPrice(refPrice)}`,
    })
  }
  if (exitValue <= 0 || rows.length === 0) return rows.map((r) => ({ ...r, mode: "wiped" }))

  const prefs = rows.filter((r) => r.prefBasis != null && !r.participating)
  // Participating preferred takes its preference AND shares pro-rata, so its
  // shares always sit in the pro-rata pool and its basis always comes off the top.
  const parts = rows.filter((r) => r.participating)
  const partBasis = parts.reduce((t, r) => t + r.prefBasis!, 0)
  const commonShares =
    rows.filter((r) => r.prefBasis == null).reduce((t, r) => t + r.shares, 0) +
    parts.reduce((t, r) => t + r.shares, 0)

  // Non-participating equilibrium: a preferred converts when its as-converted
  // share of the residual beats taking its preference. Converting one class
  // changes everyone's per-share, so iterate to a fixed point (≤ one pass per
  // class, and class counts are single digits).
  const converted = new Set<string>()
  for (let guard = 0; guard <= prefs.length; guard++) {
    const residual = exitValue - partBasis - prefs.filter((r) => !converted.has(r.id)).reduce((t, r) => t + r.prefBasis!, 0)
    const convShares = commonShares + prefs.filter((r) => converted.has(r.id)).reduce((t, r) => t + r.shares, 0)
    let changed = false
    for (const r of prefs) {
      if (converted.has(r.id)) continue
      // per-share if THIS class also converts (its basis returns to the pool)
      const perShareIf = convShares + r.shares > 0 ? Math.max(0, residual + r.prefBasis!) / (convShares + r.shares) : 0
      if (perShareIf * r.shares > r.prefBasis!) {
        converted.add(r.id)
        changed = true
        break // recompute pools before judging the next class
      }
    }
    if (!changed) break
  }

  const staying = prefs.filter((r) => !converted.has(r.id))
  const prefTotal = staying.reduce((t, r) => t + r.prefBasis!, 0) + partBasis

  if (exitValue < prefTotal) {
    // Not enough for the stack: pay preferences in seniority order (nulls
    // last), pro-rata by basis within a rank. Everyone else is wiped.
    let remaining = exitValue
    const inStack = [...staying, ...parts]
    const ranks = Array.from(new Set(inStack.map((r) => r.seniority ?? Infinity))).sort((a, b) => a - b)
    for (const rank of ranks) {
      const tier = inStack.filter((r) => (r.seniority ?? Infinity) === rank)
      const tierBasis = tier.reduce((t, r) => t + r.prefBasis!, 0)
      const pay = Math.min(remaining, tierBasis)
      for (const r of tier) {
        r.payout = tierBasis > 0 ? (pay * r.prefBasis!) / tierBasis : 0
        r.mode = r.payout + 0.01 < r.prefBasis! ? "partial preference" : "preference"
      }
      remaining -= pay
      if (remaining <= 0) break
    }
    for (const r of rows) if ((r.prefBasis == null || converted.has(r.id)) && !r.participating) { r.payout = 0; r.mode = "wiped" }
    return rows
  }

  const residual = exitValue - prefTotal
  const convShares = commonShares + prefs.filter((r) => converted.has(r.id)).reduce((t, r) => t + r.shares, 0)
  const perShare = convShares > 0 ? residual / convShares : 0
  for (const r of rows) {
    if (r.participating) { r.payout = r.prefBasis! + r.shares * perShare; r.mode = "participating" }
    else if (r.prefBasis != null && !converted.has(r.id)) { r.payout = r.prefBasis; r.mode = "preference" }
    else { r.payout = r.shares * perShare; r.mode = r.prefBasis != null ? "converted" : "as-converted" }
  }
  return rows
}
