'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Clock, TrendingDown, FileClock, Loader2 } from 'lucide-react'
import { Deal } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { isExpired, DECK_LINK_TTL_MS } from '@/lib/deck'

const STALE_DAYS = 21

function daysSince(iso: string | null): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

type Maturity = { company: string; text: string; overdue: boolean }
type DeckExpiry = { company: string; label: string; daysLeft: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Round = { company_id: string; security_type: string | null; status: string | null; terms: any }

export default function NeedsAttention({ deals }: { deals: Deal[] }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [maturity, setMaturity] = useState<Maturity[]>([])
  const [expiring, setExpiring] = useState<DeckExpiry[]>([])

  // Aging deals — computed from data the board already has (no extra query).
  const stale = deals
    .filter((d) => d.stage !== 'Passed' && d.stage !== 'Invested')
    .map((d) => ({ d, days: daysSince(d.stage_entered_at) }))
    .filter((x) => x.days != null && x.days >= STALE_DAYS)
    .sort((a, b) => (b.days ?? 0) - (a.days ?? 0))

  // Maturity + deck-expiry are fetched lazily on first expand, to keep the
  // most-visited page's load path free of extra queries.
  async function loadRest() {
    setLoading(true)
    const [{ data: rounds }, { data: comps }, { data: decks }] = await Promise.all([
      supabase.from('portfolio_fundraise_rounds').select('company_id,security_type,status,terms'),
      supabase.from('portfolio_companies').select('id,name'),
      supabase.from('company_decks').select('company_name,label,shared_at').not('shared_at', 'is', null),
    ])
    const nameById: Record<string, string> = {}
    for (const c of ((comps as { id: string; name: string }[]) ?? [])) nameById[c.id] = c.name

    const mats: Maturity[] = []
    for (const r of ((rounds as Round[]) ?? [])) {
      if ((r.security_type === 'Convertible note' || r.security_type === 'SAFE') && r.status !== 'Converted') {
        const md = r.terms?.maturity_date
        if (md) {
          const days = Math.round((new Date(String(md) + 'T00:00:00').getTime() - Date.now()) / 86400000)
          const company = nameById[r.company_id] ?? 'A company'
          const label = (r.security_type ?? '').toLowerCase()
          if (days < 0) mats.push({ company, overdue: true, text: `${label} matured ${Math.abs(days)}d ago, unconverted` })
          else if (days <= 90) mats.push({ company, overdue: false, text: `${label} matures in ${days}d, unconverted` })
        }
      }
    }
    mats.sort((a, b) => (a.overdue === b.overdue ? 0 : a.overdue ? -1 : 1))

    const exps: DeckExpiry[] = []
    for (const dk of ((decks as { company_name: string; label: string; shared_at: string }[]) ?? [])) {
      if (isExpired(dk.shared_at)) continue
      const daysLeft = Math.ceil((new Date(dk.shared_at).getTime() + DECK_LINK_TTL_MS - Date.now()) / 86400000)
      if (daysLeft >= 0 && daysLeft <= 7) exps.push({ company: dk.company_name, label: dk.label, daysLeft })
    }
    exps.sort((a, b) => a.daysLeft - b.daysLeft)

    setMaturity(mats)
    setExpiring(exps)
    setLoaded(true)
    setLoading(false)
  }

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && !loaded && !loading) loadRest()
  }

  return (
    <div className="mx-4 md:mx-6 mt-3 border border-amber-200 bg-amber-50 rounded-lg text-sm shrink-0">
      <button onClick={toggle} className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left">
        <span className="flex items-center gap-2 text-amber-800 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {stale.length > 0
            ? `${stale.length} deal${stale.length === 1 ? '' : 's'} need follow-up`
            : 'Review follow-ups & expiring items'}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-amber-600 shrink-0" /> : <ChevronRight className="w-4 h-4 text-amber-600 shrink-0" />}
      </button>

      {open && (
        <div className="px-3 pb-3 pt-2 space-y-3 border-t border-amber-100">
          {/* Aging deals */}
          <Group icon={<Clock className="w-3.5 h-3.5" />} title={`Aging deals (>${STALE_DAYS}d in stage)`} count={stale.length} emptyText="No aging deals">
            {stale.map(({ d, days }) => (
              <Row key={d.id} left={d.name} mid={d.stage} right={`${days}d`} />
            ))}
          </Group>

          {loading ? (
            <div className="flex items-center gap-2 text-xs text-amber-700"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking portfolio…</div>
          ) : loaded ? (
            <>
              <Group icon={<TrendingDown className="w-3.5 h-3.5" />} title="Convertibles maturing" count={maturity.length} emptyText="None maturing soon">
                {maturity.map((m, i) => (
                  <Row key={i} left={m.company} mid={m.text} right="" danger={m.overdue} />
                ))}
              </Group>
              <Group icon={<FileClock className="w-3.5 h-3.5" />} title="Deck links expiring (≤7d)" count={expiring.length} emptyText="None expiring soon">
                {expiring.map((e, i) => (
                  <Row key={i} left={e.company} mid={e.label} right={`${e.daysLeft}d`} />
                ))}
              </Group>
            </>
          ) : null}
        </div>
      )}
    </div>
  )
}

function Group({ icon, title, count, emptyText, children }: { icon: React.ReactNode; title: string; count: number; emptyText: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 mb-1">
        {icon} {title} {count > 0 && <span className="text-amber-500">({count})</span>}
      </div>
      {count === 0 ? (
        <p className="text-xs text-amber-500/80 pl-5">{emptyText}</p>
      ) : (
        <div className="space-y-1 pl-5">{children}</div>
      )}
    </div>
  )
}

function Row({ left, mid, right, danger }: { left: string; mid: string; right: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-700 font-medium truncate">{left}</span>
      <span className={`flex-1 truncate ${danger ? 'text-red-600' : 'text-slate-500'}`}>{mid}</span>
      {right && <span className="text-xs text-slate-400 shrink-0 tabular-nums">{right}</span>}
    </div>
  )
}
