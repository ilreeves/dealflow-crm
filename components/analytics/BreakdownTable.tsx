'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'

export interface BreakdownRow {
  label: string
  count: number
  companies: { name: string; stage: string }[]
}

interface Props {
  title: string
  rows: BreakdownRow[]
  max: number
  color: string
}

export default function BreakdownTable({ title, rows, max, color }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div>
      <p className="text-sm font-semibold text-slate-700 mb-3">{title}</p>
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ label, count, companies }) => (
              <>
                <tr
                  key={label}
                  onClick={() => setExpanded(expanded === label ? null : label)}
                  className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50 transition"
                >
                  <td className="px-4 py-2.5 font-medium text-slate-700">
                    <span className="flex items-center gap-1.5">
                      <ChevronRight className={`w-3 h-3 text-slate-300 transition-transform ${expanded === label ? 'rotate-90' : ''}`} />
                      {label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 w-8">{count}</td>
                  <td className="px-4 py-2.5 w-24">
                    <div className="w-full bg-slate-100 rounded-full h-1.5">
                      <div className="h-1.5 rounded-full" style={{ width: `${count / max * 100}%`, backgroundColor: color }} />
                    </div>
                  </td>
                </tr>
                {expanded === label && (
                  <tr key={`${label}-detail`} className="border-b border-slate-50 last:border-0">
                    <td colSpan={3} className="px-4 pb-3 pt-0 bg-slate-50/50">
                      <div className="flex flex-wrap gap-1.5 pl-4.5 pt-2">
                        {companies.map(({ name, stage }) => (
                          <span key={name} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-full text-xs">
                            <span className="font-medium text-slate-700">{name}</span>
                            <span className="text-slate-400">{stage}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
