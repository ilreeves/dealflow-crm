'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Pencil, Check, X, Search } from 'lucide-react'
import { InvestorContact } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

const empty = { name: '', firm: '', contact_email: '' }

export default function InvestorDirectory() {
  const [contacts, setContacts] = useState<InvestorContact[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(empty)
  const [newC, setNewC] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.from('investor_contacts').select('*').order('name')
      .then(({ data }) => { setContacts((data as InvestorContact[]) ?? []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sortByName = (a: InvestorContact, b: InvestorContact) => a.name.localeCompare(b.name)
  const dupMessage = (msg: string) => (/duplicate|unique/i.test(msg) ? 'An investor with that name already exists.' : msg)

  const q = query.trim().toLowerCase()
  const filtered = q
    ? contacts.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.firm ?? '').toLowerCase().includes(q) ||
        (c.contact_email ?? '').toLowerCase().includes(q))
    : contacts

  function startEdit(c: InvestorContact) {
    setEditingId(c.id)
    setDraft({ name: c.name, firm: c.firm ?? '', contact_email: c.contact_email ?? '' })
    setError('')
  }

  async function saveEdit(id: string) {
    const name = draft.name.trim()
    if (!name) return
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('investor_contacts')
      .update({ name, firm: draft.firm.trim() || null, contact_email: draft.contact_email.trim() || null })
      .eq('id', id).select().single()
    if (err) { setError(dupMessage(err.message)); setSaving(false); return }
    setContacts((prev) => prev.map((c) => (c.id === id ? (data as InvestorContact) : c)).sort(sortByName))
    setEditingId(null)
    setSaving(false)
  }

  async function remove(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id))
    await supabase.from('investor_contacts').delete().eq('id', id)
  }

  async function add() {
    const name = newC.name.trim()
    if (!name) return
    setSaving(true)
    setError('')
    const { data, error: err } = await supabase.from('investor_contacts')
      .insert({ name, firm: newC.firm.trim() || null, contact_email: newC.contact_email.trim() || null })
      .select().single()
    if (err) { setError(dupMessage(err.message)); setSaving(false); return }
    setContacts((prev) => [...prev, data as InvestorContact].sort(sortByName))
    setNewC(empty)
    setSaving(false)
  }

  const inputCls = 'w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white'

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Investor Directory</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          The shared list that auto-fills firm &amp; email when you log an investor introduction. Edit or remove entries to keep suggestions clean. Changes here don&apos;t alter intros already logged.
        </p>
        {contacts.length > 0 && (
          <div className="relative mt-3">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${contacts.length} investors…`}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : contacts.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-400">No investors yet.</p>
          <p className="text-xs text-slate-400 mt-1">The list fills in automatically as you log introductions — or add one below.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-400">No matches for “{query}”.</p>
      ) : (
        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {filtered.map((c) => (
            <div key={c.id} className="px-5 py-2.5 hover:bg-slate-50 transition group">
              {editingId === c.id ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <input autoFocus value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Name" className={inputCls} />
                    <input value={draft.firm} onChange={(e) => setDraft((p) => ({ ...p, firm: e.target.value }))} placeholder="Firm" className={inputCls} />
                    <input value={draft.contact_email} onChange={(e) => setDraft((p) => ({ ...p, contact_email: e.target.value }))} placeholder="Email" className={inputCls} />
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => saveEdit(c.id)} disabled={saving || !draft.name.trim()} className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition">
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                    </button>
                    <button onClick={() => { setEditingId(null); setError('') }} className="flex items-center gap-1 px-2.5 py-1 text-xs text-slate-500 hover:text-slate-900 transition"><X className="w-3 h-3" /> Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{c.name}</span>
                      {c.firm && <span className="text-xs text-slate-500">{c.firm}</span>}
                    </div>
                    {c.contact_email && <a href={`mailto:${c.contact_email}`} className="text-xs text-blue-600 hover:underline">{c.contact_email}</a>}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button onClick={() => startEdit(c)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => remove(c.id)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add row */}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <input value={newC.name} onChange={(e) => setNewC((p) => ({ ...p, name: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="Name" className={inputCls} />
          <input value={newC.firm} onChange={(e) => setNewC((p) => ({ ...p, firm: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="Firm" className={inputCls} />
          <input value={newC.contact_email} onChange={(e) => setNewC((p) => ({ ...p, contact_email: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') add() }} placeholder="Email" className={inputCls} />
        </div>
        <div className="flex items-center justify-between gap-2">
          {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
          <button onClick={add} disabled={saving || !newC.name.trim()} className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition shrink-0">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add Investor
          </button>
        </div>
      </div>
    </div>
  )
}
