'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, Loader2, ExternalLink } from 'lucide-react'
import { CompanyCompetitor } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  entityType: 'deal' | 'portfolio'
  entityId: string
}

// Manually-curated competitors — complements the auto ClinicalTrials.gov
// landscape by capturing ones the team knows (incl. stealth/preclinical).
export default function KnownCompetitors({ entityType, entityId }: Props) {
  const supabase = createClient()
  const [rows, setRows] = useState<CompanyCompetitor[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', note: '', url: '' })

  useEffect(() => {
    let active = true
    supabase.from('company_competitors').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!active) return
        setRows((data as CompanyCompetitor[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [entityType, entityId])

  async function add() {
    const name = form.name.trim()
    if (!name) return
    setSaving(true)
    setError('')
    const { data, error: insErr } = await supabase.from('company_competitors').insert({
      entity_type: entityType,
      entity_id: entityId,
      name,
      note: form.note.trim() || null,
      url: form.url.trim() || null,
    }).select().single()
    if (insErr || !data) {
      setError(`Couldn't add competitor: ${insErr?.message ?? 'insert failed'}`)
      setSaving(false)
      return
    }
    setRows((prev) => [...prev, data as CompanyCompetitor])
    setForm({ name: '', note: '', url: '' })
    setAdding(false)
    setSaving(false)
  }

  async function remove(id: string) {
    setError('')
    const { error: delErr } = await supabase.from('company_competitors').delete().eq('id', id)
    if (delErr) { setError(`Couldn't remove: ${delErr.message}`); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5" /> Known Competitors
        </p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition">
            <Plus className="w-3.5 h-3.5" /> Add competitor
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2">Competitors you know of — including stealth or preclinical ones the trial search can&rsquo;t surface.</p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((c) => (
            <div key={c.id} className="border border-slate-100 rounded-lg px-3 py-2 flex items-start justify-between gap-3 group">
              <div className="min-w-0">
                {c.url ? (
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline">
                    {c.name}<ExternalLink className="inline w-3 h-3 ml-1 text-slate-300" />
                  </a>
                ) : (
                  <span className="text-sm font-medium text-slate-700">{c.name}</span>
                )}
                {c.note && <p className="text-xs text-slate-500 mt-0.5">{c.note}</p>}
              </div>
              <button onClick={() => remove(c.id)} className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition shrink-0" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          {rows.length === 0 && !adding && <p className="text-xs text-slate-400">No competitors added yet.</p>}
        </div>
      )}

      {adding && (
        <div className="border border-slate-200 rounded-xl p-3 mt-2 space-y-2 bg-slate-50">
          <input
            autoFocus
            placeholder="Competitor name *"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
          <input
            placeholder="Note (e.g. lead asset, stage) — optional"
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
          <input
            placeholder="Website — optional"
            value={form.url}
            onChange={(e) => setForm((p) => ({ ...p, url: e.target.value }))}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setAdding(false); setForm({ name: '', note: '', url: '' }); setError('') }} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
            <button onClick={add} disabled={saving || !form.name.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition" style={{ backgroundColor: '#023a51' }}>
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
            </button>
          </div>
        </div>
      )}

      {error && !adding && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}
