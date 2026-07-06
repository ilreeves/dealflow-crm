'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus, LayoutList, Columns3, ChevronRight } from 'lucide-react'
import { Deal, DealStage, DEAL_STAGES, STAGE_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { logActivity } from '@/lib/activity'
import { addDealToPortfolio } from '@/lib/portfolio'
import DealCard from './DealCard'
import DealForm from '@/components/deals/DealForm'
import DealsTable from './DealsTable'
import PassReasonModal from '@/components/deals/PassReasonModal'
import DealDetailModal from '@/components/deals/DealDetailModal'

interface Props {
  initialDeals: Deal[]
}

export default function PipelineBoard({ initialDeals }: Props) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals)
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'All' | 'Devices' | 'Drugs'>('All')
  const [collapsedStages, setCollapsedStages] = useState<Set<DealStage>>(new Set(['Passed']))
  const [actorName, setActorName] = useState<string | null>(null)
  const [pendingPass, setPendingPass] = useState<{ id: string; name: string; fromStage: DealStage } | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [openDealId, setOpenDealId] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open')
    if (id) setOpenDealId(id)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('full_name').eq('id', user.id).single()
          .then(({ data }) => setActorName(data?.full_name || user.email || null))
      }
    })
  }, [])

  const effectiveView = isMobile ? 'list' : view
  // Invested deals graduate to Portfolio — keep the stage in data, but drop it from the pipeline view
  const boardStages = DEAL_STAGES.filter((st) => st !== 'Invested')

  const filteredDeals = useMemo(() => {
    const s = search.toLowerCase()
    return deals.filter((d) => {
      const matchesSearch = d.name.toLowerCase().includes(s) ||
        (d.sector?.toLowerCase() ?? '').includes(s) ||
        (d.lead_partner?.toLowerCase() ?? '').includes(s)
      const matchesCategory = category === 'All' || d.category === category
      return matchesSearch && matchesCategory
    })
  }, [deals, search, category])

  const dealsByStage = useMemo(() => DEAL_STAGES.reduce((acc, stage) => {
    acc[stage] = filteredDeals.filter((d) => d.stage === stage).sort((a, b) => a.name.localeCompare(b.name))
    return acc
  }, {} as Record<DealStage, Deal[]>), [filteredDeals])

  const moveDeal = useCallback(async (dealId: string, fromStage: DealStage, newStage: DealStage, passReason?: string) => {
    const deal = deals.find((d) => d.id === dealId)
    if (!deal) return

    const now = new Date().toISOString()
    setDeals((prev) => prev.map((d) => d.id === dealId ? { ...d, stage: newStage, stage_entered_at: now, ...(newStage === 'Passed' ? { pass_reason: passReason ?? null, passed_at: now } : {}) } : d))

    await supabase.from('deals').update({ stage: newStage, stage_entered_at: now, ...(newStage === 'Passed' ? { pass_reason: passReason ?? null, passed_at: now } : {}) }).eq('id', dealId)
    const details = passReason ? `${fromStage} \u2192 ${newStage}: ${passReason}` : `${fromStage} \u2192 ${newStage}`
    await logActivity(dealId, deal.name, 'Stage changed', details, actorName)

    if (newStage === 'Invested') {
      await addDealToPortfolio(supabase, { ...deal, stage: newStage })
      await logActivity(dealId, deal.name, 'Added to portfolio', 'Auto-added on move to Invested', actorName)
    }

    if (passReason) {
      const { data: { user } } = await supabase.auth.getUser()
      await supabase.from('deal_notes').insert({
        deal_id: dealId,
        content: `Passed: ${passReason}`,
        author_id: user?.id ?? null,
        author_name: actorName,
      })
    }
  }, [supabase, deals, actorName])

  const handleDragEnd = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return

    const newStage = destination.droppableId as DealStage
    const deal = deals.find((d) => d.id === draggableId)
    if (!deal) return

    if (newStage === 'Passed') {
      setPendingPass({ id: draggableId, name: deal.name, fromStage: deal.stage })
      return
    }
    moveDeal(draggableId, deal.stage, newStage)
  }, [deals, moveDeal])

  function toggleCollapse(stage: DealStage) {
    setCollapsedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stage)) { next.delete(stage) } else { next.add(stage) }
      return next
    })
  }

  function handleDealCreated(deal: Deal) {
    setDeals((prev) => [deal, ...prev])
    setShowForm(false)
  }

  function handleDealUpdated(updated: Deal) {
    setDeals((prev) => prev.map((d) => d.id === updated.id ? updated : d))
  }

  function handleDealDeleted(id: string) {
    setDeals((prev) => prev.filter((d) => d.id !== id))
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 bg-white border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">{deals.length} deals</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            {(['All', 'Devices', 'Drugs'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                style={category === cat ? {color: '#5ba200'} : {}}
                className={`px-3 py-1 text-sm font-medium rounded-md transition ${
                  category === cat ? 'bg-white shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search deals…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 w-44 sm:w-52"
          />
          {!isMobile && (
            <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setView('board')}
                className={`p-1.5 ${view === 'board' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="Board view"
              >
                <Columns3 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView('list')}
                className={`p-1.5 ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title="List view"
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
          )}
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg transition" style={{backgroundColor: "#e98925"}}
          >
            <Plus className="w-4 h-4" />
            Add Deal
          </button>
        </div>
      </div>

      {/* Board / List */}
      {effectiveView === 'board' ? (
        <div className="flex-1 overflow-x-auto">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 p-4 h-full min-w-max lg:min-w-0">
              {boardStages.map((stage) => {
                const colors = STAGE_COLORS[stage]
                const stageDeals = dealsByStage[stage]
                const isCollapsed = collapsedStages.has(stage)

                if (isCollapsed) {
                  return (
                    <Droppable droppableId={stage} key={stage}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          onClick={() => toggleCollapse(stage)}
                          title={`${stage} (${stageDeals.length})`}
                          className={`flex flex-col items-center justify-between w-10 shrink-0 rounded-xl px-2 py-3 cursor-pointer transition-colors select-none ${
                            snapshot.isDraggingOver ? 'bg-slate-200' : 'bg-slate-100 hover:bg-slate-200'
                          }`}
                        >
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span
                            className="text-xs font-semibold text-slate-500 uppercase tracking-wide"
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                          >
                            {stage}
                          </span>
                          <span className="text-xs font-medium text-slate-400">{stageDeals.length}</span>
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  )
                }

                return (
                  <div key={stage} className="flex flex-col h-full w-72 shrink-0 lg:w-auto lg:flex-1 lg:min-w-[15rem]">
                    <div
                      className="flex items-center justify-between mb-2 px-1 cursor-pointer group"
                      onClick={() => toggleCollapse(stage)}
                      title="Collapse column"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${colors.bg.replace('bg-', 'bg-').replace('-100', '-400')}`} />
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{stage}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-slate-400 font-medium">{stageDeals.length}</span>
                        <ChevronRight className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity rotate-90" />
                      </div>
                    </div>
                    <Droppable droppableId={stage}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`kanban-column flex-1 min-h-0 overflow-y-auto rounded-xl p-2 space-y-2 transition-colors ${
                            snapshot.isDraggingOver ? 'bg-slate-200' : 'bg-slate-100'
                          }`}
                        >
                          {stageDeals.map((deal, index) => (
                            <Draggable key={deal.id} draggableId={deal.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className={snapshot.isDragging ? 'opacity-80 rotate-1' : ''}
                                >
                                  <DealCard
                                    deal={deal}
                                    onUpdated={handleDealUpdated}
                                    onDeleted={handleDealDeleted}
                                    compact={stage === 'Passed'}
                                  />
                                </div>
                              )}
                            </Draggable>
                          ))}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </div>
                )
              })}
            </div>
          </DragDropContext>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-4 md:p-6">
          <DealsTable
            deals={filteredDeals.filter((d) => d.stage !== 'Invested')}
            onUpdated={handleDealUpdated}
            onDeleted={handleDealDeleted}
          />
        </div>
      )}

      {showForm && (
        <DealForm
          onClose={() => setShowForm(false)}
          onSaved={handleDealCreated}
        />
      )}

      {openDealId && deals.find((d) => d.id === openDealId) && (
        <DealDetailModal
          deal={deals.find((d) => d.id === openDealId)!}
          onClose={() => { setOpenDealId(null); window.history.replaceState({}, '', '/') }}
          onUpdated={handleDealUpdated}
          onDeleted={handleDealDeleted}
        />
      )}

      {pendingPass && (
        <PassReasonModal
          dealName={pendingPass.name}
          onConfirm={(reason) => {
            moveDeal(pendingPass.id, pendingPass.fromStage, 'Passed', reason)
            setPendingPass(null)
          }}
          onCancel={() => setPendingPass(null)}
        />
      )}
    </div>
  )
}
