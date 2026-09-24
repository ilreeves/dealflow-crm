'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import InfoTip from '@/components/shared/InfoTip'
import RenameFund from '@/components/settings/RenameFund'

interface Opt { id: string; value: string; sort_order: number }

// A fund rename also rewrites the spv_fund list (and could touch any list the
// page shows), so every ListManager on the page reloads when one fires it.
const LISTS_CHANGED = 'list-options-changed'

export default function ListManager({ listKey, title, description, tip }: { listKey: string; title: string; description: string; tip?: string }) {
  const [opts, setOpts] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  // A failed load must not read as an empty list — adding "missing" options
  // back would duplicate the real ones.
  const [loadError, setLoadError] = useState('')
  const [newVal, setNewVal] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Fund names are copied into positions, tags, holdings and snapshots, so the
  // fund list renames through rename_fund() rather than editing this row alone.
  const [renaming, setRenaming] = useState<string | null>(null)
  const canRename = listKey === 'fund'
  const supabase = createClient()

  useEffect(() => {
    let active = true
    const load = () => {
      supabase.from('list_options').select('id,value,sort_order').eq('list_key', listKey).order('sort_order')
        .then(({ data, error: e }) => {
          if (!active) return
          setOpts((data as Opt[]) ?? [])
          setLoadError(e ? e.message : '')
          setLoading(false)
        })
    }
    load()
    window.addEventListener(LISTS_CHANGED, load)
    return () => { active = false; window.removeEventListener(LISTS_CHANGED, load) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    const v = newVal.trim()
    if (!v || opts.some((o) => o.value.toLowerCase() === v.toLowerCase())) { setNewVal(''); return }
    setSaving(true)
    setError('')
    const sort = opts.length ? Math.max(...opts.map((o) => o.sort_order)) + 1 : 0
    const { data, error: e } = await supabase.from('list_options').insert({ list_key: listKey, value: v, sort_order: sort }).select().single()
    if (e) setError("Couldn't add option: " + e.message)
    else if (data) { setOpts((prev) => [...prev, data as Opt]); setNewVal('') }
    setSaving(false)
  }

  async function remove(id: string) {
    const prev = opts
    setOpts((p) => p.filter((o) => o.id !== id))
    setError('')
    const { error: e } = await supabase.from('list_options').delete().eq('id', id)
    if (e) { setError("Couldn't delete option: " + e.message); setOpts(prev) }
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= opts.length) return
    const a = opts[idx], b = opts[j]
    const prev = opts
    // Swap the two rows' sort_order values instead of renumbering the whole list —
    // two writes per click, and the local copies must carry the swapped values so
    // a follow-up move works from the real DB state.
    const next = [...opts]
    next[idx] = { ...b, sort_order: a.sort_order }
    next[j] = { ...a, sort_order: b.sort_order }
    setOpts(next)
    setError('')
    const [r1, r2] = await Promise.all([
      supabase.from('list_options').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('list_options').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])
    const e = r1.error ?? r2.error
    if (e) { setError("Couldn't reorder: " + e.message); setOpts(prev) }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
          {title}
          {tip && <InfoTip label={`About ${title}`}>{tip}</InfoTip>}
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : loadError ? (
        <p className="px-5 py-6 text-sm text-red-600">Couldn&apos;t load options: {loadError}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {opts.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2 px-5 py-2 group hover:bg-slate-50 transition">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                <button onClick={() => move(i, 1)} disabled={i === opts.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
              </div>
              <span className="flex-1 min-w-0 break-words text-sm text-slate-700">{o.value}</span>
              {canRename && (
                <button onClick={() => setRenaming(o.value)} aria-label={`Rename ${o.value}`} title="Rename everywhere" className="p-1 text-slate-300 hover:text-slate-700 md:opacity-0 md:group-hover:opacity-100 transition"><Pencil className="w-3.5 h-3.5" /></button>
              )}
              <button onClick={() => remove(o.id)} className="p-1 text-slate-300 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="px-5 py-2 text-xs text-red-600 bg-red-50 border-t border-slate-100">{error}</p>}
      <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 bg-slate-50">
        <input
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') add() }}
          placeholder="Add an option…"
          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
        />
        <button onClick={add} disabled={saving || !newVal.trim()} className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Add
        </button>
      </div>
      {renaming != null && (
        <RenameFund
          oldName={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={() => window.dispatchEvent(new Event(LISTS_CHANGED))}
        />
      )}
    </div>
  )
}
