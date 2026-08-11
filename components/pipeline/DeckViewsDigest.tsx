'use client'

import { useState } from 'react'
import { Eye, ChevronDown, ChevronRight } from 'lucide-react'

// One recent deck open, already joined to its deck's label server-side.
export interface DeckViewDigestRow {
  id: string
  company_name: string | null
  deck_label: string | null
  viewer_name: string | null
  viewer_email: string | null
  viewed_at: string
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

/**
 * Who opened a shared deck recently. The whole point of the deck gate is this
 * signal — until now the rows landed in deck_views and nobody was told.
 * Collapsed strip, same shape as NeedsAttention; renders nothing when quiet.
 */
export default function DeckViewsDigest({ views }: { views: DeckViewDigestRow[] }) {
  const [open, setOpen] = useState(false)
  if (views.length === 0) return null

  return (
    <div className="mx-4 md:mx-6 mt-3 border rounded-lg text-sm shrink-0" style={{ borderColor: 'rgba(2,58,81,0.25)', backgroundColor: 'rgba(2,58,81,0.05)' }}>
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="flex items-center gap-2 font-medium" style={{ color: '#023a51' }}>
          <Eye className="w-4 h-4 shrink-0" />
          {views.length} deck view{views.length === 1 ? '' : 's'} in the last 14 days
        </span>
        {open ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: '#023a51' }} /> : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#023a51' }} />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: 'rgba(2,58,81,0.12)' }}>
          <div className="space-y-1 pl-1">
            {views.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3">
                <span className="text-slate-700 font-medium truncate">
                  {v.viewer_name || 'Someone'}
                  {v.viewer_email && <span className="text-slate-400 font-normal"> · {v.viewer_email}</span>}
                </span>
                <span className="flex-1 truncate text-slate-500">
                  {v.company_name ?? 'Unknown company'}
                  {v.deck_label && v.deck_label.toLowerCase() !== 'deck' ? ` — ${v.deck_label}` : ''}
                </span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{timeAgo(v.viewed_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
