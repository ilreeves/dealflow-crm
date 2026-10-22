'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search, Plus, Map as MapIcon, X, ExternalLink, Pencil, Check, Loader2 } from 'lucide-react'
import { Program } from '@/lib/types'
import {
  MAP_COLUMNS, OWNER_LABELS, ProgramOwner, MapProgram, buildMap, toMapProgram, knownIndications,
  isDrugModality, phaseColumn,
} from '@/lib/programs'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import PageHeader from '@/components/shared/PageHeader'
import InfoTip from '@/components/shared/InfoTip'
import PhaseBadge from '@/components/market/PhaseBadge'
import ProgramEditModal from '@/components/market/ProgramEditModal'

interface Props {
  initialPrograms: Program[]
  portfolio: { id: string; name: string; status: string | null; sector: string | null }[]
  deals: { id: string; name: string; stage: string; sector: string | null }[]
}

// Chip look per owner. The owner toggles in the header reuse these swatches,
// so the filter row doubles as the legend.
const OWNER_STYLES: Record<ProgramOwner, string> = {
  portfolio: 'bg-[#023a51] text-white border-[#023a51]',
  pipeline: 'bg-[#eef6e3] text-[#2f5600] border-[#5ba200]',
  external: 'bg-[#fdf0e3] text-[#8a4a0e] border-[#e98925]',
  passed: 'bg-white text-slate-400 border-dashed border-slate-300',
}
const OWNER_ORDER: ProgramOwner[] = ['portfolio', 'pipeline', 'external', 'passed']

type ModalityFilter = 'all' | 'drug' | 'device'

// Dense cells (approved markets are crowded) show this many chips until the row is expanded.
const CELL_LIMIT = 6

const selectCls = 'py-1.5 pl-2 pr-7 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900'

// Chip-level match. The indication is deliberately left out: a search for
// "stroke" should keep the stroke row, not ring every chip in it.
function matches(p: MapProgram, q: string): boolean {
  return [p.companyLabel, p.intervention, p.mechanism ?? ''].some((s) => s.toLowerCase().includes(q))
}

export default function MarketMap({ initialPrograms, portfolio, deals }: Props) {
  const [programs, setPrograms] = useState<Program[]>(initialPrograms)
  // Passed deals are context, not the market — off until asked for.
  const [owners, setOwners] = useState<Set<ProgramOwner>>(new Set(['portfolio', 'pipeline', 'external']))
  const [showDiscontinued, setShowDiscontinued] = useState(false)
  const [modality, setModality] = useState<ModalityFilter>('all')
  const [area, setArea] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<MapProgram | null>(null)
  const [editing, setEditing] = useState<Program | 'new' | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const lookups = useMemo(() => ({
    portfolio: new Map(portfolio.map((p) => [p.id, { name: p.name, status: p.status }])),
    deals: new Map(deals.map((d) => [d.id, { name: d.name, stage: d.stage }])),
  }), [portfolio, deals])

  const all = useMemo(
    () => programs.map((p) => toMapProgram(p, lookups)).filter((p): p is MapProgram => p !== null),
    [programs, lookups],
  )

  const ownerCounts = useMemo(() => {
    const c: Record<ProgramOwner, number> = { portfolio: 0, pipeline: 0, external: 0, passed: 0 }
    for (const p of all) if (showDiscontinued || p.status === 'Active') c[p.owner]++
    return c
  }, [all, showDiscontinued])
  const reviewCount = useMemo(() => all.filter((p) => p.needs_review).length, [all])
  const areas = useMemo(() => Array.from(new Set(all.map((p) => p.therapeutic_area))).sort(), [all])
  const specialties = useMemo(() => Array.from(new Set(all.map((p) => p.specialty).filter((s): s is string => !!s))).sort(), [all])

  const filtered = useMemo(() => all.filter((p) =>
    owners.has(p.owner) &&
    (showDiscontinued || p.status === 'Active') &&
    (modality === 'all' || (modality === 'drug') === isDrugModality(p.modality)) &&
    (!area || p.therapeutic_area === area) &&
    (!specialty || p.specialty === specialty) &&
    (!reviewOnly || p.needs_review),
  ), [all, owners, showDiscontinued, modality, area, specialty, reviewOnly])

  // Search keeps whole indication rows (so you still see the field around a
  // match) and rings the matching chips.
  const q = search.trim().toLowerCase()
  const { groups, hits } = useMemo(() => {
    const built = buildMap(filtered)
    if (!q) return { groups: built, hits: new Set<string>() }
    const hitIds = new Set(filtered.filter((p) => matches(p, q)).map((p) => p.id))
    const kept = built
      .map((g) => ({ ...g, rows: g.rows.filter((r) => r.indication.toLowerCase().includes(q) || r.cells.some((c) => c.some((p) => hitIds.has(p.id)))) }))
      .filter((g) => g.rows.length > 0)
    return { groups: kept, hits: hitIds }
  }, [filtered, q])

  const shownRows = groups.reduce((n, g) => n + g.rows.length, 0)
  const shownPrograms = groups.reduce((n, g) => n + g.rows.reduce((m, r) => m + r.cells.reduce((k, c) => k + c.length, 0), 0), 0)

  function toggleRow(indication: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(indication)) next.delete(indication)
      else next.add(indication)
      return next
    })
  }

  function toggleOwner(o: ProgramOwner) {
    setOwners((prev) => {
      const next = new Set(prev)
      if (next.has(o)) next.delete(o)
      else next.add(o)
      return next
    })
  }

  const portfolioOptions = useMemo(() => portfolio.map((p) => ({ id: p.id, name: p.name, sector: p.sector })), [portfolio])
  const dealOptions = useMemo(() => deals.filter((d) => d.stage !== 'Invested').map((d) => ({ id: d.id, name: `${d.name}${d.stage === 'Passed' ? ' (passed)' : ''}`, sector: d.sector })), [deals])
  const indicationSuggestions = useMemo(() => knownIndications(programs), [programs])
  // Solas programs only — a competitor's specialty follows ours, never another competitor's.
  const specialtyPeers = useMemo(() => programs.filter((p) => !p.company_name).map((p) => ({ indication: p.indication, modality: p.modality, specialty: p.specialty, fromPortfolio: !!p.company_id })), [programs])

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Market Map
            <InfoTip label="How phases are placed">
              Each program is a company × intervention × indication. Drugs and devices climb different ladders, so both are placed on shared columns: Phase 1 and first-in-human count as early clinical; Phase 2 and early feasibility as mid; Phase 3 and pivotal as late; NDA/BLA filed and 510(k)/PMA submitted as under review. A program sits at the highest stage it has reached for that indication. Rows drafted from research start as “needs review” — use that filter to see and clear them.
            </InfoTip>
          </span>
        }
        subtitle={`${shownPrograms} programs across ${shownRows} indications`}
        actions={
          <>
            <div className="relative max-md:w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Company, drug, indication…"
                className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 w-56 max-md:w-full"
              />
            </div>
            <button
              onClick={() => setEditing('new')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg transition"
              style={{ backgroundColor: '#e98925' }}
            >
              <Plus className="w-4 h-4" />
              Add Program
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {OWNER_ORDER.map((o) => {
            const on = owners.has(o)
            return (
              <button
                key={o}
                onClick={() => toggleOwner(o)}
                aria-pressed={on}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition',
                  on ? 'border-slate-300 bg-white text-slate-700' : 'border-slate-200 bg-slate-50 text-slate-400',
                )}
              >
                <span className={cn('w-3 h-3 rounded-sm border', OWNER_STYLES[o], !on && 'opacity-40')} />
                {OWNER_LABELS[o]}
                <span className="text-slate-400 tabular-nums">{ownerCounts[o]}</span>
              </button>
            )
          })}
          <span className="hidden md:block w-px h-5 bg-slate-200 mx-1" />
          <select value={modality} onChange={(e) => setModality(e.target.value as ModalityFilter)} className={selectCls} aria-label="Modality">
            <option value="all">All modalities</option>
            <option value="drug">Drugs &amp; biologics</option>
            <option value="device">Devices, diagnostics &amp; digital</option>
          </select>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={selectCls} aria-label="Therapeutic area">
            <option value="">All therapeutic areas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} className={selectCls} aria-label="Specialty">
            <option value="">All specialties</option>
            {specialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 px-1 cursor-pointer">
            <input type="checkbox" checked={showDiscontinued} onChange={(e) => setShowDiscontinued(e.target.checked)} className="rounded border-slate-300" />
            Discontinued
          </label>
          {reviewCount > 0 && (
            <button
              onClick={() => setReviewOnly((v) => !v)}
              aria-pressed={reviewOnly}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition',
                reviewOnly ? 'bg-amber-50 border-amber-300 text-amber-800' : 'border-slate-200 text-slate-500 hover:text-slate-700',
              )}
            >
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Needs review <span className="tabular-nums">{reviewCount}</span>
            </button>
          )}
        </div>
      </PageHeader>

      {all.length === 0 ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MapIcon className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">No programs yet</p>
            <p className="text-sm text-slate-400 mt-1 max-w-sm">Add programs here or from a company&apos;s Overview tab to start the map.</p>
          </div>
        </div>
      ) : shownRows === 0 ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MapIcon className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">Nothing matches these filters</p>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: indication × phase grid. Scrolls both ways inside the page;
              the phase header and indication column stay pinned. */}
          <div className="flex-1 overflow-auto max-md:hidden">
            <table className="w-full min-w-[1180px] table-fixed border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky top-0 left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide w-56">Indication</th>
                  {MAP_COLUMNS.map((c) => (
                    <th key={c.key} className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 px-3 py-2 text-left align-bottom">
                      <span className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{c.label}</span>
                      <span className="block text-[10px] font-normal text-slate-400">{c.hint}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <AreaRows key={g.area} area={g.area} count={g.rows.length}>
                    {g.rows.map((r) => (
                      <tr key={r.indication} className="group/row">
                        <td className="sticky left-0 z-10 bg-white group-hover/row:bg-slate-50 border-b border-r border-slate-100 px-4 py-2 align-top">
                          <span className="font-medium text-slate-800">{r.indication}</span>
                          {r.oursCount > 0 && (
                            <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#5ba200] align-middle" title="Solas has a program here" />
                          )}
                        </td>
                        {r.cells.map((cell, i) => {
                          const rowOpen = expanded.has(r.indication) || !!q
                          const shown = rowOpen ? cell : cell.slice(0, CELL_LIMIT)
                          return (
                            <td key={i} className="border-b border-slate-100 group-hover/row:bg-slate-50/60 px-2 py-1.5 align-top">
                              <div className="flex flex-wrap gap-1">
                                {shown.map((p) => <Chip key={p.id} p={p} hit={hits.has(p.id)} showReview={reviewOnly} onSelect={setSelected} />)}
                                {cell.length > shown.length && (
                                  <button onClick={() => toggleRow(r.indication)} className="text-[11px] text-slate-500 hover:text-slate-800 px-1.5 py-0.5 rounded-md border border-transparent hover:border-slate-200 transition">
                                    +{cell.length - shown.length} more
                                  </button>
                                )}
                                {expanded.has(r.indication) && !q && cell.length > CELL_LIMIT && (
                                  <button onClick={() => toggleRow(r.indication)} className="text-[11px] text-slate-400 hover:text-slate-700 px-1.5 py-0.5 transition">Show less</button>
                                )}
                              </div>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </AreaRows>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phones: a 7-column grid can't fit, so each indication becomes a
              card listing its programs in phase order. */}
          <div className="flex-1 overflow-y-auto md:hidden px-4 py-4 space-y-5">
            {groups.map((g) => (
              <section key={g.area}>
                <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{g.area}</h2>
                <div className="space-y-2">
                  {g.rows.map((r) => (
                    <div key={r.indication} className="bg-white border border-slate-200 rounded-xl p-3">
                      <p className="text-sm font-medium text-slate-800 mb-2">
                        {r.indication}
                        {r.oursCount > 0 && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#5ba200] align-middle" />}
                      </p>
                      <div className="space-y-1">
                        {r.cells.flat().map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2">
                            <Chip p={p} block hit={hits.has(p.id)} showReview={reviewOnly} onSelect={setSelected} />
                            <PhaseBadge phase={p.phase} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      )}

      {selected && (
        <ProgramDetail
          p={selected}
          onClose={() => setSelected(null)}
          onMarkReviewed={async () => {
            const { data, error } = await createClient().from('programs')
              .update({ needs_review: false }).eq('id', selected.id).select().single()
            if (error || !data) return error?.message ?? 'no row returned'
            setPrograms((prev) => prev.map((r) => (r.id === data.id ? (data as Program) : r)))
            // Close on success: reviewing is click chip → mark → next chip, and
            // with the Needs-review filter on, the chip drops off the map.
            setSelected(null)
            return null
          }}
          onEdit={() => {
            const raw = programs.find((x) => x.id === selected.id)
            setSelected(null)
            if (raw) setEditing(raw)
          }}
        />
      )}

      {editing && (
        <ProgramEditModal
          program={editing === 'new' ? null : editing}
          portfolioOptions={portfolioOptions}
          dealOptions={dealOptions}
          indicationSuggestions={indicationSuggestions}
          peers={specialtyPeers}
          onClose={() => setEditing(null)}
          onSaved={(p) => setPrograms((prev) => prev.some((r) => r.id === p.id) ? prev.map((r) => r.id === p.id ? p : r) : [...prev, p])}
          onDeleted={(id) => setPrograms((prev) => prev.filter((r) => r.id !== id))}
        />
      )}
    </div>
  )
}

function Chip({ p, hit, showReview, block = false, onSelect }: { p: MapProgram; hit: boolean; showReview: boolean; block?: boolean; onSelect: (p: MapProgram) => void }) {
  return (
    <button
      onClick={() => onSelect(p)}
      title={`${p.companyLabel} — ${p.intervention} (${p.phase})`}
      className={cn(
        'relative text-left border rounded-md px-1.5 py-0.5 leading-tight transition hover:shadow-sm max-w-full',
        block ? 'flex items-baseline gap-1.5 min-w-0' : 'inline-flex flex-col',
        OWNER_STYLES[p.owner],
        p.status === 'Discontinued' && 'opacity-50 line-through',
        hit && 'ring-2 ring-sky-500 ring-offset-1',
      )}
    >
      <span className={cn('text-xs font-medium truncate', block && 'shrink-0 max-w-[60%]')}>{p.companyLabel}</span>
      <span className={cn('text-[10px] truncate', p.owner === 'portfolio' ? 'text-slate-300' : 'opacity-70')}>{p.intervention}</span>
      {showReview && p.needs_review && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400 ring-1 ring-white" aria-label="Needs review" />}
    </button>
  )
}

function AreaRows({ area, count, children }: { area: string; count: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={MAP_COLUMNS.length + 1} className="bg-slate-100/70 border-b border-slate-200 px-0 py-0">
          {/* Sticky on the inner span: a colSpan cell can't pin itself. */}
          <span className="sticky left-0 inline-block px-4 py-1.5 text-xs font-semibold text-slate-600 uppercase tracking-wide">
            {area} <span className="font-normal text-slate-400 normal-case tracking-normal">· {count} {count === 1 ? 'indication' : 'indications'}</span>
          </span>
        </td>
      </tr>
      {children}
    </>
  )
}

function ProgramDetail({ p, onClose, onEdit, onMarkReviewed }: {
  p: MapProgram
  onClose: () => void
  onEdit: () => void
  /** Resolves to an error message, or null on success. */
  onMarkReviewed: () => Promise<string | null>
}) {
  const [marking, setMarking] = useState(false)
  const [markError, setMarkError] = useState('')
  async function markReviewed() {
    setMarking(true)
    setMarkError('')
    const err = await onMarkReviewed()
    if (err) { setMarkError(`Couldn't mark reviewed: ${err}`); setMarking(false) }
  }
  const rows: [string, React.ReactNode][] = [
    ['Indication', `${p.indication} · ${p.therapeutic_area}`],
    ['Specialty', p.specialty],
    ['Phase', <span key="ph" className="inline-flex items-center gap-1.5"><PhaseBadge phase={p.phase} /><span className="text-xs text-slate-400">{MAP_COLUMNS[phaseColumn(p.phase)].label}</span></span>],
    ['Modality', p.modality],
    ['Mechanism', p.mechanism],
    ['Status', p.status],
    ['Source', p.source],
    ['Notes', p.notes],
  ]
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4 max-md:p-0" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col max-md:max-w-none max-md:h-dvh max-md:rounded-none">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <p className="text-xs text-slate-400">{p.owner === 'external' ? 'Competitor' : OWNER_LABELS[p.owner]}</p>
            <h2 className="text-base font-semibold text-slate-900 truncate">{p.companyLabel}</h2>
            <p className="text-sm text-slate-600">{p.intervention}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition shrink-0"><X className="w-5 h-5" /></button>
        </div>
        <div className="px-5 py-4 space-y-2.5 max-md:flex-1 max-md:overflow-y-auto">
          {p.needs_review && (
            <div className="flex items-center justify-between gap-3 text-xs rounded-lg pl-3 pr-1.5 py-1.5 bg-amber-50 text-amber-800 border border-amber-200">
              <span>Drafted from research — not yet reviewed.</span>
              <button
                onClick={markReviewed}
                disabled={marking}
                className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-amber-300 text-amber-900 font-medium hover:bg-amber-100 transition disabled:opacity-50"
              >
                {marking ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Mark reviewed
              </button>
            </div>
          )}
          {markError && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{markError}</p>
          )}
          {rows.filter(([, v]) => v).map(([label, v]) => (
            <div key={label} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 text-xs text-slate-400 pt-0.5">{label}</span>
              <span className="text-slate-700 min-w-0 break-words">{v}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100 shrink-0">
          {p.href && (
            <Link href={p.href} className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-50 transition">
              <ExternalLink className="w-3.5 h-3.5" /> Open company
            </Link>
          )}
          <div className="flex-1" />
          <button onClick={onEdit} className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition" style={{ backgroundColor: '#023a51' }}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        </div>
      </div>
    </div>
  )
}
