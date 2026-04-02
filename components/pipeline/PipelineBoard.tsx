'use client'

import { useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Plus, LayoutList, Columns3 } from 'lucide-react'
import { Deal, DealStage, DEAL_STAGES, STAGE_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import DealCard from './DealCard'
import DealForm from '@/components/deals/DealForm'
import DealsTable from './DealsTable'

interface Props {
  initialDeals: Deal[]
}

export default function PipelineBoard({ initialDeals }: Props) {
  const [deals, setDeals] = useState<Deal[]>(initialDeals)
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<'board' | 'list'>('board')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<'All' | 'Devices' | 'Drugs'>('All')
  const supabase = createClient()

  const filteredDeals = deals.filter((d) => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.sector?.toLowerCase() ?? '').includes(search.toLowerCase()) ||
      (d.lead_partner?.toLowerCase() ?? '').includes(search.toLowerCase())
    const matchesCategory = category === 'All' || d.category === category
    return matchesSearch && matchesCategory
  })

  const dealsByStage = DEAL_STAGES.reduce((acc, stage) => {
    acc[stage] = filteredDeals.filter((d) => d.stage === stage)
    return acc
  }, {} as Record<DealStage, Deal[]>)

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result
    if (!destination || destination.droppableId === source.droppableId) return

    const newStage = destination.droppableId as DealStage
    setDeals((prev) => prev.map((d) => d.id === draggableId ? { ...d, stage: newStage } : d))

    await supabase.from('deals').update({ stage: newStage }).eq('id', draggableId)
  }, [supabase])

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
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Pipeline</h1>
          <p className="text-sm text-slate-500">{deals.length} deals</p>
        </div>
        <div className="flex items-center gap-2">
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
            className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 w-52"
          />
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
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg transition" style={{backgroundColor: "#e98925"}}
          >
            <Plus className="w-4 h-4" />
            Add Deal
          </button>
        </div>
      </div>

      {/* Board */}
      {view === 'board' ? (
        <div className="flex-1 overflow-x-auto">
          <DragDropContext onDragEnd={handleDragEnd}>
            <div className="flex gap-3 p-4 h-full min-w-max">
              {DEAL_STAGES.map((stage) => {
                const colors = STAGE_COLORS[stage]
                const stageDeals = dealsByStage[stage]
                return (
                  <div key={stage} className="flex flex-col w-64 shrink-0">
                    <div className="flex items-center justify-between mb-2 px-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${colors.bg.replace('bg-', 'bg-').replace('-100', '-400')}`} />
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{stage}</span>
                      </div>
                      <span className="text-xs text-slate-400 font-medium">{stageDeals.length}</span>
                    </div>
                    <Droppable droppableId={stage}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`kanban-column flex-1 rounded-xl p-2 space-y-2 transition-colors ${
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
        <div className="flex-1 overflow-auto p-6">
          <DealsTable
            deals={filteredDeals}
            onUpdated={handleDealUpdated}
            onDeleted={handleDealDeleted}
          />
        </div>
      )}

      {/* New Deal Modal */}
      {showForm && (
        <DealForm
          onClose={() => setShowForm(false)}
          onSaved={handleDealCreated}
        />
      )}
    </div>
  )
}
