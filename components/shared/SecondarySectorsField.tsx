'use client'

import { X } from 'lucide-react'

// "Also in" sectors under the primary Sector select, as removable chips plus
// an add-select. Options are the same list as the primary, minus what's chosen.
export default function SecondarySectorsField({
  primary,
  value,
  options,
  onChange,
}: {
  primary: string
  value: string[]
  options: readonly string[]
  onChange: (next: string[]) => void
}) {
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
