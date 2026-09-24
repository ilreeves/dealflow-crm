'use client'

import { useState } from 'react'
import { Deal, STAGE_COLORS } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import DealDetailModal from '@/components/deals/DealDetailModal'
import { STICKY_COL, STICKY_TD } from '@/components/shared/Th'

interface Props {
  deals: Deal[]
  onUpdated: (deal: Deal) => void
  onDeleted: (id: string) => void
}

export default function DealsTable({ deals, onUpdated, onDeleted }: Props) {
  const [selected, setSelected] = useState<Deal | null>(null)

  return (
    <>
      {/* Phones: seven columns can't fit, so the table scrolls sideways with the
          company column pinned (and cells kept on one line so rows stay even).
          md+ is unchanged. */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-md:overflow-x-auto">
        <table className="w-full text-sm max-md:whitespace-nowrap">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className={`text-left px-4 py-3 font-medium text-slate-600 ${STICKY_COL} max-md:bg-slate-50`}>Company</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Stage</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Sector</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Check Size</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Lead</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Source</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Added</th>
            </tr>
          </thead>
          <tbody>
            {deals.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-slate-400 py-12">No deals found</td>
              </tr>
            )}
            {deals.map((deal) => {
              const colors = STAGE_COLORS[deal.stage]
              return (
                <tr
                  key={deal.id}
                  onClick={() => setSelected(deal)}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className={`px-4 py-3 font-medium text-slate-900 ${STICKY_TD}`}><span className="max-md:block max-md:max-w-[10rem] max-md:truncate">{deal.name}</span></td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                      {deal.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{deal.sector ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{deal.check_size ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{deal.lead_partner ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{deal.source ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(deal.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <DealDetailModal
          deal={selected}
          onClose={() => setSelected(null)}
          onUpdated={(updated) => { onUpdated(updated); setSelected(updated) }}
          onDeleted={(id) => { onDeleted(id); setSelected(null) }}
        />
      )}
    </>
  )
}
