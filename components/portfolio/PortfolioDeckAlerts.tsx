'use client'

import { useEffect, useState } from 'react'
import { FileClock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { isExpired, DECK_LINK_TTL_MS } from '@/lib/deck'

type Expiry = { entityId: string; company: string; label: string; daysLeft: number }

// Surfaces portfolio-company deck share links that expire within the next week,
// so they can be re-sent before they lapse. Renders nothing when none are due.
export default function PortfolioDeckAlerts({ onOpen }: { onOpen?: (companyId: string) => void }) {
  const supabase = createClient()
  const [items, setItems] = useState<Expiry[]>([])

  useEffect(() => {
    let active = true
    supabase.from('company_decks')
      .select('entity_id,company_name,label,shared_at')
      .eq('entity_type', 'portfolio')
      .not('shared_at', 'is', null)
      .then(({ data }) => {
        if (!active) return
        const rows = (data as { entity_id: string; company_name: string; label: string; shared_at: string }[]) ?? []
        const exps: Expiry[] = []
        for (const dk of rows) {
          if (isExpired(dk.shared_at)) continue
          const daysLeft = Math.ceil((new Date(dk.shared_at).getTime() + DECK_LINK_TTL_MS - Date.now()) / 86400000)
          if (daysLeft >= 0 && daysLeft <= 7) exps.push({ entityId: dk.entity_id, company: dk.company_name, label: dk.label, daysLeft })
        }
        exps.sort((a, b) => a.daysLeft - b.daysLeft)
        setItems(exps)
      })
    return () => { active = false }
  }, [supabase])

  if (items.length === 0) return null

  return (
    <div className="mx-6 mt-3 border border-amber-200 bg-amber-50 rounded-lg text-sm shrink-0">
      <div className="px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
          <FileClock className="w-3.5 h-3.5" /> Deck links expiring soon (≤7d)
        </div>
        <div className="space-y-1 pl-5">
          {items.map((e, i) => {
            const content = (
              <>
                <span className="text-slate-700 font-medium truncate">{e.company}</span>
                <span className="flex-1 truncate text-slate-500">{e.label}</span>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">{e.daysLeft}d left</span>
              </>
            )
            return onOpen ? (
              <button key={i} onClick={() => onOpen(e.entityId)} className="w-full flex items-center justify-between gap-3 text-left hover:opacity-70 transition">
                {content}
              </button>
            ) : (
              <div key={i} className="flex items-center justify-between gap-3">{content}</div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
