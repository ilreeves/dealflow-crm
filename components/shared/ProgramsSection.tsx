'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Layers, Plus, Loader2, Pencil } from 'lucide-react'
import { Program } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { knownIndications } from '@/lib/programs'
import InfoTip from '@/components/shared/InfoTip'
import ProgramEditModal from '@/components/market/ProgramEditModal'
import PhaseBadge from '@/components/market/PhaseBadge'

interface Props {
  entityType: 'deal' | 'portfolio'
  entityId: string
  entityName: string
}

// A company's development programs (intervention × indication × phase) — the
// rows the Market Map is built from.
export default function ProgramsSection({ entityType, entityId, entityName }: Props) {
  const supabase = createClient()
  const column = entityType === 'portfolio' ? 'company_id' : 'deal_id'
  const [rows, setRows] = useState<Program[]>([])
  const [indications, setIndications] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  // A failed load must not read as "No programs yet".
  const [loadError, setLoadError] = useState('')
  const [editing, setEditing] = useState<Program | 'new' | null>(null)

  useEffect(() => {
    let active = true
    Promise.all([
      supabase.from('programs').select('*').eq(column, entityId).order('created_at', { ascending: true }),
      supabase.from('programs').select('indication'),
    ]).then(([own, all]) => {
      if (!active) return
      setRows((own.data as Program[]) ?? [])
      setIndications(knownIndications((all.data as { indication: string }[]) ?? []))
      setLoadError(own.error ? own.error.message : '')
      setLoading(false)
    })
    return () => { active = false }
  }, [column, entityId, supabase])

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5" /> Programs
          <InfoTip label="About programs" size="xs">
            Each intervention × indication this company is developing, at its current phase. These place the company on the Market Map.
          </InfoTip>
        </p>
        <div className="flex items-center gap-3">
          {rows.length > 0 && (
            <Link href="/market-map" className="text-xs text-slate-400 hover:text-slate-700 transition">Market map →</Link>
          )}
          <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition">
            <Plus className="w-3.5 h-3.5" /> Add program
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : loadError ? (
        <p className="text-xs text-red-600">Couldn&apos;t load programs: {loadError}</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-slate-400">No programs yet — add one to put {entityName} on the market map.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((p) => (
            <button
              key={p.id}
              onClick={() => setEditing(p)}
              className="w-full text-left border border-slate-100 rounded-lg px-3 py-2 flex items-start justify-between gap-3 group hover:border-slate-200 transition"
            >
              <span className="min-w-0">
                <span className={`text-sm font-medium ${p.status === 'Discontinued' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{p.intervention}</span>
                <span className="text-sm text-slate-500"> · {p.indication}</span>
                {p.mechanism && <span className="block text-xs text-slate-400 mt-0.5 truncate">{p.mechanism}</span>}
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                {p.needs_review && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Review</span>}
                <PhaseBadge phase={p.phase} />
                <Pencil className="w-3 h-3 text-slate-300 md:opacity-0 md:group-hover:opacity-100 transition" />
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ProgramEditModal
          program={editing === 'new' ? null : editing}
          fixedOwner={entityType === 'portfolio' ? { kind: 'portfolio', id: entityId } : { kind: 'deal', id: entityId }}
          ownerName={entityName}
          indicationSuggestions={indications}
          onClose={() => setEditing(null)}
          onSaved={(p) => setRows((prev) => prev.some((r) => r.id === p.id) ? prev.map((r) => r.id === p.id ? p : r) : [...prev, p])}
          onDeleted={(id) => setRows((prev) => prev.filter((r) => r.id !== id))}
        />
      )}
    </div>
  )
}
