'use client'

import { useState, useEffect } from 'react'
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Opt { id: string; value: string; sort_order: number }

export default function ListManager({ listKey, title, description }: { listKey: string; title: string; description: string }) {
  const [opts, setOpts] = useState<Opt[]>([])
  const [loading, setLoading] = useState(true)
  const [newVal, setNewVal] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('list_options').select('id,value,sort_order').eq('list_key', listKey).order('sort_order')
      .then(({ data }) => { setOpts((data as Opt[]) ?? []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function add() {
    const v = newVal.trim()
    if (!v || opts.some((o) => o.value.toLowerCase() === v.toLowerCase())) { setNewVal(''); return }
    setSaving(true)
    const sort = opts.length ? Math.max(...opts.map((o) => o.sort_order)) + 1 : 0
    const { data } = await supabase.from('list_options').insert({ list_key: listKey, value: v, sort_order: sort }).select().single()
    if (data) setOpts((prev) => [...prev, data as Opt])
    setNewVal(''); setSaving(false)
  }

  async function remove(id: string) {
    setOpts((prev) => prev.filter((o) => o.id !== id))
    await supabase.from('list_options').delete().eq('id', id)
  }

  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir
    if (j < 0 || j >= opts.length) return
    const next = [...opts]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setOpts(next)
    await Promise.all(next.map((o, i) => supabase.from('list_options').update({ sort_order: i }).eq('id', o.id)))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{description}</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {opts.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2 px-5 py-2 group hover:bg-slate-50 transition">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronUp className="w-3 h-3" /></button>
                <button onClick={() => move(i, 1)} disabled={i === opts.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30"><ChevronDown className="w-3 h-3" /></button>
              </div>
              <span className="flex-1 text-sm text-slate-700">{o.value}</span>
              <button onClick={() => remove(o.id)} className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
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
    </div>
  )
}
