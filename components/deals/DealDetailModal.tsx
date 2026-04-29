'use client'

import { useState } from 'react'
import { X, Pencil, Trash2, Globe, Building2, User, DollarSign, Tag, Mail } from 'lucide-react'
import { Deal, DEAL_STAGES, STAGE_COLORS } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import DealForm from './DealForm'
import FileManager from './FileManager'
import NotesList from './NotesList'
import MeetingsList from './MeetingsList'

type Tab = 'overview' | 'files' | 'notes' | 'meetings'

interface Props {
  deal: Deal
  onClose: () => void
  onUpdated: (deal: Deal) => void
  onDeleted: (id: string) => void
}

export default function DealDetailModal({ deal: initialDeal, onClose, onUpdated, onDeleted }: Props) {
  const [deal, setDeal] = useState(initialDeal)
  const [tab, setTab] = useState<Tab>('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()
  const colors = STAGE_COLORS[deal.stage]

  async function handleStageChange(stage: string) {
    const { data } = await supabase
      .from('deals')
      .update({ stage })
      .eq('id', deal.id)
      .select()
      .single()
    if (data) {
      setDeal(data as Deal)
      onUpdated(data as Deal)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('deals').delete().eq('id', deal.id)
    onDeleted(deal.id)
    onClose()
  }

  function handleUpdated(updated: Deal) {
    setDeal(updated)
    onUpdated(updated)
    setShowEdit(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'meetings', label: 'Meetings' },
    { key: 'files', label: 'Files' },
    { key: 'notes', label: 'Notes' },
  ]

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 truncate">{deal.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                    {deal.stage}
                  </span>
                  {deal.category && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      deal.category === 'Devices' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                    }`}>
                      {deal.category}
                    </span>
                  )}
                  {deal.sector && (
                    <span className="text-xs text-slate-500">{deal.sector}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                  title="Edit deal"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Delete deal"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={onClose}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition ml-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stage changer */}
            <div className="flex items-center gap-1 mt-3 flex-wrap">
              {DEAL_STAGES.map((stage) => {
                const sc = STAGE_COLORS[stage]
                const isActive = deal.stage === stage
                return (
                  <button
                    key={stage}
                    onClick={() => handleStageChange(stage)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition ${
                      isActive
                        ? `${sc.bg} ${sc.text} ring-1 ring-current`
                        : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {stage}
                  </button>
                )
              })}
            </div>

            {/* Tabs */}
            <div className="flex gap-4 mt-4 border-b border-slate-100 -mb-px">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    tab === key
                      ? 'border-slate-900 text-slate-900'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'overview' && <OverviewTab deal={deal} />}
            {tab === 'meetings' && <MeetingsList dealId={deal.id} />}
            {tab === 'files' && <FileManager dealId={deal.id} />}
            {tab === 'notes' && <NotesList dealId={deal.id} />}
          </div>
        </div>
      </div>

      {showEdit && (
        <DealForm deal={deal} onClose={() => setShowEdit(false)} onSaved={handleUpdated} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Delete deal?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete <strong>{deal.name}</strong> and all associated files and notes.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function OverviewTab({ deal }: { deal: Deal }) {
  const fields = [
    { icon: Globe, label: 'Website', value: deal.website, href: deal.website ?? undefined },
    { icon: Mail, label: 'Contact Email', value: deal.contact_email, href: deal.contact_email ? `mailto:${deal.contact_email}` : undefined },
    { icon: Building2, label: 'Sector', value: deal.sector },
    { icon: Tag, label: 'Clinical Stage', value: deal.clinical_stage },
    { icon: User, label: 'Lead Partner', value: deal.lead_partner },
    { icon: User, label: 'Founders', value: deal.founders },
    { icon: Tag, label: 'Source', value: deal.source },
    { icon: Tag, label: 'Series', value: deal.series },
    { icon: DollarSign, label: 'Current Fundraise', value: deal.current_fundraise },
    { icon: DollarSign, label: 'Fundraising to Date', value: deal.fundraising_to_date },
    { icon: DollarSign, label: 'Current Valuation', value: deal.current_valuation },
  ]

  const customEntries = Object.entries(deal.custom_fields ?? {}).filter(([, v]) => v !== null && v !== '')

  return (
    <div className="space-y-6">
      {deal.description && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Description</p>
          <p className="text-sm text-slate-700 leading-relaxed">{deal.description}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Details</p>
        <div className="space-y-2.5">
          {fields.map(({ icon: Icon, label, value, href }) => (
            <div key={label} className="flex items-start gap-3">
              <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-400">{label}</span>
                <div className="text-sm text-slate-700 mt-0.5">
                  {value ? (
                    href ? (
                      <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate block">
                        {value}
                      </a>
                    ) : value
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {customEntries.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Custom Fields</p>
          <div className="space-y-2.5">
            {customEntries.map(([key, value]) => (
              <div key={key} className="flex items-start gap-3">
                <div className="w-4 h-4 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 capitalize">{key.replace(/_/g, ' ')}</span>
                  <div className="text-sm text-slate-700 mt-0.5">
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400">
        Added {formatDate(deal.created_at)} · Last updated {formatDate(deal.updated_at)}
      </p>
    </div>
  )
}
