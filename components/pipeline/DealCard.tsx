'use client'

import { useState, memo } from 'react'
import { Deal, STAGE_COLORS } from '@/lib/types'
import { Building2, User, DollarSign, FlaskConical } from 'lucide-react'
import DealDetailModal from '@/components/deals/DealDetailModal'

interface Props {
  deal: Deal
  onUpdated: (deal: Deal) => void
  onDeleted: (id: string) => void
  compact?: boolean
}

function getAgingText(stageEnteredAt: string | null): string | null {
  if (!stageEnteredAt) return null
  const days = Math.floor((Date.now() - new Date(stageEnteredAt).getTime()) / (1000 * 60 * 60 * 24))
  if (days === 0) return 'today'
  if (days < 14) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 8) return `${weeks}w`
  return `${Math.floor(days / 30)}mo`
}

function DealCard({ deal, onUpdated, onDeleted, compact }: Props) {
  const [showDetail, setShowDetail] = useState(false)
  const aging = getAgingText(deal.stage_entered_at)

  return (
    <>
      {compact ? (
        <div
          onClick={() => setShowDetail(true)}
          className="bg-white rounded-md border border-slate-200 px-2.5 py-1.5 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-800 truncate">{deal.name}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              {aging && <span className="text-xs text-slate-300">{aging}</span>}
              {deal.category && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  deal.category === 'Devices' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {deal.category}
                </span>
              )}
            </div>
          </div>
          {deal.pass_reason && (
            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2" title={deal.pass_reason}>{deal.pass_reason}</p>
          )}
        </div>
      ) : (
        <div
          onClick={() => setShowDetail(true)}
          className="bg-white rounded-lg border border-slate-200 p-3 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all"
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-sm font-semibold text-slate-900 leading-tight flex-1">{deal.name}</h3>
            <div className="flex items-center gap-1.5 shrink-0">
              {aging && <span className="text-xs text-slate-300">{aging}</span>}
              {deal.category && (
                <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                  deal.category === 'Devices' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                }`}>
                  {deal.category}
                </span>
              )}
            </div>
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

// Memoized: the board re-renders on every search keystroke and during drag;
// with stable callbacks this skips re-rendering unaffected cards.
export default memo(DealCard)
