'use client'

import { useState } from 'react'
import { Deal, STAGE_COLORS } from '@/lib/types'
import { Building2, User, DollarSign, FlaskConical } from 'lucide-react'
import DealDetailModal from '@/components/deals/DealDetailModal'

interface Props {
  deal: Deal
  onUpdated: (deal: Deal) => void
  onDeleted: (id: string) => void
  compact?: boolean
}

export default function DealCard({ deal, onUpdated, onDeleted, compact }: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const colors = STAGE_COLORS[deal.stage]

  return (
    <>
      {compact ? (
        <div
          onClick={() => setShowDetail(true)}
          className="flex items-center justify-between gap-2 bg-white rounded-md border border-slate-200 px-2.5 py-1.5 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
        >
          <span className="text-xs font-medium text-slate-800 truncate">{deal.name}</span>
          {deal.category && (
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
              deal.category === 'Devices' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
            }`}>
              {deal.category}
            </span>
          )}
        </div>
      ) : (
        <div
          onClick={() => setShowDetail(true)}
          className="bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-slate-900 leading-tight flex-1">{deal.name}</h3>
            {deal.category && (
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full shrink-0 ${
                deal.category === 'Devices' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
              }`}>
                {deal.category}
              </span>
            )}
          </div>

          {deal.sector && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <Building2 className="w-3 h-3 shrink-0" />
              <span className="truncate">{deal.sector}</span>
            </div>
          )}

          {deal.lead_partner && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <User className="w-3 h-3 shrink-0" />
              <span className="truncate">{deal.lead_partner}</span>
            </div>
          )}

          {deal.current_valuation && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <DollarSign className="w-3 h-3 shrink-0" />
              <span className="truncate">Val: {deal.current_valuation}</span>
            </div>
          )}

          {deal.clinical_stage && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
              <FlaskConical className="w-3 h-3 shrink-0" />
              <span className="truncate">{deal.clinical_stage}</span>
            </div>
          )}

          {deal.current_fundraise && (
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <DollarSign className="w-3 h-3 shrink-0" />
              <span className="truncate">Raising: {deal.current_fundraise}</span>
            </div>
          )}
        </div>
      )}

      {showDetail && (
        <DealDetailModal
          deal={deal}
          onClose={() => setShowDetail(false)}
          onUpdated={onUpdated}
          onDeleted={onDeleted}
        />
      )}
    </>
  )
}
