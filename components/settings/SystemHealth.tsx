'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Trash2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { LogEvent } from '@/lib/types'
import { formatDate } from '@/lib/utils'

// Background failures (activity logging, delete cleanup, deck serving) land in
// log_events instead of evaporating in Vercel's console. This card is how a
// human — or a future coding session — finds out something has been quietly
// failing. Empty is the healthy state and is shown as such.
export default function SystemHealth() {
  const supabase = createClient()
  const [events, setEvents] = useState<LogEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [tableMissing, setTableMissing] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    supabase
      .from('log_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: e }) => {
        if (!active) return
        // Missing table = migration_features_1.sql not run yet; say so rather
        // than pretending everything is healthy.
        if (e) setTableMissing(true)
        setEvents((data as LogEvent[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [supabase])

  async function clearAll() {
    setClearing(true)
    setError('')
    const { error: e } = await supabase.from('log_events').delete().gte('created_at', '1970-01-01')
    setClearing(false)
    if (e) { setError(`Couldn't clear the log: ${e.message}`); return }
    setEvents([])
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">System Health</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Background failures — activity logging, delete cleanup, deck serving. Empty is good.
          </p>
        </div>
        {events.length > 0 && (
          <button
            onClick={clearAll}
            disabled={clearing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition"
          >
            {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-slate-400" />}
            Clear
          </button>
        )}
      </div>
      <div className="px-5 py-4">
        {loading ? (
          <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
        ) : tableMissing ? (
          <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
            The error log table doesn&apos;t exist yet — run supabase/migration_features_1.sql in the SQL Editor.
          </p>
        ) : events.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <CheckCircle2 className="w-4 h-4 text-green-600" /> No recorded failures.
          </p>
        ) : (
          <div className="space-y-2">
            {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            {events.map((ev) => (
              <div key={ev.id} className="flex items-start gap-2.5 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-slate-700 break-words">
                    <span className="font-medium text-slate-900">{ev.source}</span> — {ev.message}
                  </p>
                  <p className="text-xs text-slate-400">{formatDate(ev.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
