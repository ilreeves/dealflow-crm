'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, Undo2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import InfoTip from '@/components/shared/InfoTip'
import {
  AuditEntry, AuditGroup, FieldDiff, UndoResult, groupEntries, extendOldest, summarise, describeEntry,
  fieldDiffs, fmtUndoResult, isMissingAudit, MIGRATION_HINT, relativeTime, exactTime,
  touchesCompanyExistence, companyNameFromEntries,
} from '@/lib/auditHistory'

// Every change to the money tables, grouped into edits, each undoable.
// The database does the recording (supabase/migration_audit_log.sql) and the
// undo (undo_audit_entries); this only reads the log and asks.
//
// Used in two places: a company's History tab (companyId set), and Settings
// for every company — the only way back to a DELETED company, whose modal no
// longer exists.

// Older entries pulled per round trip while completing the oldest edit on the
// page, and how many round trips before giving up (a cascade of a few
// thousand rows).
const EXTEND_PAGE = 500
const EXTEND_ROUNDS = 8
// A company delete can carry hundreds of rows; the details view shows this many
// until asked for the rest.
const DETAIL_ROWS = 30

interface Loaded {
  key: string
  scope: string
  groups: AuditGroup[]
  names: Record<string, string>
  companies: Record<string, string>
  /** The oldest group may continue past what was loaded — not safely undoable. */
  openKey: string | null
  missing: boolean
  error: string
  /** When the rows were fetched — the reference for "5 min ago". */
  at: number
}

interface Props {
  /** Limit to one company; omitted = every company (Settings). */
  companyId?: string
  /** Called after a successful undo, so the caller can refetch what it shows. */
  onUndone?: () => void
  /** Most recent audit entries to load. */
  limit?: number
}

export default function ChangeHistory({ companyId, onUndone, limit = 200 }: Props) {
  const supabase = createClient()
  const [tick, setTick] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState<string | null>(null)
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null)

  // Derived, not stored: loading until the rows on hand answer this exact
  // request. `scope` changes only when pointed somewhere else, so a refresh
  // after an undo keeps the list up (with a spinner) instead of blanking it.
  const scope = `${companyId ?? '*'}:${limit}`
  const key = `${scope}:${tick}`
  const loading = loaded?.key !== key
  const current = loaded?.scope === scope ? loaded : null

  useEffect(() => {
    let cancelled = false
    const done = (l: Omit<Loaded, 'key' | 'scope' | 'at'>) => {
      if (!cancelled) setLoaded({ ...l, key, scope, at: Date.now() })
    }
    const page = (n: number, before?: number) => {
      let q = supabase.from('audit_log').select('*').order('id', { ascending: false }).limit(n)
      if (companyId) q = q.eq('company_id', companyId)
      if (before != null) q = q.lt('id', before)
      return q
    }

    ;(async () => {
      const { data, error } = await page(limit)
      if (cancelled) return
      if (error) {
        done({ groups: [], names: {}, companies: {}, openKey: null, missing: isMissingAudit(error), error: error.message })
        return
      }
      let rows = (data ?? []) as AuditEntry[]

      // The oldest edit on the page may carry on past it (a company delete is
      // one edit of possibly hundreds of rows). Pull older rows until it's
      // whole — undoing half an edit would be worse than not offering it.
      let open = rows.length === limit
      for (let i = 0; open && i < EXTEND_ROUNDS; i++) {
        const { data: older, error: e2 } = await page(EXTEND_PAGE, Math.min(...rows.map((r) => r.id)))
        if (cancelled) return
        if (e2) break // stays open → its Undo is withheld
        const next = extendOldest(rows, (older ?? []) as AuditEntry[], (older?.length ?? 0) === EXTEND_PAGE)
        rows = next.rows
        open = next.open
      }
      const groups = groupEntries(rows)

      const who = [...new Set(rows.map((r) => r.changed_by).filter((x): x is string => !!x))]
      const cos = companyId ? [] : [...new Set(rows.map((r) => r.company_id).filter((x): x is string => !!x))]
      const [profiles, companies] = await Promise.all([
        who.length ? supabase.from('profiles').select('id, full_name, email').in('id', who) : Promise.resolve({ data: [] }),
        cos.length ? supabase.from('portfolio_companies').select('id, name').in('id', cos) : Promise.resolve({ data: [] }),
      ])
      if (cancelled) return
      // Names are decoration — a failed lookup falls back rather than hiding the history.
      const names: Record<string, string> = {}
      for (const p of (profiles.data ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
        names[p.id] = p.full_name || p.email || 'Unknown user'
      }
      const coNames: Record<string, string> = {}
      for (const c of (companies.data ?? []) as { id: string; name: string }[]) coNames[c.id] = c.name
      // A deleted company is only in its own history now. "Deleted" only when
      // the lookup actually answered — a failed one proves nothing.
      const lookedUp = !('error' in companies && companies.error)
      for (const id of cos) {
        if (!coNames[id]) coNames[id] = companyNameFromEntries(rows, id) ?? (lookedUp ? 'Deleted company' : 'Company')
      }

      done({ groups, names, companies: coNames, openKey: open ? groups[groups.length - 1]?.key ?? null : null, missing: false, error: '' })
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function whoName(id: string | null): string {
    if (!id) return 'System'
    return current?.names[id] ?? 'Unknown user'
  }

  async function undo(g: AuditGroup) {
    const when = exactTime(g.ended)
    const ok = confirm(
      `Undo this edit?\n\n${summarise(g)}\n${whoName(g.who)} · ${when}\n\n`
      + `All ${g.ids.length} recorded change${g.ids.length === 1 ? '' : 's'} in it will be reversed together.`,
    )
    if (!ok) return
    setRunning(g.key)
    setResult(null)
    const { data, error } = await supabase.rpc('undo_audit_entries', { entry_ids: g.ids })
    setRunning(null)
    if (error) {
      setResult({ ok: false, text: isMissingAudit(error) ? MIGRATION_HINT : error.message })
      return
    }
    let text = fmtUndoResult(data as UndoResult)
    // The Portfolio list was loaded before this and won't know on its own.
    if (!companyId && touchesCompanyExistence(g)) text += ' Refresh the Portfolio page to see the change there.'
    setResult({ ok: true, text })
    setTick((t) => t + 1)
    onUndone?.()
  }

  function toggle(k: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            Change history
            <InfoTip label="About change history">
              Records every change to rounds, positions, valuation marks, the cap table, cash, revenue and fund
              snapshots — who made it and what it was before. Undo reverses a whole edit at once, and refuses if any
              of its rows have changed since (undo the newer edit first). Files and decks aren&apos;t covered.
            </InfoTip>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Every edit to the money tables — undo one if it was wrong</p>
        </div>
        <button
          onClick={() => { setResult(null); setTick((t) => t + 1) }}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh history"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-50 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading && current ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {result && (
        <p className={`text-xs px-3 py-2 rounded-lg break-words ${result.ok ? 'text-green-700 bg-green-50' : 'text-red-600 bg-red-50'}`}>
          {result.text}
        </p>
      )}

      {!current ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : current.missing ? (
        <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">{MIGRATION_HINT}</p>
      ) : current.error ? (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg break-words">Couldn&apos;t load the history: {current.error}</p>
      ) : current.groups.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No changes recorded yet — history starts from when it was switched on.</p>
      ) : (
        <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100">
          {current.groups.map((g) => {
            const open = expanded.has(g.key)
            const partial = current.openKey === g.key
            const n = g.ids.length
            return (
              <li key={g.key} className="px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <button
                    onClick={() => toggle(g.key)}
                    aria-expanded={open}
                    className="flex-1 min-w-0 flex items-start gap-1.5 text-left"
                  >
                    {open
                      ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-sm text-slate-800 break-words">{summarise(g)}</span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        {!companyId && g.company_id && (
                          <span className="font-medium text-slate-500">{current.companies[g.company_id]} · </span>
                        )}
                        {whoName(g.who)} · <time dateTime={g.ended} title={exactTime(g.ended)}>{relativeTime(g.ended, current.at)}</time>
                        {' · '}{n} change{n === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => undo(g)}
                    disabled={!!running || loading || partial}
                    title={partial ? 'This edit reaches past the loaded history, so it can’t be undone from here.' : 'Undo this whole edit'}
                    className="flex items-center gap-1 px-2.5 py-1 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 transition shrink-0"
                  >
                    {running === g.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5 text-slate-400" />}
                    Undo
                  </button>
                </div>
                {open && <GroupDetails entries={g.entries} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ─── Details ─────────────────────────────────────────────────────────────────

function GroupDetails({ entries }: { entries: AuditEntry[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? entries : entries.slice(0, DETAIL_ROWS)
  return (
    <div className="mt-2 ml-5 max-md:ml-0 space-y-2.5">
      {shown.map((e) => {
        const diffs = fieldDiffs(e)
        return (
          <div key={e.id}>
            <p className="text-xs font-medium text-slate-600 break-words">{describeEntry(e)}</p>
            {diffs.length > 0 && (
              <dl className="mt-1 space-y-1">
                {diffs.map((d) => <DiffRow key={d.key + d.label} d={d} />)}
              </dl>
            )}
          </div>
        )
      })}
      {entries.length > shown.length && (
        <button onClick={() => setAll(true)} className="text-xs text-blue-600 hover:underline">
          Show all {entries.length} changes
        </button>
      )}
    </div>
  )
}

function DiffRow({ d }: { d: FieldDiff }) {
  const update = d.before !== null && d.after !== null
  return (
    <div className="text-xs grid grid-cols-[8rem_minmax(0,1fr)] gap-2 max-md:grid-cols-1 max-md:gap-0">
      <dt className="text-slate-400">{d.label}</dt>
      <dd className="text-slate-700 break-words min-w-0">
        {d.before !== null && (
          <Val text={d.before} full={d.beforeFull} className={update ? 'text-slate-400 line-through decoration-slate-300' : ''} />
        )}
        {update && <span className="text-slate-300 mx-1">→</span>}
        {d.after !== null && <Val text={d.after} full={d.afterFull} className={update ? 'text-slate-900' : ''} />}
      </dd>
    </div>
  )
}

// Long text (notes) is cut to a line; the rest is one tap away rather than a
// hover, so it works on a phone too.
function Val({ text, full, className }: { text: string; full?: string; className?: string }) {
  const [more, setMore] = useState(false)
  if (text === '') return <span className="text-slate-300">—</span>
  return (
    <>
      <span className={`whitespace-pre-wrap ${className ?? ''}`}>{more && full ? full : text}</span>
      {full && (
        <button onClick={() => setMore((m) => !m)} className="ml-1 text-blue-600 hover:underline">
          {more ? 'less' : 'more'}
        </button>
      )}
    </>
  )
}
