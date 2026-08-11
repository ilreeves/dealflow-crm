'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Trash2, Loader2, ExternalLink, ChevronRight, ChevronDown, FlaskConical, BookOpen, RefreshCw } from 'lucide-react'
import { CompanyCompetitor } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'

interface Props {
  entityType: 'deal' | 'portfolio'
  entityId: string
}

interface Trial { nctId: string; title: string; status: string; phases: string[]; conditions: string[]; sponsor: string }
interface Pub { pmid: string; title: string; journal: string; year: string; firstAuthor: string; url: string }
type Updates = { loading: boolean; loaded: boolean; error: string; trials: Trial[]; pubs: Pub[] }

function statusColor(status: string): string {
  const s = status.toUpperCase()
  if (s.includes('RECRUIT') || s === 'ACTIVE_NOT_RECRUITING' || s === 'ENROLLING_BY_INVITATION') return 'bg-green-100 text-green-700'
  if (s === 'COMPLETED') return 'bg-blue-100 text-blue-700'
  if (s.includes('TERMINATED') || s.includes('WITHDRAWN') || s.includes('SUSPENDED')) return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-600'
}

function prettyPhase(phases: string[]): string {
  return phases.length ? phases.map((p) => p.replace('PHASE', 'Phase ').replace('NA', 'N/A')).join('/') : ''
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
  const [openId, setOpenId] = useState<string | null>(null)
  const [updates, setUpdates] = useState<Record<string, Updates>>({})

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
  }, [entityType, entityId, supabase])

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

  // Pull this competitor's recent trials + publications on demand (no caching).
  async function loadUpdates(c: CompanyCompetitor, force = false) {
    if (!force && (updates[c.id]?.loaded || updates[c.id]?.loading)) return
    setUpdates((u) => ({ ...u, [c.id]: { loading: true, loaded: false, error: '', trials: [], pubs: [] } }))
    try {
      const res = await fetch('/api/enrichment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lookup: true, name: c.name }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Lookup failed')
      setUpdates((u) => ({ ...u, [c.id]: { loading: false, loaded: true, error: '', trials: json.trials ?? [], pubs: json.publications ?? [] } }))
    } catch (e) {
      setUpdates((u) => ({ ...u, [c.id]: { loading: false, loaded: true, error: e instanceof Error ? e.message : 'Lookup failed', trials: [], pubs: [] } }))
    }
  }

  function toggle(c: CompanyCompetitor) {
    if (openId === c.id) { setOpenId(null); return }
    setOpenId(c.id)
    loadUpdates(c)
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
      <p className="text-xs text-slate-400 mb-2">Competitors you track — expand any to pull its recent trials &amp; publications.</p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((c) => {
            const u = updates[c.id]
            const open = openId === c.id
            return (
              <div key={c.id} className="border border-slate-100 rounded-lg">
                <div className="px-3 py-2 flex items-start justify-between gap-3 group">
                  <button onClick={() => toggle(c)} className="flex items-start gap-1.5 min-w-0 text-left flex-1">
                    {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />}
                    <span className="min-w-0">
                      <span className="text-sm font-medium text-slate-700">{c.name}</span>
                      {c.note && <span className="block text-xs text-slate-500 mt-0.5">{c.note}</span>}
                    </span>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {c.url && (
                      <a href={c.url} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-300 hover:text-slate-600 transition" title="Website"><ExternalLink className="w-3.5 h-3.5" /></a>
                    )}
                    <button onClick={() => remove(c.id)} className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition" title="Remove"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>

                {open && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-50 space-y-3">
                    {u?.loading ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400 py-1"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Pulling updates…</div>
                    ) : u?.error ? (
                      <p className="text-xs text-red-600">{u.error}</p>
                    ) : u?.loaded ? (
                      <>
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600"><FlaskConical className="w-3.5 h-3.5" style={{ color: '#5ba200' }} /> Trials ({u.trials.length})</span>
                            <button onClick={() => loadUpdates(c, true)} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition"><RefreshCw className="w-3 h-3" /> Refresh</button>
                          </div>
                          {u.trials.length === 0 ? (
                            <p className="text-xs text-slate-400">No trials found.</p>
                          ) : (
                            <div className="space-y-1">
                              {u.trials.map((t) => (
                                <div key={t.nctId} className="flex items-start justify-between gap-2">
                                  <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer" className="text-xs text-slate-600 hover:text-slate-900 hover:underline flex-1">
                                    {prettyPhase(t.phases) && <span className="text-slate-400">{prettyPhase(t.phases)} · </span>}{t.title}
                                  </a>
                                  <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusColor(t.status)}`}>{t.status.replace(/_/g, ' ').toLowerCase()}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div>
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-1"><BookOpen className="w-3.5 h-3.5" style={{ color: '#e98925' }} /> Publications ({u.pubs.length})</span>
                          {u.pubs.length === 0 ? (
                            <p className="text-xs text-slate-400">No recent publications found.</p>
                          ) : (
                            <div className="space-y-1">
                              {u.pubs.map((p) => (
                                <a key={p.pmid} href={p.url} target="_blank" rel="noopener noreferrer" className="block text-xs text-slate-600 hover:text-slate-900 hover:underline">
                                  {p.title} <span className="text-slate-400">· {[p.journal, p.year].filter(Boolean).join(' ')}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
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
