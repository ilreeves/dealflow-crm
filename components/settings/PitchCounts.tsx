'use client'

import { useEffect, useState } from 'react'
import { Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MonthlyPitchCount } from '@/lib/types'

// The top of the dealflow funnel: one number per month from the inbound-pitch
// email audit (distinct companies, not raw messages). The trailing 13 months
// are always shown so the current month can be filled in as soon as the audit
// runs; Analytics reads whatever exists and shows a dash for gaps.
export default function PitchCounts() {
  const supabase = createClient()
  const [rows, setRows] = useState<Map<string, MonthlyPitchCount>>(new Map())
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  const months: { key: string; label: string }[] = []
  {
    const now = new Date()
    for (let i = 12; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`,
        label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
      })
    }
    months.reverse() // newest first — the month being entered sits on top
  }

  useEffect(() => {
    let active = true
    supabase
      .from('monthly_pitch_counts')
      .select('*')
      .order('month', { ascending: false })
      .then(({ data, error: e }) => {
        if (!active) return
        if (e) setTableMissing(true)
        const map = new Map<string, MonthlyPitchCount>()
        for (const r of (data as MonthlyPitchCount[]) ?? []) map.set(r.month, r)
        setRows(map)
        setLoading(false)
      })
    return () => { active = false }
  }, [supabase])

  async function save(monthKey: string) {
    const raw = drafts[monthKey]?.trim()
    if (raw == null || raw === '') return
    const n = parseInt(raw, 10)
    if (isNaN(n) || n < 0) { setError('Pitch count must be a non-negative number.'); return }
    setSavingKey(monthKey)
    setError('')
    const { data, error: e } = await supabase
      .from('monthly_pitch_counts')
      .upsert({ month: monthKey, pitches: n }, { onConflict: 'month' })
      .select()
      .single()
    setSavingKey(null)
    if (e || !data) { setError(`Couldn't save: ${e?.message ?? 'no row returned'}`); return }
    setRows((prev) => new Map(prev).set(monthKey, data as MonthlyPitchCount))
    setDrafts((prev) => ({ ...prev, [monthKey]: '' }))
    setSavedKey(monthKey)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Monthly Pitch Counts</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Inbound pitches from the monthly email audit (distinct companies). Feeds the Dealflow funnel on Analytics.
        </p>
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
        ) : tableMissing ? (
          <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
            The pitch-counts table doesn&apos;t exist yet — run supabase/migration_pitch_funnel.sql in the SQL Editor.
          </p>
        ) : (
          <div className="space-y-1.5">
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {months.map(({ key, label }) => {
              const existing = rows.get(key)
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <span className="w-36 text-slate-700">{label}</span>
                  <span className="w-12 text-right tabular-nums font-medium text-slate-900">
                    {existing ? existing.pitches : <span className="text-slate-300">—</span>}
                  </span>
                  <input
                    value={drafts[key] ?? ''}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [key]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(key) }}
                    placeholder={existing ? 'correct…' : 'count…'}
                    className="w-24 px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                  <button
                    onClick={() => save(key)}
                    disabled={savingKey === key || !(drafts[key] ?? '').trim()}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    {savingKey === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
                  </button>
                  {savedKey === key && <Check className="w-4 h-4 text-green-600" />}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
