'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, CalendarDays } from 'lucide-react'
import { Catalyst } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  initialCatalysts: Catalyst[]
  companyNames: string[]
}

export default function CatalystCalendar({ initialCatalysts, companyNames }: Props) {
  const [catalysts, setCatalysts] = useState<Catalyst[]>(initialCatalysts)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ company_name: '', title: '', catalyst_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleAdd() {
    if (!form.company_name.trim() || !form.title.trim() || !form.catalyst_date) return
    setSaving(true)
    const { data } = await supabase.from('catalysts').insert({
      company_name: form.company_name.trim(),
      title: form.title.trim(),
      catalyst_date: form.catalyst_date,
      notes: form.notes.trim() || null,
    }).select().single()
    if (data) {
      setCatalysts((prev) => [...prev, data as Catalyst].sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date)))
      setForm({ company_name: '', title: '', catalyst_date: '', notes: '' })
      setShowForm(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('catalysts').delete().eq('id', id)
    setCatalysts((prev) => prev.filter((c) => c.id !== id))
  }

  const today = new Date().toISOString().slice(0, 10)

  // Group by month
  const groups: { key: string; label: string; items: Catalyst[] }[] = []
  for (const c of catalysts) {
    const d = new Date(c.catalyst_date + 'T00:00:00')
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, label, items: [] }
      groups.push(group)
    }
    group.items.push(c)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Catalyst Calendar</h1>
          <p className="text-sm text-slate-500">{catalysts.filter((c) => c.catalyst_date >= today).length} upcoming</p>
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

      <div className="flex-1 overflow-y-auto px-4 md:px-6 py-6 max-w-3xl">
        {showForm && (
          <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50 mb-6">
            <p className="text-sm font-semibold text-slate-700">New Catalyst</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                <label className="block text-xs text-slate-500 mb-1">Expected Date *</label>
                <input
                  type="date"
                  value={form.catalyst_date}
                  onChange={(e) => setForm((p) => ({ ...p, catalyst_date: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                />
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
                disabled={saving || !form.company_name.trim() || !form.title.trim() || !form.catalyst_date}
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
            <p className="text-sm text-slate-400">No catalysts yet — add data readouts, FDA decisions, fundraise closes, and other key dates.</p>
          </div>
        ) : (
          groups.map(({ key, label, items }) => (
            <div key={key} className="mb-8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{label}</p>
              <div className="space-y-2">
                {items.map((c) => {
                  const isPast = c.catalyst_date < today
                  const d = new Date(c.catalyst_date + 'T00:00:00')
                  return (
                    <div key={c.id} className={`flex items-start gap-4 rounded-xl border px-4 py-3 group transition ${
                      isPast ? 'border-slate-100 bg-slate-50 opacity-60' : 'border-slate-200 bg-white'
                    }`}>
                      <div className="flex flex-col items-center w-10 shrink-0">
                        <span className="text-lg font-bold text-slate-800 leading-none">{d.getDate()}</span>
                        <span className="text-xs text-slate-400 uppercase">{d.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-800">{c.company_name}</span>
                          <span className="text-sm text-slate-600">{c.title}</span>
                        </div>
                        {c.notes && <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{c.notes}</p>}
                      </div>
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
