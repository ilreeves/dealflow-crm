'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { Deal } from '@/lib/types'

const STALE_DAYS = 30

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function NeedsAttention({ deals }: { deals: Deal[] }) {
  const [open, setOpen] = useState(true)

  // Aging deals — computed from data the board already has (no extra query).
  const stale = deals
    .filter((d) => d.stage !== 'Passed' && d.stage !== 'Invested')
    .map((d) => ({ d, days: daysSince(d.stage_entered_at) }))
    .filter((x) => x.days != null && x.days >= STALE_DAYS)
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))

  if (stale.length === 0) return null

  return (
    <div className="mx-4 md:mx-6 mt-3 border border-amber-200 bg-amber-50 rounded-lg text-sm shrink-0">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="flex items-center gap-2 text-amber-800 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {stale.length} deal{stale.length === 1 ? '' : 's'} need follow-up
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 border-t border-amber-100">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
            <Clock className="w-3.5 h-3.5" /> Aging deals (&gt;{STALE_DAYS}d in stage)
          </div>
          <div className="space-y-1 pl-5">
            {stale.map(({ d, days }) => (
              <div key={d.id} className="flex items-center justify-between gap-3">
                <span className="text-slate-700 font-medium truncate">{d.name}</span>
                <span className="flex-1 truncate text-slate-500">{d.stage}</span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{days}d</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
