'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    let s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"'
    return s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
}

function download(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export default function DataExport() {
  const supabase = createClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function run(key: string, table: string, filename: string, select = '*') {
    setBusy(key)
    setError('')
    const { data, error: qErr } = await supabase.from(table).select(select)
    if (qErr) {
      // Never download an empty CSV that looks like a valid backup.
      setError(`Export failed: ${qErr.message}`)
      setBusy(null)
      return
    }
    // Cast via unknown: a runtime-built select string leaves supabase-js unable
    // to infer a row shape, so it widens to its error union.
    let rows = (data as unknown as Record<string, unknown>[]) ?? []
    // Flatten an embedded parent (revenue rows key on company_id, which is a UUID
    // and useless in a spreadsheet) into a plain `company` column.
    rows = rows.map((r) => {
      const embedded = r.portfolio_companies as { name?: string } | null | undefined
      if (embedded === undefined) return r
      const rest = { ...r }
      delete rest.portfolio_companies
      return { company: embedded?.name ?? '', ...rest }
    })
    download(filename, toCSV(rows))
    setBusy(null)
  }

  const exports = [
    { key: 'deals', table: 'deals', label: 'Deals', file: 'deals.csv' },
    { key: 'portfolio', table: 'portfolio_companies', label: 'Portfolio Companies', file: 'portfolio_companies.csv' },
    { key: 'catalysts', table: 'catalysts', label: 'Catalysts', file: 'catalysts.csv' },
    { key: 'revenue', table: 'portfolio_revenue', label: 'Revenue', file: 'portfolio_revenue.csv', select: '*, portfolio_companies(name)' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Data Export</h2>
        <p className="text-xs text-slate-500 mt-0.5">Download a CSV snapshot for backups or analysis in Excel</p>
      </div>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-5 py-2">{error}</p>
      )}
      <div className="px-5 py-4 flex flex-wrap gap-2">
        {exports.map((e) => (
          <button key={e.key} onClick={() => run(e.key, e.table, e.file, e.select)} disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
            {busy === e.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-slate-400" />}
            {e.label}
          </button>
        ))}
      </div>
    </div>
  )
}
