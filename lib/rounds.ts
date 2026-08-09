// Shared helpers for fundraising-round UI (portfolio Ownership/Fundraising tabs
// and the pipeline-deal Fundraising tab).

export function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null
  const cleaned = String(v).replace(/[$,%\s]/g, "")
  if (cleaned === "") return null
  // Accept magnitude shorthand — "25M", "4.5m", "800k", "1.2B", "25MM". Amounts
  // are *displayed* as "$4.5M", so typing that form back in is the natural thing
  // to do; without this it parsed to NaN and silently saved as null.
  const m = /^(-?(?:\d+\.?\d*|\.\d+))(mm|k|m|b)$/i.exec(cleaned)
  if (m) {
    const mult: Record<string, number> = { k: 1e3, m: 1e6, mm: 1e6, b: 1e9 }
    return Number(m[1]) * mult[m[2].toLowerCase()]
  }
  const n = Number(cleaned)
  return isNaN(n) ? null : n
}

/**
 * Returns an error message when a field has text that isn't a readable number,
 * so a typo can't silently persist as null. Empty input is fine (means "unset").
 */
export function numError(label: string, raw: string): string | null {
  if (raw.trim() === "") return null
  return parseNum(raw) === null ? `${label}: couldn't read "${raw.trim()}" as a number.` : null
}

export function numToStr(n: number | null | undefined): string {
  return n == null ? "" : String(n)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function termStr(terms: any, key: string): string {
  const v = terms?.[key]
  return v == null ? "" : String(v)
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  const x = Number(n)
  const abs = Math.abs(x)
  if (abs >= 1e9) return `$${(x / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(x / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(x / 1e3).toFixed(0)}K`
  return `$${x.toLocaleString()}`
}

export function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  return `${Number(n).toFixed(1)}%`
}

export function saveHint(msg: string): string {
  // Checked before the generic portfolio_revenue case: the table exists, it's the
  // revised-plan columns that are missing, so pointing at migration_revenue.sql
  // would send someone to re-run the wrong file.
  if (/revised_projected|revised_source|revised_as_of/i.test(msg)) {
    return "Save failed — the revised-plan columns don't exist yet. Run supabase/migration_revenue_revised.sql in Supabase, then try again. (" + msg + ")"
  }
  if (/portfolio_revenue/i.test(msg)) {
    return "Save failed — the revenue table doesn't exist yet. Run supabase/migration_revenue.sql in Supabase, then try again. (" + msg + ")"
  }
  if (/portfolio_cash/i.test(msg)) {
    return "Save failed — the cash/runway table doesn't exist yet. Run supabase/migration_runway.sql in Supabase, then try again. (" + msg + ")"
  }
  if (/portfolio_positions|deal_fundraise_rounds|option_pool|column .* does not exist|schema cache|could not find/i.test(msg)) {
    return "Save failed — a database migration hasn't been run yet. Run the fundraising migration in Supabase, then try again. (" + msg + ")"
  }
  return "Save failed: " + msg
}

export function monthYear(date: string | null): string {
  if (!date) return ""
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
}

// For valuation dates specifically. A mark is struck on a particular day and the
// books carry it at that date, so show the day rather than collapsing it to a
// month ("Jun 2026") or a half-year bucket ("H1 2026") — those hide which date a
// figure is actually as of, and our marks legitimately sit on mixed dates
// (12/31/2025 audits, 4/6/2026 cap tables, 6/30/2026 audits).
export function exactDate(date: string | null): string {
  if (!date) return ""
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export const SECURITY_COLOR: Record<string, string> = {
  "Priced equity": "#5ba200",
  "Convertible note": "#e98925",
  "SAFE": "#023a51",
}

export function valueColor(value: number | null | undefined, cost: number | null | undefined): string {
  if (value == null) return "#64748b"
  if (Number(value) === 0) return "#dc2626"
  const c = Number(cost) || 0
  if (Number(value) > c) return "#5ba200"
  if (Number(value) < c) return "#e98925"
  return "#023a51"
}

export const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
