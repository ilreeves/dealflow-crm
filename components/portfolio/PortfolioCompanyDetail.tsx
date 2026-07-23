'use client'

import { useState, useEffect } from 'react'
import { X, Pencil, Trash2, Plus, Globe, Mail, Building2, DollarSign, Loader2, Link, MapPin, Tag } from 'lucide-react'
import { PortfolioCompany, Catalyst } from '@/lib/types'
import { logCatalystActivity } from '@/lib/activity'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import PortfolioCompanyForm from './PortfolioCompanyForm'
import CapRoundsTab from './CapRoundsTab'
import InvestorIntrosTab from '@/components/shared/InvestorIntrosTab'
import DecksSection from '@/components/shared/DecksSection'
import ClinicalContextSection from '@/components/shared/ClinicalContextSection'
import KnownCompetitors from '@/components/shared/KnownCompetitors'

type Tab = 'overview' | 'rounds' | 'intros' | 'catalysts'

interface Props {
  company: PortfolioCompany
  onClose: () => void
  onUpdated: (c: PortfolioCompany) => void
  onDeleted: (id: string) => void
}

export default function PortfolioCompanyDetail({ company: initial, onClose, onUpdated, onDeleted }: Props) {
  const [company, setCompany] = useState(initial)
  const [tab, setTab] = useState<Tab>('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  async function handleDelete() {
    setDeleting(true)
    await supabase.from('portfolio_companies').delete().eq('id', company.id)
    onDeleted(company.id)
    onClose()
  }

  function handleUpdated(updated: PortfolioCompany) {
    setCompany(updated)
    onUpdated(updated)
    setShowEdit(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'rounds', label: 'Ownership' },
    { key: 'intros', label: 'Investor Intros' },
    { key: 'catalysts', label: 'Catalysts' },
  ]

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-slate-900 truncate">{company.name}</h2>
                {company.sector && <p className="text-sm text-slate-500 mt-0.5">{company.sector}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowEdit(true)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition ml-1">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex gap-4 mt-4 border-b border-slate-100 -mb-px">
              {tabs.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`pb-2 text-sm font-medium border-b-2 transition ${
                    tab === key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {tab === 'overview' && <OverviewTab company={company} />}
            {tab === 'rounds' && <CapRoundsTab companyId={company.id} />}
            {tab === 'intros' && <InvestorIntrosTab table="portfolio_investor_intros" fkColumn="company_id" entityId={company.id} />}
            {tab === 'catalysts' && <CatalystsTab companyName={company.name} />}
          </div>
        </div>
      </div>

      {showEdit && (
        <PortfolioCompanyForm company={company} onClose={() => setShowEdit(false)} onSaved={handleUpdated} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Delete company?</h3>
            <p className="text-sm text-slate-500 mb-6">
              This will permanently delete <strong>{company.name}</strong> and all associated data.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(false)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition">
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

// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ company }: { company: PortfolioCompany }) {
  const fields = [
    { icon: Globe, label: 'Website', value: company.website, href: company.website ?? undefined },
    { icon: Mail, label: 'Contact Email', value: company.contact_email, href: company.contact_email ? `mailto:${company.contact_email}` : undefined },
    { icon: Building2, label: 'Sector', value: company.sector },
    { icon: Tag, label: 'Series', value: company.series },
    { icon: Tag, label: 'Clinical Stage', value: company.clinical_stage },
    { icon: MapPin, label: 'Location', value: [company.city, company.state, company.country].filter(Boolean).join(', ') || null },
    { icon: DollarSign, label: 'Current Valuation', value: company.current_valuation },
    { icon: DollarSign, label: 'Current Fundraising Need', value: company.current_fundraise },
    { icon: Link, label: 'SharePoint', value: company.sharepoint_link, href: company.sharepoint_link ?? undefined },
  ]

  return (
    <div className="space-y-6">
      <DecksSection
        entityType="portfolio"
        entityId={company.id}
        entityName={company.name}
        buildEmail={(deckUrl, label) => {
          const named = label && label.toLowerCase() !== 'deck'
          const details = [
            company.sector ? `Sector: ${company.sector}` : null,
            company.series ? `Series: ${company.series}` : null,
            company.clinical_stage ? `Clinical stage: ${company.clinical_stage}` : null,
            company.current_fundraise ? `Current raise: ${company.current_fundraise}` : null,
            company.current_valuation ? `Valuation: ${company.current_valuation}` : null,
            company.website ? `Website: ${company.website}` : null,
          ].filter(Boolean) as string[]
          const body = [
            'Hi,',
            '',
            `I wanted to share the ${named ? label + ' ' : ''}non-confidential deck for ${company.name}.`,
            '',
            ...details,
            '',
            `View the deck here: ${deckUrl}`,
            '(link active for 4 weeks)',
            '',
            'Best,',
          ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n')
          return { subject: named ? `${company.name} — ${label} deck` : `${company.name} — non-confidential overview`, body }
        }}
      />
      <ClinicalContextSection entityType="portfolio" entityId={company.id} name={company.name} drugNames={company.drug_names} ctSponsorName={company.ct_sponsor_name} />
      <KnownCompetitors entityType="portfolio" entityId={company.id} />
      {company.description && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Description</p>
          <p className="text-sm text-slate-700 leading-relaxed">{company.description}</p>
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
      <p className="text-xs text-slate-400">Added {formatDate(company.created_at)}</p>
    </div>
  )
}

// ─── Catalysts Tab ────────────────────────────────────────────────────────────
const CATALYST_PERIODS = ['1Q', '2Q', '3Q', '4Q', '1H', '2H', 'FY'] as const

const CATALYST_PERIOD_END: Record<string, string> = {
  '1Q': '03-31', '2Q': '06-30', '3Q': '09-30', '4Q': '12-31',
  '1H': '06-30', '2H': '12-31', 'FY': '12-31',
}

const CATALYST_STATUS_COLORS: Record<string, string> = {
  'Pending':    'bg-yellow-100 text-yellow-800',
  'On Track':   'bg-emerald-100 text-emerald-700',
  'Done':       'bg-green-100 text-green-700',
  'Delayed':    'bg-orange-100 text-orange-700',
  'On Hold':    'bg-slate-200 text-slate-600',
  'Failed':     'bg-red-100 text-red-700',
  'Terminated': 'bg-red-100 text-red-700',
}

function CatalystsTab({ companyName }: { companyName: string }) {
  const [catalysts, setCatalysts] = useState<Catalyst[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({ title: '', period: '1Q', year: String(currentYear), notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    supabase.from('catalysts').select('*').eq('company_name', companyName)
      .order('catalyst_date', { ascending: true })
      .then(({ data }) => { setCatalysts((data as Catalyst[]) ?? []); setLoading(false) })
  }, [companyName])

  async function handleAdd() {
    if (!form.title.trim()) return
    const year = parseInt(form.year, 10)
    if (!year || year < 2000 || year > 2100) return
    setSaving(true)
    setError('')
    const dateEnd = `${year}-${CATALYST_PERIOD_END[form.period]}`
    const { data, error: insErr } = await supabase.from('catalysts').insert({
      company_name: companyName,
      title: form.title.trim(),
      catalyst_date: dateEnd,
      period: `${form.period} ${year}`,
      original_date: dateEnd,
      original_period: `${form.period} ${year}`,
      status: 'Pending',
      notes: form.notes.trim() || null,
    }).select().single()
    if (insErr || !data) {
      setError(`Couldn't add catalyst: ${insErr?.message ?? 'insert failed'}`)
      setSaving(false)
      return
    }
    setCatalysts((prev) => [...prev, data as Catalyst].sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date)))
    await logCatalystActivity(companyName, form.title.trim(), 'Catalyst added', `${form.period} ${year}`)
    setForm({ title: '', period: '1Q', year: String(currentYear), notes: '' })
    setShowForm(false)
    setSaving(false)
  }

  async function handleDeleteCatalyst(cat: Catalyst) {
    await supabase.from('catalysts').delete().eq('id', cat.id)
    setCatalysts((prev) => prev.filter((c) => c.id !== cat.id))
    await logCatalystActivity(cat.company_name, cat.title, 'Catalyst deleted', cat.period)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Catalyst
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">New Catalyst</p>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Catalyst *</label>
            <input
              placeholder="e.g. Phase II topline data, FDA decision, Series B close"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Expected Timing *</label>
              <select
                value={form.period}
                onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                {CATALYST_PERIODS.map((p) => (
                  <option key={p} value={p}>{p === 'FY' ? 'Full Year' : p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Year *</label>
              <input
                type="number"
                min={2000}
                max={2100}
                value={form.year}
                onChange={(e) => setForm((p) => ({ ...p, year: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none bg-white"
            />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.title.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
              style={{backgroundColor: '#023a51'}}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : catalysts.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No catalysts for this company yet</p>
      ) : (
        <div className="space-y-2">
          {catalysts.map((cat) => {
            const status = cat.status ?? 'Pending'
            const isPast = cat.catalyst_date < today
            return (
              <div key={cat.id} className={`border rounded-xl px-4 py-3 group ${
                isPast && ['Done', 'Failed', 'Terminated'].includes(status) ? 'border-slate-100 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-600 shrink-0">
                        {cat.resolved_date
                          ? new Date(cat.resolved_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                          : cat.period ?? cat.catalyst_date}
                      </span>
                      <span className="text-sm font-medium text-slate-800">{cat.title}</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${CATALYST_STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {status}
                      </span>
                    </div>
                    {cat.notes && <p className="text-sm text-slate-500 mt-1 leading-relaxed">{cat.notes}</p>}
                  </div>
                  <button
                    onClick={() => handleDeleteCatalyst(cat)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
