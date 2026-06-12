'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Catalyst } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { logCatalystActivity } from '@/lib/activity'

interface Props {
  catalysts: Catalyst[]
  onUpdated: (c: Catalyst) => void
  onDeleted: (id: string) => void
}

const STATUSES = ['Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated'] as const

const STATUS_BAR: Record<string, string> = {
  'Pending':    'bg-yellow-400',
  'On Track':   'bg-emerald-500',
  'Done':       'bg-green-500',
  'Delayed':    'bg-orange-500',
  'On Hold':    'bg-slate-400',
  'Failed':     'bg-red-500',
  'Terminated': 'bg-red-700',
}

const CLOSED_STATUSES = ['Done', 'Failed', 'Terminated']

const PERIOD_END: Record<string, string> = {
  '1Q': '03-31', '2Q': '06-30', '3Q': '09-30', '4Q': '12-31',
  '1H': '06-30', '2H': '12-31', 'FY': '12-31',
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

export default function CatalystGantt({ catalysts, onUpdated, onDeleted }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(catalysts.map((c) => c.company_name))
  )
  const [editingTitle, setEditingTitle] = useState<{ id: string; text: string } | null>(null)
  const [barMenu, setBarMenu] = useState<{ id: string; status: string; date: string } | null>(null)
  const [drag, setDrag] = useState<{ id: string; startX: number; dx: number; moved: boolean } | null>(null)
  const supabase = createClient()

  function toggleCompany(name: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) { next.delete(name) } else { next.add(name) }
      return next
    })
  }

  async function saveTitle() {
    if (!editingTitle) return
    const text = editingTitle.text.trim()
    if (text) {
      const { data } = await supabase.from('catalysts').update({ title: text }).eq('id', editingTitle.id).select().single()
      if (data) {
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
    const { data } = await supabase.from('catalysts')
      .update({ status: barMenu.status, resolved_date: barMenu.date || null })
      .eq('id', barMenu.id).select().single()
    if (data) {
      onUpdated(data as Catalyst)
      const cat = data as Catalyst
      if (prev && prev.status !== barMenu.status) {
        await logCatalystActivity(cat.company_name, cat.title, 'Status changed', `${prev.status ?? 'Pending'} \u2192 ${barMenu.status}`)
      }
      if (barMenu.date && prev?.resolved_date !== barMenu.date) {
        await logCatalystActivity(cat.company_name, cat.title, 'Resolved', `Actual date: ${barMenu.date}`)
      }
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
    const newEnd = `${newYear}-${PERIOD_END[prefix]}`
    if (newEnd === cat.catalyst_date && cat.period?.startsWith(prefix)) return

    const status = cat.status ?? 'Pending'
    const movedLater = newEnd > cat.catalyst_date
    const patch: Record<string, string> = { catalyst_date: newEnd, period: `${prefix} ${newYear}` }
    if (movedLater && !CLOSED_STATUSES.includes(status)) patch.status = 'Delayed'

    const { data } = await supabase.from('catalysts').update(patch).eq('id', cat.id).select().single()
    if (data) {
      onUpdated(data as Catalyst)
      const action = movedLater ? 'Rescheduled (delayed)' : 'Rescheduled (pulled in)'
      await logCatalystActivity(cat.company_name, cat.title, action, `${cat.period ?? cat.catalyst_date} \u2192 ${prefix} ${newYear}`)
    }
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

  const companies: { name: string; items: Catalyst[] }[] = []
  for (const c of [...catalysts].sort((a, b) => (a.resolved_date ?? a.catalyst_date).localeCompare(b.resolved_date ?? b.catalyst_date))) {
    let group = companies.find((g) => g.name === c.company_name)
    if (!group) {
      group = { name: c.company_name, items: [] }
      companies.push(group)
    }
    group.items.push(c)
  }
  companies.sort((a, b) => a.name.localeCompare(b.name))

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
    const isDragging = drag?.id === c.id
    const snappedDx = isDragging ? Math.round(drag.dx / QUARTER_W) * QUARTER_W : 0
    return (
      <div
        title={`${tip}\nDrag to reschedule`}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          setDrag({ id: c.id, startX: e.clientX, dx: 0, moved: false })
        }}
        onPointerMove={(e) => {
          if (drag?.id !== c.id) return
          const dx = e.clientX - drag.startX
          setDrag({ ...drag, dx, moved: drag.moved || Math.abs(dx) > 5 })
        }}
        onPointerUp={() => {
          if (drag?.id !== c.id) return
          const d = drag
          setDrag(null)
          if (!d.moved) {
            setBarMenu({ id: c.id, status, date: '' })
            return
          }
          commitMove(c, Math.round(d.dx / QUARTER_W), minYear, totalQuarters)
        }}
        className={`absolute rounded ${color} top-1 h-5 opacity-90 hover:opacity-100 hover:ring-2 hover:ring-slate-300 touch-none ${
          isDragging ? 'cursor-grabbing ring-2 ring-slate-400 opacity-100 z-10' : 'cursor-grab'
        }`}
        style={{ left: offset * QUARTER_W + 2 + snappedDx, width: span * QUARTER_W - 4 }}
      />
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
        {companies.map(({ name, items }) => (
          <div key={name}>
            <div className="flex items-center bg-slate-50 border-b border-slate-100">
              <button
                onClick={() => toggleCompany(name)}
                style={{ width: LABEL_W }}
                className="shrink-0 sticky left-0 bg-slate-50 z-20 border-r border-slate-200 px-3 py-1.5 flex items-center gap-1.5 text-left hover:bg-slate-100 transition"
                title={collapsed.has(name) ? 'Show catalysts' : 'Hide catalysts'}
              >
                <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${collapsed.has(name) ? '-rotate-90' : ''}`} />
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">{name}</span>
                <span className="text-xs text-slate-400 font-medium ml-auto">{items.length}</span>
              </button>
              <div className="flex-1 h-7 relative">
                <GridLines totalQuarters={totalQuarters} nowQ={nowQ} />
                {collapsed.has(name) && items.map((c) => renderBar(c, true))}
              </div>
            </div>
            {!collapsed.has(name) && items.map((c) => {
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
        ))}

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
  return (
    <div className="absolute inset-0 flex pointer-events-none">
      {Array.from({ length: totalQuarters }, (_, i) => (
        <span
          key={i}
          style={{ width: QUARTER_W }}
          className={`shrink-0 h-full ${i % 4 === 0 ? 'border-l border-slate-200' : 'border-l border-slate-100'} ${
            i === nowQ ? 'bg-blue-50' : ''
          }`}
        />
      ))}
    </div>
  )
}
