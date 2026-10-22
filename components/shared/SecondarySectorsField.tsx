'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import InfoTip from '@/components/shared/InfoTip'

// "Also in" sectors under the primary Sector select.
//
// A company WITH programs gets them derived — the specialties of its active
// programs, kept in sync by a database trigger (migration_program_specialty.sql)
// — so here they're read-only. A company without programs (most early or
// passed deals) picks them by hand: removable chips plus an add-select.

/** True once we know the entity has at least one program; null while loading or for a new record. */
export function useHasPrograms(column: 'company_id' | 'deal_id', id: string | null | undefined): boolean | null {
  const [has, setHas] = useState<{ id: string; value: boolean } | null>(null)
  useEffect(() => {
    if (!id) return
    let active = true
    createClient().from('programs').select('id', { count: 'exact', head: true }).eq(column, id)
      .then(({ count, error }) => {
        // On error, fall back to manual editing rather than locking the field.
        if (active) setHas({ id, value: !error && (count ?? 0) > 0 })
      })
    return () => { active = false }
  }, [column, id])
  return id && has?.id === id ? has.value : null
}

export default function SecondarySectorsField({
  primary,
  value,
  options,
  onChange,
  derived = false,
}: {
  primary: string
  value: string[]
  options: readonly string[]
  onChange: (next: string[]) => void
  /** Sectors come from the company's programs — show, don't edit. */
  derived?: boolean
}) {
  if (derived) {
    const shown = value.filter((s) => s !== primary)
    return (
      <p className="mt-2 text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
        <span>From programs:</span>
        {shown.length === 0
          ? <span className="text-slate-400">none beyond the primary</span>
          : shown.map((s) => <span key={s} className="px-2.5 py-0.5 bg-slate-100 text-slate-700 rounded-full">{s}</span>)}
        <InfoTip label="About program sectors" size="xs">
          This company has programs, so its additional sectors are the specialties of its active programs. Change a program&apos;s specialty to change them.
        </InfoTip>
      </p>
    )
  }
  const available = options.filter((o) => o !== primary && !value.includes(o))
  return (
    <div className="mt-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {value.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 pl-2.5 pr-1 py-0.5 text-xs bg-slate-100 text-slate-700 rounded-full">
              {s}
              <button type="button" onClick={() => onChange(value.filter((v) => v !== s))} aria-label={`Remove ${s}`} className="p-0.5 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <select
        value=""
        onChange={(e) => { if (e.target.value) onChange([...value, e.target.value]) }}
        disabled={!primary}
        className="w-full px-3 py-2 text-sm border border-dashed border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-slate-500 disabled:opacity-50"
      >
        <option value="">{primary ? '+ Add another sector…' : 'Choose a primary sector first'}</option>
        {available.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}
