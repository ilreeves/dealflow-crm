// Shared helpers for fundraising-round UI (portfolio Ownership/Fundraising tabs
// and the pipeline-deal Fundraising tab).

export function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null
  const cleaned = String(v).replace(/[$,%\s]/g, "")
  if (cleaned === "") return null
  const n = Number(cleaned)
  return isNaN(n) ? null : n
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
  if (/portfolio_positions|deal_fundraise_rounds|option_pool|column .* does not exist|schema cache|could not find/i.test(msg)) {
    return "Save failed — a database migration hasn't been run yet. Run the fundraising migration in Supabase, then try again. (" + msg + ")"
  }
  return "Save failed: " + msg
}

export function monthYear(date: string | null): string {
  if (!date) return ""
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
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
