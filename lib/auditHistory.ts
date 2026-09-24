// Pure helpers for the change-history UI (components/shared/ChangeHistory).
// The database records one audit_log row per INSERT / UPDATE / DELETE on the
// money tables (supabase/migration_audit_log.sql); this turns those rows into
// "edits" a person recognises, one-line summaries, and per-field diffs.
//
// No "@/" imports — vitest has no alias config.

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE'
type Row = Record<string, unknown>

export interface AuditEntry {
  id: number
  table_name: string
  row_id: string
  company_id: string | null
  action: AuditAction
  old_data: Row | null
  new_data: Row | null
  changed_by: string | null
  changed_at: string
  tx_id: number
}

export interface AuditGroup {
  /** Stable React key — the first entry's id. */
  key: string
  /** Every entry id in the edit, ascending — what undo_audit_entries takes. */
  ids: number[]
  who: string | null
  company_id: string | null
  started: string
  ended: string
  /** Ascending by id. */
  entries: AuditEntry[]
}

/** One UI "edit" spans the separate requests a single save fires. */
export const GROUP_WINDOW_MS = 20_000

// ─── Grouping ────────────────────────────────────────────────────────────────

// Fields the server stamps. Compared out of the undo signature below and never
// shown as a diff.
const STAMP_FIELDS = new Set(['id', 'created_at', 'updated_at', 'created_by', 'updated_by'])

function sameData(a: Row | null, b: Row | null): boolean {
  if (a == null || b == null) return a == null && b == null
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    if (k === 'updated_at' || k === 'updated_by') continue
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) return false
  }
  return true
}

// Consecutive entries from one transaction by one person for one company.
// A transaction's entries share changed_at (now() is the tx start), so this
// is the unit the time window is measured between.
function chunk(sorted: AuditEntry[]): AuditEntry[][] {
  const out: AuditEntry[][] = []
  for (const e of sorted) {
    const cur = out[out.length - 1]
    const head = cur?.[0]
    if (head && head.tx_id === e.tx_id && head.changed_by === e.changed_by && head.company_id === e.company_id) cur.push(e)
    else out.push([e])
  }
  return out
}

// True when `tx` puts every row it touches back exactly as it was before
// `group` first touched it — the shape of an undo. Without this, clicking
// Undo within 20 s of an edit would fold the undo into the edit it reversed.
function reverses(group: AuditEntry[], tx: AuditEntry[]): boolean {
  const before = new Map<string, Row | null>()
  for (const e of group) {
    const k = `${e.table_name}:${e.row_id}`
    if (!before.has(k)) before.set(k, e.old_data)
  }
  const after = new Map<string, Row | null>()
  for (const e of tx) after.set(`${e.table_name}:${e.row_id}`, e.new_data)
  for (const [k, data] of after) {
    if (!before.has(k) || !sameData(before.get(k) ?? null, data)) return false
  }
  return true
}

/**
 * Group raw entries into edits: consecutive (by id) entries with the same
 * changed_by and company_id, each within 20 s of the previous. The round
 * editor's round UPDATE → positions DELETE → positions INSERT land as one
 * edit; a company delete's cascade is one transaction and so one edit. A
 * transaction that exactly reverses the edit before it (an undo) starts its
 * own. Newest edit first.
 */
export function groupEntries(entries: AuditEntry[]): AuditGroup[] {
  const sorted = [...entries].sort((a, b) => a.id - b.id)
  const groups: AuditEntry[][] = []
  for (const tx of chunk(sorted)) {
    const cur = groups[groups.length - 1]
    const last = cur?.[cur.length - 1]
    const first = tx[0]
    const joins = !!last
      && last.changed_by === first.changed_by
      && last.company_id === first.company_id
      && Date.parse(first.changed_at) - Date.parse(last.changed_at) <= GROUP_WINDOW_MS
      && Date.parse(first.changed_at) >= Date.parse(last.changed_at) - GROUP_WINDOW_MS
      && !reverses(cur, tx)
    if (joins) cur.push(...tx)
    else groups.push([...tx])
  }
  return groups.reverse().map((es) => ({
    key: String(es[0].id),
    ids: es.map((e) => e.id),
    who: es[0].changed_by,
    company_id: es[0].company_id,
    started: es[0].changed_at,
    ended: es[es.length - 1].changed_at,
    entries: es,
  }))
}

/**
 * History is loaded newest-first with a limit, so the oldest edit on the
 * page may continue past it — and undoing half an edit is worse than not
 * undoing it. Given the page and the next-older page, returns the rows to
 * keep (everything from the start of the edit that straddled the boundary)
 * and whether that edit still reaches the new boundary and so may continue.
 */
export function extendOldest(rows: AuditEntry[], older: AuditEntry[], olderWasFull: boolean): { rows: AuditEntry[]; open: boolean } {
  if (rows.length === 0 || older.length === 0) return { rows, open: false }
  const pageMin = Math.min(...rows.map((r) => r.id))
  const combined = [...rows, ...older]
  const g = groupEntries(combined).find((x) => x.ids.includes(pageMin))!
  const start = g.ids[0]
  const combinedMin = Math.min(...older.map((r) => r.id))
  return {
    rows: combined.filter((r) => r.id >= start),
    open: olderWasFull && start === combinedMin,
  }
}

// ─── Labels ──────────────────────────────────────────────────────────────────

interface TableMeta {
  one: string
  many: string
  /** Noun phrase for a single row, e.g. "Series Seed round". */
  title: (r: Row) => string
  /** Parenthetical detail for a single row, e.g. "EHF, $1.75M". */
  detail?: (r: Row) => string | null
  /** Verb for an UPDATE. */
  changed: string
  /** Shown for INSERT / DELETE in the details view. */
  keys: string[]
}

const str = (v: unknown): string => (v == null ? '' : String(v))

export function fmtDate(v: unknown): string {
  const s = str(v)
  if (!s) return ''
  // Bare dates parse as UTC midnight — pin to local so Jun 30 stays Jun 30.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00` : s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function joinDetail(...parts: (string | null | undefined)[]): string | null {
  const p = parts.filter((x): x is string => !!x)
  return p.length ? p.join(', ') : null
}

/**
 * lib/rounds' fmtMoney, one decimal finer — a history view exists to show the
 * difference between $1.75M and $1.8M. Same sign and unit-promotion rules.
 */
export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  const trim = (x: number, dp: number) => x.toFixed(dp).replace(/\.?0+$/, '')
  if (abs >= 999.995e6) return `${sign}$${trim(abs / 1e9, 2)}B`
  if (abs >= 999.95e3) return `${sign}$${trim(abs / 1e6, 2)}M`
  if (abs >= 1e3) return `${sign}$${trim(abs / 1e3, 1)}K`
  return `${sign}$${abs.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
}

const exactMoney = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

const money = (v: unknown) => (v == null || v === '' ? null : fmtMoney(Number(v)))

export const TABLES: Record<string, TableMeta> = {
  portfolio_companies: {
    one: 'company', many: 'companies', changed: 'edited',
    title: (r) => str(r.name) || 'Company',
    keys: ['name', 'status', 'funds', 'series', 'sector', 'clinical_stage', 'track_revenue'],
  },
  portfolio_fundraise_rounds: {
    one: 'round', many: 'rounds', changed: 'edited',
    title: (r) => (r.round_name ? `${str(r.round_name)} round` : 'Round'),
    keys: ['round_name', 'security_type', 'status', 'date', 'round_size', 'pre_money', 'post_money', 'price_per_share', 'option_pool', 'lead_investor', 'terms', 'notes'],
  },
  portfolio_positions: {
    one: 'position', many: 'positions', changed: 'edited',
    title: () => 'Position',
    detail: (r) => joinDetail(str(r.fund) + (r.lookthrough_of ? ` via ${str(r.lookthrough_of)}` : ''), money(r.invested_amount)),
    keys: ['fund', 'lookthrough_of', 'invested_amount', 'shares', 'ownership_pct', 'accrued_interest', 'fair_value', 'fair_value_date', 'fair_value_source', 'notes'],
  },
  portfolio_valuation_marks: {
    one: 'valuation mark', many: 'valuation marks', changed: 'changed',
    title: (r) => `Valuation mark ${fmtDate(r.as_of_date)}`.trim(),
    detail: (r) => money(r.valuation),
    keys: ['as_of_date', 'valuation', 'basis', 'notes'],
  },
  portfolio_share_classes: {
    one: 'share class', many: 'share classes', changed: 'edited',
    title: (r) => `Share class ${str(r.name)}`.trim(),
    keys: ['name', 'class_type', 'shares_outstanding', 'price_per_share', 'liq_pref_multiple', 'seniority', 'participating', 'convertible_balance', 'conversion_price', 'notes'],
  },
  portfolio_class_holdings: {
    one: 'holding', many: 'holdings', changed: 'edited',
    title: () => 'Holding',
    detail: (r) => joinDetail(str(r.entity), r.shares != null ? `${fmtNumber(r.shares)} shares` : null),
    keys: ['entity', 'shares'],
  },
  portfolio_cash: {
    one: 'cash balance', many: 'cash balances', changed: 'changed',
    title: (r) => `Cash balance ${fmtDate(r.as_of)}`.trim(),
    keys: ['as_of', 'cash_on_hand', 'monthly_burn', 'burn_basis', 'runway_months', 'out_of_cash_date', 'committed_funding', 'source', 'source_detail', 'notes'],
  },
  portfolio_cash_forecast: {
    one: 'cash forecast row', many: 'cash forecast rows', changed: 'changed',
    title: (r) => `Cash forecast ${fmtDate(r.period_end)}`.trim(),
    detail: (r) => joinDetail(r.scenario ? str(r.scenario) : null, r.forecast_as_of ? `as of ${fmtDate(r.forecast_as_of)}` : null),
    keys: ['forecast_as_of', 'period_end', 'scenario', 'cash_on_hand', 'monthly_burn', 'burn_basis', 'source', 'notes'],
  },
  portfolio_revenue: {
    one: 'revenue row', many: 'revenue rows', changed: 'changed',
    title: (r) => `Revenue ${str(r.period_type)} ${str(r.fiscal_year)}`.trim(),
    keys: ['period_type', 'fiscal_year', 'projected', 'revised_projected', 'actual', 'projected_source', 'revised_source', 'actual_source', 'notes'],
  },
  fund_snapshots: {
    one: 'fund snapshot row', many: 'fund snapshot rows', changed: 'changed',
    title: (r) => `Fund snapshot ${fmtDate(r.as_of_date)}`.trim(),
    detail: (r) => joinDetail(str(r.fund), str(r.company_name)),
    keys: ['as_of_date', 'fund', 'company_name', 'invested', 'value', 'source'],
  },
}

// Parent → child, matching the undo function's order.
const TABLE_ORDER = Object.keys(TABLES)

function meta(table: string): TableMeta {
  return TABLES[table] ?? {
    one: `${table} row`, many: `${table} rows`, changed: 'changed', title: () => `${table} row`, keys: [],
  }
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Name', status: 'Status', funds: 'Funds', series: 'Series', sector: 'Sector', category: 'Category',
  clinical_stage: 'Clinical stage', track_revenue: 'Track revenue', cap_table_as_of: 'Cap table as of',
  round_name: 'Round', security_type: 'Security', date: 'Date', amount: 'Amount', lead_investor: 'Lead investor',
  round_size: 'Round size', pre_money: 'Pre-money', post_money: 'Post-money', price_per_share: 'Price / share',
  option_pool: 'Option pool %', terms: 'Terms', round_id: 'Round', company_id: 'Company', class_id: 'Share class',
  fund: 'Fund', lookthrough_of: 'Look-through of', invested_amount: 'Invested', shares: 'Shares',
  ownership_pct: 'Ownership %', accrued_interest: 'Accrued interest', fair_value: 'Fair value',
  fair_value_date: 'Fair value date', fair_value_source: 'Fair value source',
  as_of_date: 'As of', valuation: 'Valuation', basis: 'Basis',
  class_type: 'Class type', shares_outstanding: 'Shares outstanding', liq_pref_multiple: 'Liq. pref ×',
  seniority: 'Seniority', participating: 'Participating', convertible_balance: 'Convertible balance',
  conversion_price: 'Conversion price', entity: 'Entity',
  as_of: 'As of', cash_on_hand: 'Cash', monthly_burn: 'Monthly burn', burn_basis: 'Burn basis',
  runway_months: 'Runway (months)', out_of_cash_date: 'Out-of-cash date', committed_funding: 'Committed funding',
  source: 'Source', source_detail: 'Source detail', notes: 'Notes',
  mismatch_ack_pct: 'Mismatch acknowledged %', mismatch_ack_note: 'Mismatch note', mismatch_acked_at: 'Mismatch acknowledged',
  mismatch_acked_by: 'Mismatch acknowledged by',
  forecast_as_of: 'Forecast as of', period_end: 'Period end', scenario: 'Scenario',
  period_type: 'Period', fiscal_year: 'Fiscal year', projected: 'Projected', revised_projected: 'Revised projection',
  actual: 'Actual', projected_source: 'Projection source', projected_as_of: 'Projected as of',
  revised_source: 'Revision source', revised_as_of: 'Revised as of', actual_source: 'Actual source',
  company_name: 'Company', invested: 'Invested', value: 'Value',
  // terms.* keys
  valuation_cap: 'Valuation cap', cap_type: 'Cap type', discount: 'Discount %', interest_rate: 'Interest rate %',
  interest_type: 'Interest type', maturity_date: 'Maturity date', warrant_coverage: 'Warrant coverage %',
}

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key]
  const s = key.replace(/_/g, ' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ─── Value formatting ────────────────────────────────────────────────────────

const MONEY_FIELDS = new Set([
  'invested_amount', 'fair_value', 'accrued_interest', 'round_size', 'pre_money', 'post_money', 'valuation',
  'cash_on_hand', 'monthly_burn', 'committed_funding', 'projected', 'revised_projected', 'actual', 'invested',
  'value', 'convertible_balance', 'valuation_cap',
])
// Per-share prices run to five decimals ($0.88002); fmtMoney would round them.
const PRICE_FIELDS = new Set(['price_per_share', 'conversion_price'])
const PCT_FIELDS = new Set(['ownership_pct', 'option_pool', 'discount', 'interest_rate', 'warrant_coverage', 'mismatch_ack_pct'])
const DATE_FIELDS = /(^date$|_date$|^as_of$|_as_of$|^period_end$|_at$)/

function fmtNumber(v: unknown): string {
  const n = Number(v)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 6 }) : str(v)
}

export const TRUNCATE_AT = 80

/** Display string for one field value. Empty string for null/blank. */
export function fmtValue(key: string, v: unknown): string {
  if (v == null || v === '') return ''
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (Array.isArray(v)) return v.map(str).join(', ')
  if (typeof v === 'object') return JSON.stringify(v)
  const isNum = typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)))
  if (isNum && MONEY_FIELDS.has(key)) return fmtMoney(Number(v))
  if (isNum && PRICE_FIELDS.has(key)) {
    const n = Number(v)
    return `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 6 })}`
  }
  if (isNum && PCT_FIELDS.has(key)) return `${fmtNumber(v)}%`
  // Years and ranks read wrong with a thousands separator ("2,026").
  if (key === 'fiscal_year' || key === 'seniority') return str(v)
  if (isNum && typeof v === 'number') return fmtNumber(v)
  if (typeof v === 'string' && DATE_FIELDS.test(key)) return fmtDate(v)
  // A uuid on its own tells nobody anything — keep enough to tell two apart.
  if (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return `${v.slice(0, 8)}…`
  return str(v)
}

// ─── Diffs ───────────────────────────────────────────────────────────────────

export interface FieldDiff {
  key: string
  label: string
  /** Display strings, truncated for long text. null = the side doesn't exist (INSERT/DELETE). */
  before: string | null
  after: string | null
  /** Untruncated text, present only when a side was truncated. */
  beforeFull?: string
  afterFull?: string
}

function side(key: string, v: unknown): { text: string; full?: string } {
  const text = fmtValue(key, v)
  return text.length > TRUNCATE_AT ? { text: `${text.slice(0, TRUNCATE_AT - 1).trimEnd()}…`, full: text } : { text }
}

function diff(key: string, label: string, a: unknown, b: unknown, hasBefore: boolean, hasAfter: boolean): FieldDiff {
  const x = side(key, a)
  const y = side(key, b)
  return {
    key, label,
    before: hasBefore ? x.text : null,
    after: hasAfter ? y.text : null,
    ...(x.full && hasBefore ? { beforeFull: x.full } : {}),
    ...(y.full && hasAfter ? { afterFull: y.full } : {}),
  }
}

const isObj = (v: unknown): v is Row => v != null && typeof v === 'object' && !Array.isArray(v)

/**
 * UPDATE: every field that changed, old → new (jsonb objects such as `terms`
 * per key). INSERT / DELETE: the table's key fields that have a value.
 */
export function fieldDiffs(entry: AuditEntry): FieldDiff[] {
  const o = entry.old_data ?? {}
  const n = entry.new_data ?? {}
  const m = meta(entry.table_name)

  if (entry.action !== 'UPDATE') {
    const row = entry.action === 'INSERT' ? n : o
    const keys = m.keys.length ? m.keys : Object.keys(row).filter((k) => !STAMP_FIELDS.has(k))
    const out: FieldDiff[] = []
    for (const k of keys) {
      const v = row[k]
      if (isObj(v)) {
        for (const tk of Object.keys(v)) {
          if (v[tk] == null || v[tk] === '') continue
          out.push(diff(tk, `${fieldLabel(k)} · ${fieldLabel(tk)}`, v[tk], v[tk], entry.action === 'DELETE', entry.action === 'INSERT'))
        }
        continue
      }
      if (fmtValue(k, v) === '') continue
      out.push(diff(k, fieldLabel(k), v, v, entry.action === 'DELETE', entry.action === 'INSERT'))
    }
    return out
  }

  const out: FieldDiff[] = []
  const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])].filter((k) => !STAMP_FIELDS.has(k))
  // Table's key fields first, in their order; anything else after.
  const rank = (k: string) => { const i = m.keys.indexOf(k); return i < 0 ? 999 : i }
  keys.sort((a, b) => rank(a) - rank(b))
  for (const k of keys) {
    const a = o[k] ?? null
    const b = n[k] ?? null
    if (JSON.stringify(a) === JSON.stringify(b)) continue
    if (isObj(a) || isObj(b)) {
      const ao = isObj(a) ? a : {}
      const bo = isObj(b) ? b : {}
      for (const tk of [...new Set([...Object.keys(ao), ...Object.keys(bo)])]) {
        const x = ao[tk] ?? null
        const y = bo[tk] ?? null
        if (JSON.stringify(x) === JSON.stringify(y)) continue
        // "" and null both mean unset in the terms editor.
        if (fmtValue(tk, x) === fmtValue(tk, y)) continue
        out.push(diff(tk, `${fieldLabel(k)} · ${fieldLabel(tk)}`, x, y, true, true))
      }
      continue
    }
    const d = diff(k, fieldLabel(k), a, b, true, true)
    // Two amounts that round to the same "$1.75M" show in full instead.
    if (d.before === d.after && MONEY_FIELDS.has(k) && a != null && b != null) {
      d.before = exactMoney(Number(a))
      d.after = exactMoney(Number(b))
    }
    out.push(d)
  }
  return out
}

// ─── Summaries ───────────────────────────────────────────────────────────────

const rowOf = (e: AuditEntry): Row => e.new_data ?? e.old_data ?? {}

// A row re-inserted with a created_at well before the change is a restore
// (an undo putting it back), not something new.
function isRestore(e: AuditEntry): boolean {
  const c = e.new_data?.created_at
  if (typeof c !== 'string') return false
  return Date.parse(e.changed_at) - Date.parse(c) > 60_000
}

interface RowNet { first: AuditEntry; last: AuditEntry }

function netByRow(entries: AuditEntry[]): Map<string, RowNet> {
  const out = new Map<string, RowNet>()
  for (const e of entries) {
    const k = `${e.table_name}:${e.row_id}`
    const cur = out.get(k)
    if (cur) cur.last = e
    else out.set(k, { first: e, last: e })
  }
  return out
}

function phrase(m: TableMeta, n: number, verb: string, sample: Row): string {
  if (n === 1) {
    const d = m.detail?.(sample)
    return `${m.title(sample)} ${verb}${d ? ` (${d})` : ''}`
  }
  return `${n} ${m.many} ${verb}`
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** One human line for an edit, e.g. "Series Seed round edited · 2 positions replaced". */
export function summarise(group: AuditGroup): string {
  const rows = [...netByRow(group.entries).values()]

  // A company created or deleted dominates: everything else is its cascade.
  const company = rows.find((r) => r.first.table_name === 'portfolio_companies' && (r.first.action !== 'UPDATE' || r.last.action !== 'UPDATE'))
  if (company) {
    const created = company.first.action === 'INSERT'
    const deleted = company.last.action === 'DELETE'
    if (created !== deleted) {
      const name = str(rowOf(created ? company.last : company.first).name) || 'unnamed'
      const verb = deleted ? 'deleted' : isRestore(company.first) ? 'restored' : 'added'
      const related = rows.length - 1
      return `Company ${verb}: ${name}${related ? ` (and ${related} related row${related === 1 ? '' : 's'})` : ''}`
    }
  }

  const parts: string[] = []
  const tables = [...new Set(rows.map((r) => r.first.table_name))]
    .sort((a, b) => (TABLE_ORDER.indexOf(a) + 1 || 99) - (TABLE_ORDER.indexOf(b) + 1 || 99))
  for (const t of tables) {
    const m = meta(t)
    const mine = rows.filter((r) => r.first.table_name === t)
    const added = mine.filter((r) => r.first.action === 'INSERT' && r.last.action !== 'DELETE')
    const removed = mine.filter((r) => r.first.action !== 'INSERT' && r.last.action === 'DELETE')
    const edited = mine.filter((r) => r.first.action !== 'INSERT' && r.last.action !== 'DELETE')

    if (t === 'portfolio_companies' && edited.length === 1) {
      const fields = [...new Set(group.entries.filter((x) => x.table_name === t).flatMap((x) => fieldDiffs(x).map((d) => d.label.split(' · ')[0])))]
      const shown = fields.slice(0, 3).join(', ') + (fields.length > 3 ? '…' : '')
      parts.push(`Company details edited${shown ? ` (${shown})` : ''}`)
      continue
    }

    const replaced = Math.min(added.length, removed.length)
    if (replaced) parts.push(phrase(m, replaced, 'replaced', rowOf(added[0].last)))
    const restoring = added.length > 0 && added.every((r) => isRestore(r.first))
    if (added.length > replaced) parts.push(phrase(m, added.length - replaced, restoring ? 'restored' : 'added', rowOf(added[replaced].last)))
    if (removed.length > replaced) parts.push(phrase(m, removed.length - replaced, 'deleted', rowOf(removed[replaced].first)))
    if (edited.length) parts.push(phrase(m, edited.length, m.changed, rowOf(edited[0].last)))
  }
  if (!parts.length) return 'No net change'
  return parts.map((p, i) => (i === 0 ? cap(p) : p)).join(' · ')
}

/** Short heading for one entry in the details view, e.g. "Position deleted (EHF, $1.75M)". */
export function describeEntry(e: AuditEntry): string {
  const m = meta(e.table_name)
  const verb = e.action === 'INSERT' ? (isRestore(e) ? 'restored' : 'added') : e.action === 'DELETE' ? 'deleted' : m.changed
  if (e.table_name === 'portfolio_companies') return `Company ${verb}: ${str(rowOf(e).name) || 'unnamed'}`
  return phrase(m, 1, verb, rowOf(e))
}

/** Whether the edit created or deleted a company row (the Portfolio list needs a refresh). */
export function touchesCompanyExistence(group: AuditGroup): boolean {
  return group.entries.some((e) => e.table_name === 'portfolio_companies' && e.action !== 'UPDATE')
}

/** Company name from the entries themselves — the only record once a company is deleted. */
export function companyNameFromEntries(entries: AuditEntry[], companyId: string): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.table_name !== 'portfolio_companies' || e.row_id !== companyId) continue
    const n = str(e.old_data?.name) || str(e.new_data?.name)
    if (n) return n
  }
  return null
}

// ─── Undo result + errors ────────────────────────────────────────────────────

export interface UndoResult { removed?: number; restored?: number; reverted?: number }

/** "Undone: 2 rows restored, 2 removed, 1 reverted". */
export function fmtUndoResult(r: UndoResult | null | undefined): string {
  const restored = Number(r?.restored ?? 0)
  const removed = Number(r?.removed ?? 0)
  const reverted = Number(r?.reverted ?? 0)
  const total = restored + removed + reverted
  if (!total) return 'Undone — nothing needed changing.'
  const noun = total === 1 ? 'row' : 'rows'
  const parts: string[] = []
  if (restored) parts.push(`${restored} restored`)
  if (removed) parts.push(`${removed} removed`)
  if (reverted) parts.push(`${reverted} reverted`)
  // The noun rides on the first figure: "2 rows restored, 2 removed".
  parts[0] = parts[0].replace(/^(\d+) /, `$1 ${noun} `)
  return `Undone: ${parts.join(', ')}`
}

export const MIGRATION_HINT = 'Run supabase/migration_audit_log.sql in the Supabase SQL editor to start recording history.'

interface PgError { code?: string; message?: string }

/** audit_log table or undo function not there yet — the migration hasn't run. */
export function isMissingAudit(e: PgError | null | undefined): boolean {
  if (!e) return false
  return ['PGRST205', '42P01', 'PGRST202', '42883'].includes(e.code ?? '')
    || /could not find the (table|function)/i.test(e.message ?? '')
}

// ─── Time ────────────────────────────────────────────────────────────────────

export function relativeTime(iso: string, now: number): string {
  const s = Math.round((now - Date.parse(iso)) / 1000)
  if (s < 45) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  if (d < 7) return `${d} d ago`
  return fmtDate(iso)
}

export function exactTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
}
