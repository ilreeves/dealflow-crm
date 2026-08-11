'use client'

import { useMemo, useRef, useState } from 'react'
import { ChevronDown, Archive, RotateCcw } from 'lucide-react'
import { Catalyst } from '@/lib/types'
import { STATUSES, STATUS_BAR, CLOSED_STATUSES, periodEnd } from '@/lib/catalysts'
import { createClient } from '@/lib/supabase/client'
import { logCatalystActivity } from '@/lib/activity'

interface Props {
  catalysts: Catalyst[]
  onUpdated: (c: Catalyst) => void
  onDeleted: (id: string) => void
  /** Failed writes surface here — otherwise a dragged bar snapping back looks like a UI bug. */
  onError?: (msg: string) => void
  legacyCompanies: string[]
  onToggleLegacy: (name: string, makeLegacy: boolean) => void
}

function periodSpan(c: Catalyst): { year: number; startQ: number; span: number } {
  const year = parseInt(c.catalyst_date.slice(0, 4), 10)
  if (c.period) {
    const p = c.period.split(' ')[0]
    switch (p) {
      case '1Q': return { year, startQ: 0, span: 1 }
      case '2Q': return { year, startQ: 1, span: 1 }
      case '3Q': return { year, startQ: 2, span: 1 }
      case '4Q': return { year, startQ: 3, span: 1 }
      case '1H': return { year, startQ: 0, span: 2 }
      case '2H': return { year, startQ: 2, span: 2 }
      default:   return { year, startQ: 0, span: 4 }
    }
  }
  const month = parseInt(c.catalyst_date.slice(5, 7), 10)
  return { year, startQ: Math.floor((month - 1) / 3), span: 1 }
}

// Exact x-position (in quarters, fractional) for a specific date
function dateQuarterPos(dateStr: string, minYear: number): number {
  const d = new Date(dateStr + 'T00:00:00')
  const q = Math.floor(d.getMonth() / 3)
  const qStart = new Date(d.getFullYear(), q * 3, 1)
  const qEnd = new Date(d.getFullYear(), q * 3 + 3, 1)
  const frac = (d.getTime() - qStart.getTime()) / (qEnd.getTime() - qStart.getTime())
  return (d.getFullYear() - minYear) * 4 + q + frac
}

const QUARTER_W = 48
const LABEL_W = 260

export default function CatalystGantt({ catalysts, onUpdated, onDeleted, onError, legacyCompanies, onToggleLegacy }: Props) {
  // Inverted set: companies default to COLLAPSED, including ones added after
  // mount — seeding a collapsed-set from the initial catalysts left any
  // later-added company expanded while everything else was folded.
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  const isCollapsed = (name: string) => !expandedCompanies.has(name)
  const [editingTitle, setEditingTitle] = useState<{ id: string; text: string } | null>(null)
  const [barMenu, setBarMenu] = useState<{ id: string; status: string; date: string } | null>(null)
  // Drag position lives in a ref and is applied as a direct style.transform on
  // the grabbed bar — routing every pointermove through setState re-rendered
  // the entire chart (every company, row, and gridline) dozens of times a
  // second. State only tracks WHICH bar is grabbed, for the ring styling.
  const dragRef = useRef<{ id: string; startX: number; dx: number; moved: boolean; el: HTMLElement } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const supabase = createClient()

  // Must sit above the empty-state early return below — a hook may not be called conditionally.
  const companies = useMemo(() => {
    const out: { name: string; items: Catalyst[] }[] = []
    for (const cat of [...catalysts].sort((a, b) => (a.resolved_date ?? a.catalyst_date).localeCompare(b.resolved_date ?? b.catalyst_date))) {
      let group = out.find((g) => g.name === cat.company_name)
      if (!group) {
        group = { name: cat.company_name, items: [] }
        out.push(group)
      }
      group.items.push(cat)
    }
    out.sort((a, b) => a.name.localeCompare(b.name))
    return out
  }, [catalysts])

  function toggleCompany(name: string) {
    setExpandedCompanies((prev) => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name) } else { next.add(name) }
      return next
    })
  }

  async function saveTitle() {
    if (!editingTitle) return
    const text = editingTitle.text.trim()
    if (text) {
      const { data, error } = await supabase.from('catalysts').update({ title: text }).eq('id', editingTitle.id).select().single()
      if (error || !data) {
        onError?.(`Couldn't rename catalyst: ${error?.message ?? 'update failed'}`)
      } else {
        onUpdated(data as Catalyst)
        const cat = data as Catalyst
        await logCatalystActivity(cat.company_name, text, 'Title edited')
      }
    }
    setEditingTitle(null)
  }

  async function applyBarMenu() {
    if (!barMenu) return
    const prev = catalysts.find((c) => c.id === barMenu.id)
    const { data, error } = await supabase.from('catalysts')
      .update({ status: barMenu.status, resolved_date: barMenu.date || null })
      .eq('id', barMenu.id).select().single()
    if (error || !data) {
      // Menu stays open so the chosen status/date survives a retry.
      onError?.(`Couldn't update catalyst: ${error?.message ?? 'update failed'}`)
      return
    }
    onUpdated(data as Catalyst)
    const cat = data as Catalyst
    if (prev && prev.status !== barMenu.status) {
      await logCatalystActivity(cat.company_name, cat.title, 'Status changed', `${prev.status ?? 'Pending'} \u2192 ${barMenu.status}`)
    }
    if (barMenu.date && prev?.resolved_date !== barMenu.date) {
      await logCatalystActivity(cat.company_name, cat.title, 'Resolved', `Actual date: ${barMenu.date}`)
    }
    setBarMenu(null)
  }

  async function commitMove(cat: Catalyst, shiftQuarters: number, minYr: number, totalQ: number) {
    if (shiftQuarters === 0) return
    const { year, startQ, span } = periodSpan(cat)
    let g = (year - minYr) * 4 + startQ + shiftQuarters
    if (span === 2) g = Math.round(g / 2) * 2
    if (span === 4) g = Math.round(g / 4) * 4
    g = Math.max(0, Math.min(g, totalQ - span))
    const newYear = minYr + Math.floor(g / 4)
    const qIdx = g % 4
    const prefix = span === 4 ? 'FY' : span === 2 ? (qIdx === 0 ? '1H' : '2H') : ['1Q', '2Q', '3Q', '4Q'][qIdx]
    const newEnd = periodEnd(prefix, newYear)
    if (newEnd === cat.catalyst_date && cat.period?.startsWith(prefix)) return

    const status = cat.status ?? 'Pending'
    const movedLater = newEnd > cat.catalyst_date
    const patch: Record<string, string> = { catalyst_date: newEnd, period: `${prefix} ${newYear}` }
    if (movedLater && !CLOSED_STATUSES.includes(status)) patch.status = 'Delayed'

    const { data, error } = await supabase.from('catalysts').update(patch).eq('id', cat.id).select().single()
    if (error || !data) {
      // The bar has already snapped back visually \u2014 say why, or it reads as a UI bug.
      onError?.(`Couldn't reschedule: ${error?.message ?? 'update failed'}`)
      return
    }
    onUpdated(data as Catalyst)
    const action = movedLater ? 'Rescheduled (delayed)' : 'Rescheduled (pulled in)'
    await logCatalystActivity(cat.company_name, cat.title, action, `${cat.period ?? cat.catalyst_date} \u2192 ${prefix} ${newYear}`)
  }

  if (catalysts.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-12">No catalysts to chart.</p>
  }

  const years = catalysts.flatMap((c) => {
    const ys = [parseInt(c.catalyst_date.slice(0, 4), 10)]
    if (c.resolved_date) ys.push(parseInt(c.resolved_date.slice(0, 4), 10))
    return ys
  })
  const minYear = Math.min(...years)
  const maxYear = Math.max(...years)
  const yearCount = maxYear - minYear + 1
  const totalQuarters = yearCount * 4

  const now = new Date()
  const nowQ = (now.getFullYear() - minYear) * 4 + Math.floor(now.getMonth() / 3)

  const legacySet = new Set(legacyCompanies)
  const activeGroups = companies.filter((g) => !legacySet.has(g.name))
  const legacyGroups = companies.filter((g) => legacySet.has(g.name))

  const chartWidth = LABEL_W + totalQuarters * QUARTER_W

  function renderBar(c: Catalyst, mini: boolean) {
    const status = c.status ?? 'Pending'
    const color = STATUS_BAR[status] ?? 'bg-slate-300'
    const tip = `${c.title}\n${c.resolved_date ? 'Resolved ' + c.resolved_date : c.period ?? c.catalyst_date} — ${status}${c.notes ? '\n' + c.notes : ''}`

    if (c.resolved_date) {
      // Fixed point on the timeline
      const pos = dateQuarterPos(c.resolved_date, minYear) * QUARTER_W
      return (
        <div
          key={mini ? c.id : undefined}
          title={tip}
          onClick={mini ? undefined : (e) => { e.stopPropagation(); setBarMenu({ id: c.id, status, date: c.resolved_date ?? '' }) }}
          className={`absolute rounded-full ${color} ${mini ? 'top-2 w-2.5 h-2.5 opacity-60' : 'top-1.5 w-4 h-4 cursor-pointer ring-2 ring-white shadow-sm hover:scale-110 transition-transform'}`}
          style={{ left: pos - (mini ? 5 : 8) }}
        />
      )
    }

    const { year, startQ, span } = periodSpan(c)
    const offset = (year - minYear) * 4 + startQ
    if (mini) {
      return (
        <div
          key={c.id}
          title={tip}
          className={`absolute rounded ${color} top-2 h-3 opacity-60`}
          style={{ left: offset * QUARTER_W + 2, width: span * QUARTER_W - 4 }}
        />
      )
    }
    const isDragging = draggingId === c.id
    return (
      <div
        title={`${tip}\nDrag to reschedule`}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          dragRef.current = { id: c.id, startX: e.clientX, dx: 0, moved: false, el: e.currentTarget as HTMLElement }
          setDraggingId(c.id)
        }}
        onPointerMove={(e) => {
          const d = dragRef.current
          if (d?.id !== c.id) return
          d.dx = e.clientX - d.startX
          d.moved = d.moved || Math.abs(d.dx) > 5
          // Snap live to quarter columns, straight on the element — no render.
          d.el.style.transform = `translateX(${Math.round(d.dx / QUARTER_W) * QUARTER_W}px)`
        }}
        onPointerUp={() => {
          const d = dragRef.current
          if (d?.id !== c.id) return
          dragRef.current = null
          d.el.style.transform = ''
          setDraggingId(null)
          if (!d.moved) {
            setBarMenu({ id: c.id, status, date: '' })
            return
          }
          commitMove(c, Math.round(d.dx / QUARTER_W), minYear, totalQuarters)
        }}
        className={`absolute rounded ${color} top-1 h-5 opacity-90 hover:opacity-100 hover:ring-2 hover:ring-slate-300 touch-none ${
          isDragging ? 'cursor-grabbing ring-2 ring-slate-400 opacity-100 z-10' : 'cursor-grab'
        }`}
        style={{ left: offset * QUARTER_W + 2, width: span * QUARTER_W - 4 }}
      />
    )
  }

  function renderCompany(name: string, items: Catalyst[], isLegacy: boolean) {
    return (
          <div key={name}>
            <div className={`flex items-center border-b border-slate-100 ${isLegacy ? 'bg-slate-100/70' : 'bg-slate-50'}`}>
              <div style={{ width: LABEL_W }} className={`shrink-0 sticky left-0 z-20 border-r border-slate-200 flex items-center group/co ${isLegacy ? 'bg-slate-100/70' : 'bg-slate-50'}`}>
                <button
                  onClick={() => toggleCompany(name)}
                  className="flex-1 min-w-0 px-3 py-1.5 flex items-center gap-1.5 text-left hover:bg-slate-100 transition"
                  title={isCollapsed(name) ? 'Show catalysts' : 'Hide catalysts'}
                >
                  <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${isCollapsed(name) ? '-rotate-90' : ''}`} />
                  <span className={`text-xs font-bold uppercase tracking-wide truncate ${isLegacy ? 'text-slate-400' : 'text-slate-700'}`}>{name}</span>
                  <span className="text-xs text-slate-400 font-medium ml-auto">{items.length}</span>
                </button>
                <button
                  onClick={() => onToggleLegacy(name, !isLegacy)}
                  title={isLegacy ? 'Restore to active' : 'Move to Legacy Companies'}
                  className="px-2 py-1.5 shrink-0 text-slate-300 hover:text-slate-600 opacity-0 group-hover/co:opacity-100 transition"
                >
                  {isLegacy ? <RotateCcw className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                </button>
              </div>
              <div className="flex-1 h-7 relative">
                <GridLines totalQuarters={totalQuarters} nowQ={nowQ} />
                {isCollapsed(name) && !isLegacy && items.map((c) => renderBar(c, true))}
              </div>
            </div>
            {!isCollapsed(name) && items.map((c) => {
              return (
                <div key={c.id} className="flex items-center border-b border-slate-50 hover:bg-slate-50/50 group">
                  {editingTitle?.id === c.id ? (
                    <div style={{ width: LABEL_W }} className="shrink-0 sticky left-0 bg-white z-20 border-r border-slate-200 px-2 py-1">
                      <input
                        autoFocus
                        value={editingTitle.text}
                        onChange={(e) => setEditingTitle({ id: c.id, text: e.target.value })}
                        onBlur={saveTitle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveTitle()
                          if (e.key === 'Escape') setEditingTitle(null)
                        }}
                        className="w-full px-1.5 py-0.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-slate-900"
                      />
                    </div>
                  ) : (
                    <p
                      style={{ width: LABEL_W }}
                      onClick={() => setEditingTitle({ id: c.id, text: c.title })}
                      className="shrink-0 sticky left-0 bg-white z-20 border-r border-slate-200 px-3 py-1.5 text-xs text-slate-600 truncate cursor-text hover:bg-slate-50"
                      title={`${c.title}${c.notes ? ' — ' + c.notes : ''} (click to edit)`}
                    >
                      {c.title}
                    </p>
                  )}
                  <div className="flex-1 h-7 relative">
                    <GridLines totalQuarters={totalQuarters} nowQ={nowQ} />
                    {renderBar(c, false)}
                    {barMenu?.id === c.id && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="absolute top-7 z-50 bg-white border border-slate-200 rounded-xl shadow-lg p-3 w-64"
                        style={{ left: Math.min((periodSpan(c).year - minYear) * 4 * QUARTER_W, totalQuarters * QUARTER_W - 270) }}
                      >
                        <p className="text-xs font-semibold text-slate-700 mb-2">Status</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                          {STATUSES.map((s) => (
                            <button
                              key={s}
                              onClick={() => setBarMenu({ ...barMenu, status: s })}
                              className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                                barMenu.status === s
                                  ? `${STATUS_BAR[s]} text-white`
                                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                              }`}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs font-semibold text-slate-700 mb-1">Actual date <span className="font-normal text-slate-400">(pins to timeline)</span></p>
                        <div className="flex items-center gap-1.5 mb-3">
                          <input
                            type="date"
                            value={barMenu.date}
                            onChange={(e) => setBarMenu({ ...barMenu, date: e.target.value })}
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                          />
                          {barMenu.date && (
                            <button
                              onClick={() => setBarMenu({ ...barMenu, date: '' })}
                              className="text-xs text-slate-400 hover:text-slate-600"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { onDeleted(c.id); setBarMenu(null) }}
                            className="px-2.5 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                          >
                            Delete
                          </button>
                          <div className="flex-1" />
                          <button onClick={() => setBarMenu(null)} className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-800 transition">Cancel</button>
                          <button
                            onClick={applyBarMenu}
                            className="px-2.5 py-1 text-xs text-white font-medium rounded-lg transition"
                            style={{ backgroundColor: '#023a51' }}
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

    )
  }

  return (
    <div className="overflow-auto border border-slate-200 rounded-xl bg-white" style={{ maxHeight: 'calc(100vh - 180px)' }}>
      <div style={{ width: chartWidth, minWidth: chartWidth }}>

        {/* Year + quarter headers */}
        <div className="flex sticky top-0 bg-white z-30 border-b border-slate-200">
          <div style={{ width: LABEL_W }} className="shrink-0 sticky left-0 bg-white z-40 border-r border-slate-200" />
          {Array.from({ length: yearCount }, (_, y) => (
            <div key={y} style={{ width: QUARTER_W * 4 }} className="shrink-0 border-l border-slate-200">
              <p className="text-xs font-semibold text-slate-600 text-center py-1">{minYear + y}</p>
              <div className="flex">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((q) => (
                  <span key={q} style={{ width: QUARTER_W }} className="text-center text-[10px] text-slate-400 pb-1">{q}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {activeGroups.map((g) => renderCompany(g.name, g.items, false))}

        {legacyGroups.length > 0 && (
          <div className="flex items-center bg-slate-100 border-y border-slate-200">
            <div style={{ width: LABEL_W }} className="shrink-0 sticky left-0 z-20 bg-slate-100 px-3 py-2 flex items-center gap-1.5">
              <Archive className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Legacy Companies</span>
              <span className="text-xs text-slate-400 font-medium ml-auto">{legacyGroups.length}</span>
            </div>
            <div className="flex-1 h-9 bg-slate-100" />
          </div>
        )}
        {legacyGroups.map((g) => renderCompany(g.name, g.items, true))}

        {/* Legend */}
        <div className="flex items-center gap-4 py-3 px-3 flex-wrap sticky left-0 bg-white" style={{ width: 'fit-content' }}>
          {Object.entries(STATUS_BAR).map(([label, cls]) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className={`inline-block w-3 h-3 rounded ${cls}`} />
              {label}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="inline-block w-3 h-3 rounded-full bg-slate-400 ring-2 ring-slate-200" />
            Fixed date (resolved)
          </span>
        </div>
      </div>
    </div>
  )
}

function GridLines({ totalQuarters, nowQ }: { totalQuarters: number; nowQ: number }) {
  // Quarter + year lines drawn as a single CSS background instead of one span
  // per quarter (×every row), which is far lighter on large charts.
  return (
    <div className="absolute inset-0 pointer-events-none">
      {nowQ >= 0 && nowQ < totalQuarters && (
        <span className="absolute top-0 bottom-0 bg-blue-50" style={{ left: nowQ * QUARTER_W, width: QUARTER_W }} />
      )}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, #e2e8f0 0, #e2e8f0 1px, transparent 1px, transparent ${QUARTER_W * 4}px), repeating-linear-gradient(to right, #f1f5f9 0, #f1f5f9 1px, transparent 1px, transparent ${QUARTER_W}px)`,
        }}
      />
    </div>
  )
}
