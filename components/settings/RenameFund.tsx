'use client'

import { useEffect, useState } from 'react'
import { Loader2, X, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  FUND_NAME_COLUMNS, RenameCounts, renameError, pgArrayLiteral, isMissingRpc, parseRenameCounts, totalCount,
} from '@/lib/fundRename'

// Rename a fund everywhere its name is stored, in one transaction. A fund name
// is free text copied into several tables; the 2026-09-16 hand rename of
// "Solas/Sower" missed portfolio_companies.funds for a week. The dialog shows a
// read-only dry run (row counts per column) before anything is written, then
// calls rename_fund() — supabase/migration_rename_fund.sql — which re-validates
// and does every update or none.

type Preview = { counts: Partial<RenameCounts>; existing: string[]; error: string }

export default function RenameFund({ oldName, onClose, onRenamed }: {
  oldName: string
  onClose: () => void
  onRenamed: (newName: string) => void
}) {
  const supabase = createClient()
  const [newName, setNewName] = useState(oldName)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<RenameCounts | null>(null)

  useEffect(() => {
    let active = true
    const countQueries = FUND_NAME_COLUMNS.map((c) => {
      const q = supabase.from(c.table).select('id', { count: 'exact', head: true })
      if ('listKey' in c) return q.eq('list_key', c.listKey).eq(c.column, oldName)
      // supabase-js doesn't quote array elements, so hand it a literal.
      if ('isArray' in c) return q.contains(c.column, pgArrayLiteral([oldName]))
      return q.eq(c.column, oldName)
    })
    Promise.all([
      supabase.from('list_options').select('value').in('list_key', ['fund', 'spv_fund']),
      ...countQueries,
    ]).then(([listRes, ...countRes]) => {
      if (!active) return
      const counts: Partial<RenameCounts> = {}
      const errs: string[] = []
      countRes.forEach((r, i) => {
        const c = FUND_NAME_COLUMNS[i]
        if (r.error) errs.push(`${c.label}: ${r.error.message}`)
        else counts[c.key] = r.count ?? 0
      })
      if (listRes.error) errs.push(`fund lists: ${listRes.error.message}`)
      const existing = ((listRes.data ?? []) as { value: string | null }[]).map((r) => r.value).filter((v): v is string => v != null)
      setPreview({ counts, existing, error: errs.join('; ') })
    })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldName])

  const validation = renameError(oldName, newName, preview?.existing ?? [])
  const unchanged = newName.trim() === oldName
  const total = preview ? totalCount(preview.counts) : 0

  async function rename() {
    if (validation || saving || !preview) return
    setSaving(true)
    setError('')
    const next = newName.trim()
    const { data, error: e } = await supabase.rpc('rename_fund', { old_name: oldName, new_name: next })
    setSaving(false)
    if (e) {
      setError(isMissingRpc(e)
        ? 'Run supabase/migration_rename_fund.sql in the Supabase SQL editor first.'
        : "Couldn't rename: " + e.message)
      return
    }
    setResult(parseRenameCounts(data))
    onRenamed(next)
  }

  function close() { if (!saving) onClose() }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-fund-title"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 max-md:px-4 py-4 border-b border-slate-100 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 id="rename-fund-title" className="text-base font-semibold text-slate-900">Rename fund</h3>
            <p className="text-sm text-slate-500 mt-0.5 break-words">
              Currently <strong className="text-slate-700">{oldName}</strong>. Renames it everywhere at once.
            </p>
          </div>
          <button onClick={close} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition shrink-0"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 max-md:px-4 py-4 space-y-4">
          {result ? (
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <Check className="w-4 h-4 shrink-0" /> Renamed to “{newName.trim()}” — {totalCount(result)} {totalCount(result) === 1 ? 'row' : 'rows'} updated.
              </p>
              <CountList counts={result} />
            </div>
          ) : (
            <>
              <div>
                <label htmlFor="rename-fund-input" className="block text-xs text-slate-500 mb-1">New name</label>
                <input
                  id="rename-fund-input"
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') rename()
                    if (e.key === 'Escape') close()
                  }}
                  maxLength={120}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {validation && !unchanged && <p className="text-xs text-red-600 mt-1">{validation}</p>}
              </div>

              <div>
                <p className="text-xs text-slate-500 mb-1.5">
                  {preview
                    ? <>Dry run — <strong className="text-slate-700">{total} {total === 1 ? 'row' : 'rows'}</strong> will change:</>
                    : 'Counting affected rows…'}
                </p>
                {preview ? <CountList counts={preview.counts} /> : <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>}
                {preview?.error && <p className="text-xs text-amber-700 mt-1.5">Some counts couldn&apos;t be read ({preview.error}). The rename still checks every table itself.</p>}
                <p className="text-[11px] text-slate-400 mt-2">Notes and activity history keep the old name — they record what was written at the time.</p>
              </div>
            </>
          )}
          {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 break-words">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 max-md:px-4 py-3 border-t border-slate-100 shrink-0">
          {result ? (
            <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition">Done</button>
          ) : (
            <>
              <button onClick={close} disabled={saving} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-40 transition">Cancel</button>
              <button
                onClick={rename}
                disabled={!!validation || saving || !preview}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition"
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Rename
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function CountList({ counts }: { counts: Partial<RenameCounts> }) {
  return (
    <ul className="rounded-lg border border-slate-100 divide-y divide-slate-100 text-sm">
      {FUND_NAME_COLUMNS.map((c) => {
        const n = counts[c.key]
        return (
          <li key={c.key} className="flex items-center justify-between gap-3 px-3 py-1.5">
            <span className={n ? 'text-slate-700' : 'text-slate-400'}>{c.label}</span>
            <span className={`tabular-nums ${n ? 'font-medium text-slate-900' : 'text-slate-300'}`}>{n ?? '—'}</span>
          </li>
        )
      })}
    </ul>
  )
}
