'use client'

import { useState } from 'react'
import { X, Loader2, Trash2 } from 'lucide-react'
import { Catalyst } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { logCatalystActivity } from '@/lib/activity'

const PERIODS = ['1Q', '2Q', '3Q', '4Q', '1H', '2H', 'FY'] as const
const STATUSES = ['Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated'] as const
const PERIOD_END: Record<string, string> = {
  '1Q': '03-31', '2Q': '06-30', '3Q': '09-30', '4Q': '12-31',
  '1H': '06-30', '2H': '12-31', 'FY': '12-31',
}

interface Props {
  catalyst: Catalyst
  onClose: () => void
  onSaved: (c: Catalyst) => void
  onDeleted: (id: string) => void
}

export default function CatalystEditModal({ catalyst, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [periodPart, yearPart] = (catalyst.period ?? '').split(' ')
  const [form, setForm] = useState({
    title: catalyst.title,
    period: PERIODS.includes(periodPart as typeof PERIODS[number]) ? periodPart : '2Q',
    year: yearPart || catalyst.catalyst_date.slice(0, 4),
    status: catalyst.status ?? 'Pending',
    resolved_date: catalyst.resolved_date ?? '',
    notes: catalyst.notes ?? '',
  })

  async function handleSave() {
    if (!form.title.trim()) return
    const year = parseInt(form.year, 10)
    if (!year || year < 2000 || year > 2100) return
    setSaving(true)
    const { data } = await supabase.from('catalysts').update({
      title: form.title.trim(),
      period: `${form.period} ${year}`,
      catalyst_date: `${year}-${PERIOD_END[form.period]}`,
      status: form.status,
      resolved_date: form.resolved_date || null,
      notes: form.notes.trim() || null,
    }).eq('id', catalyst.id).select().single()
    if (data) {
      onSaved(data as Catalyst)
      if (catalyst.status !== form.status) {
        await logCatalystActivity(catalyst.company_name, form.title.trim(), 'Status changed', `${catalyst.status ?? 'Pending'} \u2192 ${form.status}`)
      }
      onClose()
    } else {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('catalysts').delete().eq('id', catalyst.id)
    await logCatalystActivity(catalyst.company_name, catalyst.title, 'Catalyst deleted', catalyst.period)
    onDeleted(catalyst.id)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 truncate">{catalyst.company_name}</h2>
            <p className="text-xs text-slate-400">Edit catalyst</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition shrink-0"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Catalyst</label>
            <input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Expected Timing</label>
              <select value={form.period} onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
                {PERIODS.map((p) => <option key={p} value={p}>{p === 'FY' ? 'Full Year' : p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Year</label>
              <input type="number" min={2000} max={2100} value={form.year} onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white">
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Actual date <span className="text-slate-400">(when it happened — pins to timeline)</span></label>
            <input type="date" value={form.resolved_date} onChange={(e) => setForm((p) => ({ ...p, resolved_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none" />
          </div>
        </div>

        <div className="flex items-center gap-2 px-5 py-4 border-t border-slate-100">
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition disabled:opacity-50">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            Delete
          </button>
          <div className="flex-1" />
          <button onClick={onClose} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
          <button onClick={handleSave} disabled={saving || !form.title.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition" style={{ backgroundColor: '#023a51' }}>
            {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
