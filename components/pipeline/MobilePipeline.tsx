'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Deal, DealStage, STAGE_COLORS } from '@/lib/types'
import DealCard from './DealCard'

interface Props {
  stages: DealStage[]
  dealsByStage: Record<DealStage, Deal[]>
  onUpdated: (deal: Deal) => void
  onDeleted: (id: string) => void
  /** Open every section — set while searching, so a match in Passed isn't hidden. */
  expandAll?: boolean
}

// Phones only (PipelineBoard renders it below md). At 375px the desktop board's
// side-by-side stage columns and the seven-column table both had to scroll
// sideways, and the table interleaved the 55 passed deals with the handful of
// live ones. Here each stage is a stacked section of the same cards the board
// uses, empty stages are skipped, and Passed — most of the pipeline by count —
// starts folded so the live deals are what you see first.
export default function MobilePipeline({ stages, dealsByStage, onUpdated, onDeleted, expandAll }: Props) {
  const [open, setOpen] = useState<Set<DealStage>>(() => new Set(stages.filter((s) => s !== 'Passed')))
  // Live stages in pipeline order, Passed last — on the desktop board it's the
  // folded rail on the far left, but stacked vertically it belongs at the end.
  const visible = stages
    .filter((s) => dealsByStage[s].length > 0)
    .sort((a, b) => Number(a === 'Passed') - Number(b === 'Passed'))

  function toggle(stage: DealStage) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) next.delete(stage)
      else next.add(stage)
      return next
    })
  }

  if (!visible.length) {
    return <p className="text-center text-sm text-slate-400 py-12">No deals found</p>
  }

  return (
    <div className="space-y-4">
      {visible.map((stage) => {
        const deals = dealsByStage[stage]
        const colors = STAGE_COLORS[stage]
        const isOpen = expandAll || open.has(stage)
        return (
          <section key={stage}>
            <button
              onClick={() => toggle(stage)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2 py-1 text-left"
            >
              {isOpen
                ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              <span className={`w-2 h-2 rounded-full border shrink-0 ${colors.bg} ${colors.border}`} />
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{stage}</span>
              <span className="text-xs text-slate-400">{deals.length}</span>
            </button>
            {isOpen && (
              <div className="space-y-2 mt-2">
                {/* Passed deals use the one-line card: name, pass date and
                    reason are what matter once a deal is out of play. */}
                {deals.map((deal) => (
                  <DealCard key={deal.id} deal={deal} onUpdated={onUpdated} onDeleted={onDeleted} compact={stage === 'Passed'} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
