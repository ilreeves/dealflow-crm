'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, CalendarDays, Pencil, LayoutList, BarChartHorizontal, Check, X, Bell, ChevronDown } from 'lucide-react'
import { Catalyst } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import CatalystGantt from './CatalystGantt'
import CatalystEditModal from './CatalystEditModal'
import { logCatalystActivity } from '@/lib/activity'

interface Props {
  initialCatalysts: Catalyst[]
  companyNames: string[]
  initialLegacy: string[]
  initialDismissed: string[]
}

const PERIODS = ['1Q', '2Q', '3Q', '4Q', '1H', '2H', 'FY'] as const

const STATUSES = ['Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated'] as const
const STATUS_COLORS: Record<string, string> = {
  'Pending':    'bg-yellow-100 text-yellow-800',
  'On Track':   'bg-emerald-100 text-emerald-700',
  'Done':       'bg-green-100 text-green-700',
  'Delayed':    'bg-orange-100 text-orange-700',
  'On Hold':    'bg-slate-200 text-slate-600',
  'Failed':     'bg-red-100 text-red-700',
  'Terminated': 'bg-red-100 text-red-700',
}
const CLOSED_STATUSES = ['Done', 'Failed', 'Terminated']

// End date of each period, for sorting and past-detection
function periodEndDate(period: string, year: number): string {
  switch (period) {
    case '1Q': return `${year}-03-31`
    case '2Q': return `${year}-06-30`
    case '3Q': return `${year}-09-30`
    case '4Q': return `${year}-12-31`
    case '1H': return `${year}-06-30`
    case '2H': return `${year}-12-31`
    default:   return `${year}-12-31`
  }
}

function periodLabel(c: Catalyst): string {
  if (c.period) return c.period.split(' ')[0]
  // Legacy date-based entries
  const d = new Date(c.catalyst_date + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function CatalystCalendar({ initialCatalysts, companyNames, initialLegacy, initialDismissed }: Props) {
  const [catalysts, setCatalysts] = useState<Catalyst[]>(initialCatalysts)
  const [legacy, setLegacy] = useState<string[]>(initialLegacy)
  const [remindersOpen, setRemindersOpen] = useState(true)
  const [editingCatalyst, setEditingCatalyst] = useState<Catalyst | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set(initialDismissed))

  // Signature ties a dismissal to the catalyst's current timing/status, so it
  // reappears for everyone if the situation changes (rescheduled, status edited).
  const reminderSig = (c: Catalyst) => `${c.id}|${c.catalyst_date}|${c.status ?? 'Pending'}`
  async function dismissReminder(c: Catalyst) {
    const sig = reminderSig(c)
    setDismissed((prev) => new Set(prev).add(sig))
    await supabase.from('dismissed_reminders').upsert({ signature: sig }, { onConflict: 'signature', ignoreDuplicates: true })
  }
  async function clearAllReminders(items: Catalyst[]) {
    const sigs = items.map(reminderSig)
    setDismissed((prev) => { const n = new Set(prev); sigs.forEach((s) => n.add(s)); return n })
    if (sigs.length) await supabase.from('dismissed_reminders').upsert(sigs.map((s) => ({ signature: s })), { onConflict: 'signature', ignoreDuplicates: true })
  }
  const [showForm, setShowForm] = useState(false)
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({ company_name: '', title: '', period: '1Q', year: String(currentYear), status: 'Pending', notes: '' })
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'list' | 'gantt'>('gantt')
  const [editingNote, setEditingNote] = useState<{ id: string; text: string } | null>(null)
  const supabase = createClient()

  async function handleAdd() {
    if (!form.company_name.trim() || !form.title.trim()) return
    const year = parseInt(form.year, 10)
    if (!year || year < 2000 || year > 2100) return
    setSaving(true)
    const { data } = await supabase.from('catalysts').insert({
      company_name: form.company_name.trim(),
      title: form.title.trim(),
      catalyst_date: periodEndDate(form.period, year),
      period: `${form.period} ${year}`,
      original_date: periodEndDate(form.period, year),
      original_period: `${form.period} ${year}`,
      status: form.status,
      notes: form.notes.trim() || null,
    }).select().single()
    if (data) {
      setCatalysts((prev) => [...prev, data as Catalyst].sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date)))
      await logCatalystActivity(form.company_name.trim(), form.title.trim(), 'Catalyst added', `${form.period} ${year}`)
      setForm({ company_name: '', title: '', period: '1Q', year: String(currentYear), status: 'Pending', notes: '' })
      setShowForm(false)
    }
    setSaving(false)
  }

  async function toggleLegacy(name: string, makeLegacy: boolean) {
    if (makeLegacy) {
      setLegacy((prev) => [...prev, name])
      await supabase.from('legacy_companies').insert({ company_name: name })
    } else {
      setLegacy((prev) => prev.filter((n) => n !== name))
      await supabase.from('legacy_companies').delete().eq('company_name', name)
    }
  }

  async function handleDelete(id: string) {
    const cat = catalysts.find((c) => c.id === id)
    await supabase.from('catalysts').delete().eq('id', id)
    setCatalysts((prev) => prev.filter((c) => c.id !== id))
    if (cat) await logCatalystActivity(cat.company_name, cat.title, 'Catalyst deleted', cat.period)
  }

  async function handleStatusChange(id: string, status: string) {
    const prev = catalysts.find((c) => c.id === id)
    const { data } = await supabase.from('catalysts').update({ status }).eq('id', id).select().single()
    if (data) {
      setCatalysts((prevList) => prevList.map((c) => c.id === id ? data as Catalyst : c))
      if (prev && prev.status !== status) {
        await logCatalystActivity(prev.company_name, prev.title, 'Status changed', `${prev.status ?? 'Pending'} \u2192 ${status}`)
      }
    }
  }

  async function handleNoteSave() {
    if (!editingNote) return
    const { data } = await supabase.from('catalysts')
      .update({ notes: editingNote.text.trim() || null })
      .eq('id', editingNote.id).select().single()
    if (data) {
      setCatalysts((prev) => prev.map((c) => c.id === editingNote.id ? data as Catalyst : c))
      const cat = data as Catalyst
      await logCatalystActivity(cat.company_name, cat.title, 'Note updated')
    }
    setEditingNote(null)
  }

  // Group by year (list view) — exclude legacy companies entirely
  const legacySet = new Set(legacy)
  // Catalyst reminders: open (non-closed, non-legacy, unresolved) catalysts that are overdue or due soon
  const horizonStr = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10)
  // 30-day grace: a window that just ended isn't "overdue" yet — only flag overdue once it's comfortably past
  const graceStr = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const openForReminders = catalysts.filter(
    (c) => !legacySet.has(c.company_name) && !CLOSED_STATUSES.includes(c.status ?? 'Pending') && c.status !== 'Delayed' && c.status !== 'On Hold' && !c.resolved_date
  )
  const notDismissed = (c: Catalyst) => !dismissed.has(reminderSig(c))
  const overdue = openForReminders.filter((c) => c.catalyst_date < graceStr && notDismissed(c)).sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date))
  const dueSoon = openForReminders.filter((c) => c.catalyst_date >= graceStr && c.catalyst_date <= horizonStr && notDismissed(c)).sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date))
  const groups: { key: string; items: Catalyst[] }[] = []
  for (const c of catalysts) {
    if (legacySet.has(c.company_name)) continue
    const key = c.catalyst_date.slice(0, 4)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, items: [] }
      groups.push(group)
    }
    group.items.push(c)
  }

  return (
    <>
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Catalyst Calendar</h1>
          <p className="text-sm text-slate-500">{catalysts.filter((c) => !legacySet.has(c.company_name) && !CLOSED_STATUSES.includes(c.status ?? 'Pending')).length} open</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setView('list')}
              className={`p-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="List view"
            >
              <LayoutList className="w-4 h-4" />
            </button>
            <button
              onClick={() => setView('gantt')}
              className={`p-1.5 ${view === 'gantt' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
              title="Gantt view"
            >
              <BarChartHorizontal className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg transition"
            style={{ backgroundColor: '#e98925' }}
          >
            <Plus className="w-4 h-4" />
            Add Catalyst
          </button>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto px-4 md:px-6 py-6 ${view === 'list' ? 'max-w-3xl' : ''}`}>
        {(overdue.length > 0 || dueSoon.length > 0) && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 overflow-hidden max-w-3xl">
            <div className="w-full flex items-center gap-2 px-4 py-2.5">
              <button onClick={() => setRemindersOpen((o) => !o)} className="flex items-center gap-2 flex-1 text-left">
                <Bell className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-sm font-semibold text-amber-800">
                  {overdue.length > 0 && `${overdue.length} overdue`}
                  {overdue.length > 0 && dueSoon.length > 0 && ' \u00b7 '}
                  {dueSoon.length > 0 && `${dueSoon.length} due soon`}
                </span>
              </button>
              <button
                onClick={() => clearAllReminders([...overdue, ...dueSoon])}
                className="text-xs font-medium text-amber-700 hover:text-amber-900 hover:underline shrink-0"
              >
                Clear all
              </button>
              <button onClick={() => setRemindersOpen((o) => !o)} className="shrink-0">
                <ChevronDown className={`w-4 h-4 text-amber-600 transition-transform ${remindersOpen ? '' : '-rotate-90'}`} />
              </button>
            </div>
            {remindersOpen && (
              <div className="px-4 pb-3 space-y-1">
                {[...overdue.map((c) => ({ c, kind: 'overdue' as const })), ...dueSoon.map((c) => ({ c, kind: 'soon' as const }))].map(({ c, kind }) => (
                  <div key={c.id} className="group/rem flex items-center gap-2 text-sm rounded-md px-1.5 py-1 hover:bg-amber-100/60 transition">
                    <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${kind === 'overdue' ? 'bg-red-500' : 'bg-amber-500'}`} />
                    <button onClick={() => setEditingCatalyst(c)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      <span className="font-medium text-slate-800 shrink-0">{c.company_name}</span>
                      <span className="text-slate-600 truncate">{c.title}</span>
                      <span className="text-xs text-slate-400 ml-auto shrink-0 whitespace-nowrap">{c.period ?? c.catalyst_date}{kind === 'overdue' ? ' \u2014 overdue' : ''}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismissReminder(c) }}
                      title="Dismiss reminder"
                      className="shrink-0 p-0.5 text-amber-400 hover:text-amber-700 opacity-0 group-hover/rem:opacity-100 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {showForm && (
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50 mb-6">
            <p className="text-sm font-semibold text-slate-700">New Catalyst</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Company *</label>
                <input
                  list="company-names"
                  placeholder="Start typing…"
                  value={form.company_name}
                  onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
                <datalist id="company-names">
                  {companyNames.map((n) => <option key={n} value={n} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Expected Timing *</label>
                <select
                  value={form.period}
                  onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  {PERIODS.map((p) => (
                    <option key={p} value={p}>
                      {p === 'FY' ? 'Full Year' : p}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Year *</label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  value={form.year}
                  onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Catalyst *</label>
              <input
                placeholder="e.g. Phase II topline data, FDA decision, Series B close"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none bg-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
              <button
                onClick={handleAdd}
                disabled={saving || !form.company_name.trim() || !form.title.trim() || !form.year}
                className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
                style={{ backgroundColor: '#023a51' }}
              >
                {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Add
              </button>
            </div>
          </div>
        )}

        {catalysts.length === 0 && !showForm ? (
          <div className="text-center py-16">
            <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No catalysts yet — add data readouts, FDA decisions, fundraise closes, and other key timing.</p>
          </div>
        ) : view === 'gantt' ? (
          <CatalystGantt catalysts={catalysts} onUpdated={(updated) => setCatalysts((prev) => prev.map((x) => x.id === updated.id ? updated : x))} onDeleted={handleDelete} legacyCompanies={legacy} onToggleLegacy={toggleLegacy} />
        ) : (
          groups.map(({ key, items }) => (
            <div key={key} className="mb-8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{key}</p>
              <div className="space-y-2">
                {items.map((c) => {
                  const status = c.status ?? 'Pending'
                  const isClosed = CLOSED_STATUSES.includes(status)
                  return (
                    <div key={c.id} className={`flex items-start gap-4 rounded-xl border px-4 py-3 group transition ${
                      isClosed ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex flex-col items-center justify-center w-12 h-8 rounded-lg bg-slate-100 shrink-0 mt-0.5" title={c.resolved_date ? `Resolved ${c.resolved_date}` : undefined}>
                        <span className="text-xs font-bold text-slate-600">
                          {c.resolved_date
                            ? new Date(c.resolved_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : periodLabel(c)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{c.company_name}</span>
                          <span className="text-sm text-slate-600">{c.title}</span>
                          <select
                            value={status}
                            onChange={(e) => handleStatusChange(c.id, e.target.value)}
                            className={`text-xs font-medium px-1.5 py-0.5 rounded-full border-0 cursor-pointer appearance-none ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}
                          >
                            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        {editingNote?.id === c.id ? (
                          <div className="flex items-start gap-1.5 mt-1.5">
                            <textarea
                              autoFocus
                              rows={2}
                              value={editingNote.text}
                              onChange={(e) => setEditingNote({ id: c.id, text: e.target.value })}
                              className="flex-1 px-2.5 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
                            />
                            <button onClick={handleNoteSave} className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition" title="Save note">
                              <Check className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingNote(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          c.notes && <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{c.notes}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button
                          onClick={() => setEditingNote({ id: c.id, text: c.notes ?? '' })}
                          className="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
                          title={c.notes ? 'Edit note' : 'Add note'}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>

    {editingCatalyst && (
      <CatalystEditModal
        catalyst={editingCatalyst}
        onClose={() => setEditingCatalyst(null)}
        onSaved={(u) => setCatalysts((prev) => prev.map((x) => x.id === u.id ? u : x))}
        onDeleted={(id) => setCatalysts((prev) => prev.filter((x) => x.id !== id))}
      />
    )}
    </>
  )
}
