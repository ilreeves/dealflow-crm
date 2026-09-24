// Pure helpers for Settings → Fund / Vehicle Options → rename. The rename
// itself runs server-side in one transaction (supabase/migration_rename_fund.sql,
// `rename_fund`); this file holds the parts the dialog needs before and after
// that call, kept here so they're testable without a database.

/**
 * Every column a fund name lives in. `key` matches the count keys the
 * rename_fund() RPC returns, so the dry-run preview and the result share one
 * list. Add a column here AND in the SQL function, or the preview and the
 * rename will disagree.
 */
export const FUND_NAME_COLUMNS = [
  { key: 'list_options_fund', label: 'Fund / Vehicle list', table: 'list_options', column: 'value', listKey: 'fund' },
  { key: 'list_options_spv_fund', label: 'SPV / Sidecar list', table: 'list_options', column: 'value', listKey: 'spv_fund' },
  { key: 'portfolio_positions_fund', label: 'Positions (fund)', table: 'portfolio_positions', column: 'fund' },
  { key: 'portfolio_positions_lookthrough_of', label: 'Positions (look-through)', table: 'portfolio_positions', column: 'lookthrough_of' },
  { key: 'portfolio_companies_funds', label: 'Company fund tags', table: 'portfolio_companies', column: 'funds', isArray: true },
  { key: 'portfolio_class_holdings_entity', label: 'Cap-table holdings', table: 'portfolio_class_holdings', column: 'entity' },
  { key: 'fund_snapshots_fund', label: 'Valuation snapshots', table: 'fund_snapshots', column: 'fund' },
] as const satisfies readonly {
  key: string; label: string; table: string; column: string; listKey?: string; isArray?: boolean
}[]

export type FundColumnKey = typeof FUND_NAME_COLUMNS[number]['key']
export type RenameCounts = Record<FundColumnKey, number>

export const MAX_FUND_NAME_LENGTH = 100

/**
 * Why a rename can't go ahead, or null if it can (as far as the client can
 * tell — the SQL function re-checks against every table). `existing` is every
 * value currently in the fund and spv_fund lists. Mirrors rename_fund():
 * a case-only change of the fund's own name is allowed, any other
 * case-insensitive collision is a merge and is refused.
 */
export function renameError(oldName: string, newName: string, existing: readonly string[]): string | null {
  const next = newName.trim()
  if (!next) return 'Enter a new name.'
  if (next.length > MAX_FUND_NAME_LENGTH) return `Keep it under ${MAX_FUND_NAME_LENGTH} characters.`
  if (next === oldName) return 'That is the current name.'
  const clash = existing.find((v) => v !== oldName && v.toLowerCase() === next.toLowerCase())
  if (clash) return `“${clash}” already exists. Renaming onto it would merge two funds — that has to be done by hand.`
  return null
}

/**
 * Replace `oldName` with `newName` in a fund-tag array, in place: order is
 * preserved and the first occurrence of each tag wins, so a company already
 * tagged with both ends up with one. Same result as the SQL in rename_fund().
 */
export function replaceFundTag(tags: readonly string[], oldName: string, newName: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tags) {
    const v = t === oldName ? newName : t
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/**
 * A Postgres array literal for PostgREST's `cs` (contains) filter.
 * supabase-js joins array values with commas and no quoting, so a fund name
 * with a comma, brace, quote or backslash would break the filter — pass this
 * string instead of an array.
 */
export function pgArrayLiteral(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',')}}`
}

/** True when the rename_fund RPC hasn't been created yet (migration not run). */
export function isMissingRpc(e: { code?: string; message?: string } | null | undefined): boolean {
  if (!e) return false
  return e.code === 'PGRST202' || e.code === '42883' || /could not find the function/i.test(e.message ?? '')
}

/** Coerce the RPC's jsonb result into counts; anything missing reads as 0. */
export function parseRenameCounts(raw: unknown): RenameCounts {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = {} as RenameCounts
  for (const c of FUND_NAME_COLUMNS) {
    const n = Number(obj[c.key])
    out[c.key] = Number.isFinite(n) ? n : 0
  }
  return out
}

export function totalCount(counts: Partial<RenameCounts>): number {
  return FUND_NAME_COLUMNS.reduce((s, c) => s + (counts[c.key] ?? 0), 0)
}
