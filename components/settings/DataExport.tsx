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

  async function run(key: string, table: string, filename: string) {
    setBusy(key)
    const { data } = await supabase.from(table).select('*')
    const rows = (data as Record<string, unknown>[]) ?? []
    download(filename, toCSV(rows))
    setBusy(null)
  }

  const exports = [
    { key: 'deals', table: 'deals', label: 'Deals', file: 'deals.csv' },
    { key: 'portfolio', table: 'portfolio_companies', label: 'Portfolio Companies', file: 'portfolio_companies.csv' },
    { key: 'catalysts', table: 'catalysts', label: 'Catalysts', file: 'catalysts.csv' },
  ]

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Data Export</h2>
        <p className="text-xs text-slate-500 mt-0.5">Download a CSV snapshot for backups or analysis in Excel</p>
      </div>
      <div className="px-5 py-4 flex flex-wrap gap-2">
        {exports.map((e) => (
          <button key={e.key} onClick={() => run(e.key, e.table, e.file)} disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">
            {busy === e.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5 text-slate-400" />}
            {e.label}
          </button>
        ))}
      </div>
    </div>
  )
}
