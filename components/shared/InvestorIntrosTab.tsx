'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Check } from 'lucide-react'
import { InvestorIntro, InvestorContact, INTRO_STATUSES } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const STATUS_COLORS: Record<string, string> = {
  'Introduced':        'bg-blue-100 text-blue-700',
  'Meeting Scheduled': 'bg-indigo-100 text-indigo-700',
  'In Diligence':      'bg-yellow-100 text-yellow-700',
  'Passed':            'bg-red-100 text-red-700',
  'Invested':          'bg-green-100 text-green-700',
}

interface Props {
  table: 'portfolio_investor_intros' | 'deal_investor_intros'
  fkColumn: 'company_id' | 'deal_id'
  entityId: string
}

export default function InvestorIntrosTab({ table, fkColumn, entityId }: Props) {
  const [intros, setIntros] = useState<InvestorIntro[]>([])
  const [contacts, setContacts] = useState<InvestorContact[]>([])
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ investor_name: '', investor_firm: '', contact_email: '', intro_date: '', status: 'Introduced', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  // Derived, not stored — a setLoading(true) inside the effect would force an extra
  // render pass. Pointing the tab at another entity reads as loading until its rows land.
  const entityKey = `${table}:${fkColumn}:${entityId}`
  const loading = loadedKey !== entityKey

  useEffect(() => {
    let cancelled = false
    supabase.from(table).select('*').eq(fkColumn, entityId)
      .order('intro_date', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return
        setIntros((data as InvestorIntro[]) ?? [])
        setLoadedKey(entityKey)
      })
    supabase.from('investor_contacts').select('*').order('name')
      .then(({ data }) => { if (!cancelled) setContacts((data as InvestorContact[]) ?? []) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, fkColumn, entityId])

  // Typing a name that matches a known investor auto-fills firm + email (only into still-empty fields)
  function handleNameChange(value: string) {
    setForm((p) => {
      const match = contacts.find((c) => c.name.toLowerCase() === value.trim().toLowerCase())
      if (!match) return { ...p, investor_name: value }
      return {
        ...p,
        investor_name: value,
        investor_firm: p.investor_firm || match.firm || '',
        contact_email: p.contact_email || match.contact_email || '',
      }
    })
  }

  // Keep the shared directory growing: add new investors, backfill gaps for known ones
  async function syncContact(name: string, firm: string, email: string) {
    const existing = contacts.find((c) => c.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      const patch: { firm?: string; contact_email?: string } = {}
      if (firm && !existing.firm) patch.firm = firm
      if (email && !existing.contact_email) patch.contact_email = email
      if (!Object.keys(patch).length) return
      const { data } = await supabase.from('investor_contacts').update(patch).eq('id', existing.id).select().single()
      if (data) setContacts((prev) => prev.map((c) => (c.id === existing.id ? (data as InvestorContact) : c)))
    } else {
      const { data } = await supabase.from('investor_contacts').insert({ name, firm: firm || null, contact_email: email || null }).select().single()
      if (data) setContacts((prev) => [...prev, data as InvestorContact].sort((a, b) => a.name.localeCompare(b.name)))
    }
  }

  async function handleAdd() {
    const name = form.investor_name.trim()
    if (!name) return
    setSaving(true)
    setError('')
    const firm = form.investor_firm.trim()
    const email = form.contact_email.trim()
    const { data, error: insErr } = await supabase.from(table).insert({
      [fkColumn]: entityId,
      investor_name: name,
      investor_firm: firm || null,
      contact_email: email || null,
      intro_date: form.intro_date || null,
      status: form.status,
      notes: form.notes.trim() || null,
    }).select().single()
    if (insErr || !data) {
      setError(`Couldn't log intro: ${insErr?.message ?? 'insert failed'}`)
      setSaving(false)
      return
    }
    setIntros((prev) => [data as InvestorIntro, ...prev])
    await syncContact(name, firm, email)
    setForm({ investor_name: '', investor_firm: '', contact_email: '', intro_date: '', status: 'Introduced', notes: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function handleStatusChange(id: string, status: string) {
    const { data, error: updErr } = await supabase.from(table).update({ status }).eq('id', id).select().single()
    if (updErr || !data) { setError(`Couldn't update status: ${updErr?.message ?? 'update failed'}`); return }
    setIntros((prev) => prev.map((i) => (i.id === id ? (data as InvestorIntro) : i)))
  }

  async function handleDelete(id: string) {
    await supabase.from(table).delete().eq('id', id)
    setIntros((prev) => prev.filter((i) => i.id !== id))
  }

  const listId = `investor-directory-${entityId}`

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Introduction
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Log Investor Introduction</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Investor Name *</label>
              <input
                list={listId}
                placeholder="e.g. John Smith"
                value={form.investor_name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <datalist id={listId}>
                {contacts.map((c) => (
                  <option key={c.id} value={c.name}>{c.firm ?? ''}</option>
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Firm</label>
              <input
                placeholder="e.g. Atlas Venture"
                value={form.investor_firm}
                onChange={(e) => setForm((p) => ({ ...p, investor_firm: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((p) => ({ ...p, contact_email: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Intro Date</label>
              <input
                type="date"
                value={form.intro_date}
                onChange={(e) => setForm((p) => ({ ...p, intro_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              {INTRO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.investor_name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
              style={{ backgroundColor: '#023a51' }}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Log Intro
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : intros.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No investor introductions logged yet</p>
      ) : (
        <div className="space-y-2">
          {intros.map((intro) => (
            <div key={intro.id} className="border border-slate-200 rounded-xl px-4 py-3 bg-white group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{intro.investor_name}</span>
                    {intro.investor_firm && <span className="text-xs text-slate-500">{intro.investor_firm}</span>}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[intro.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {intro.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {intro.contact_email && (
                      <a href={`mailto:${intro.contact_email}`} className="text-xs text-blue-600 hover:underline">{intro.contact_email}</a>
                    )}
                    {intro.intro_date && (
                      <span className="text-xs text-slate-400">
                        Introduced {new Date(intro.intro_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {intro.notes && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{intro.notes}</p>}
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {INTRO_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(intro.id, s)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition ${
                          intro.status === s
                            ? `${STATUS_COLORS[s]} border-current`
                            : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {intro.status === s && <Check className="w-2.5 h-2.5" />}
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(intro.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
