'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, LayoutDashboard, Building2, CalendarDays } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface DealHit { id: string; name: string; stage: string; sector: string | null; category: string | null }
interface PortfolioHit { id: string; name: string; sector: string | null; category: string | null }
interface CatalystHit { id: string; company_name: string; title: string; period: string | null; status: string | null }

export default function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [deals, setDeals] = useState<DealHit[]>([])
  const [portfolio, setPortfolio] = useState<PortfolioHit[]>([])
  const [catalysts, setCatalysts] = useState<CatalystHit[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('open-global-search', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('open-global-search', onOpen)
    }
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
    else { setQ(''); setDeals([]); setPortfolio([]); setCatalysts([]) }
  }, [open])

  useEffect(() => {
    const clean = q.trim().replace(/[,()%*]/g, '')
    if (!clean) { setDeals([]); setPortfolio([]); setCatalysts([]); setLoading(false); return }
    let cancelled = false
    setLoading(true)
    const t = setTimeout(async () => {
      const term = `*${clean}*`
      const [d, p, c] = await Promise.all([
        supabase.from('deals').select('id,name,stage,sector,category').or(`name.ilike.${term},sector.ilike.${term}`).limit(6),
        supabase.from('portfolio_companies').select('id,name,sector,category').or(`name.ilike.${term},sector.ilike.${term}`).limit(6),
        supabase.from('catalysts').select('id,company_name,title,period,status').or(`company_name.ilike.${term},title.ilike.${term}`).limit(6),
      ])
      if (cancelled) return
      setDeals((d.data as DealHit[]) ?? [])
      setPortfolio((p.data as PortfolioHit[]) ?? [])
      setCatalysts((c.data as CatalystHit[]) ?? [])
      setLoading(false)
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q])

  function go(path: string) {
    setOpen(false)
    router.push(path)
  }

  if (!open) return null

  const hasResults = deals.length > 0 || portfolio.length > 0 || catalysts.length > 0

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center pt-[15vh] px-4 bg-black/30" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search deals, companies, catalysts…"
            className="flex-1 py-3.5 text-sm focus:outline-none placeholder:text-slate-400"
          />
          {loading && <Loader2 className="w-4 h-4 text-slate-300 animate-spin shrink-0" />}
          <kbd className="text-[10px] text-slate-400 border border-slate-200 rounded px-1.5 py-0.5 shrink-0">esc</kbd>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!q.trim() ? (
            <p className="text-sm text-slate-400 text-center py-8">Type to search across deals, portfolio companies, and catalysts.</p>
          ) : !hasResults && !loading ? (
            <p className="text-sm text-slate-400 text-center py-8">No matches for &quot;{q}&quot;.</p>
          ) : (
            <>
              {deals.length > 0 && (
                <Group label="Deals">
                  {deals.map((d) => (
                    <Row key={d.id} icon={<LayoutDashboard className="w-3.5 h-3.5 text-slate-400" />} onClick={() => go(`/?open=${d.id}`)}
                      title={d.name} meta={[d.stage, d.category, d.sector].filter(Boolean).join(' · ')} />
                  ))}
                </Group>
              )}
              {portfolio.length > 0 && (
                <Group label="Portfolio Companies">
                  {portfolio.map((p) => (
                    <Row key={p.id} icon={<Building2 className="w-3.5 h-3.5 text-slate-400" />} onClick={() => go(`/portfolio?open=${p.id}`)}
                      title={p.name} meta={[p.category, p.sector].filter(Boolean).join(' · ')} />
                  ))}
                </Group>
              )}
              {catalysts.length > 0 && (
                <Group label="Catalysts">
                  {catalysts.map((c) => (
                    <Row key={c.id} icon={<CalendarDays className="w-3.5 h-3.5 text-slate-400" />} onClick={() => go('/catalysts')}
                      title={`${c.company_name} — ${c.title}`} meta={[c.period, c.status].filter(Boolean).join(' · ')} />
                  ))}
                </Group>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide px-2 py-1">{label}</p>
      {children}
    </div>
  )
}

function Row({ icon, title, meta, onClick }: { icon: React.ReactNode; title: string; meta: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-100 text-left transition">
      <span className="shrink-0">{icon}</span>
      <span className="text-sm font-medium text-slate-800 truncate">{title}</span>
      {meta && <span className="text-xs text-slate-400 ml-auto shrink-0 truncate max-w-[45%]">{meta}</span>}
    </button>
  )
}
