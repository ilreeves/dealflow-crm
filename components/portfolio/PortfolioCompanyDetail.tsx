'use client'

import { useState, useEffect } from 'react'
import { X, Pencil, Trash2, Plus, Globe, Mail, Building2, DollarSign, Loader2, Link, MapPin, Tag } from 'lucide-react'
import { PortfolioCompany, Catalyst } from '@/lib/types'
import { PERIODS, STATUS_COLORS, isClosed, periodEnd } from '@/lib/catalysts'
import { buildDeckEmail } from '@/lib/deck'
import { logCatalystActivity } from '@/lib/activity'
import { gatherEntityCleanup, finishEntityCleanup } from '@/lib/cleanup'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import PortfolioCompanyForm from './PortfolioCompanyForm'
import CapRoundsTab from './CapRoundsTab'
import CapTableTab from './CapTableTab'
import FundraisingTab from './FundraisingTab'
import RevenueTab from './RevenueTab'
import RunwayTab from './RunwayTab'
import { isActive } from '@/lib/runway'
import { useLatestRound } from '@/lib/useLatestRound'
import InvestorIntrosTab from '@/components/shared/InvestorIntrosTab'
import FilesSection from '@/components/shared/FilesSection'
import DecksSection from '@/components/shared/DecksSection'
import ClinicalContextSection from '@/components/shared/ClinicalContextSection'
import KnownCompetitors from '@/components/shared/KnownCompetitors'

type Tab = 'overview' | 'fundraising' | 'rounds' | 'revenue' | 'runway' | 'catalysts' | 'files'

interface Props {
  company: PortfolioCompany
  onClose: () => void
  onUpdated: (c: PortfolioCompany) => void
  onDeleted: (id: string) => void
  /** Open straight onto a tab — the Revenue page links in on 'revenue'. */
  initialTab?: Tab
}

export default function PortfolioCompanyDetail({ company: initial, onClose, onUpdated, onDeleted, initialTab }: Props) {
  const [company, setCompany] = useState(initial)
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview')
  const [showEdit, setShowEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const supabase = createClient()

  async function handleDelete() {
    setDeleting(true)
    setDeleteError('')
    // Snapshot storage paths BEFORE the delete — the cascade destroys the rows
    // that point at them.
    const paths = await gatherEntityCleanup(supabase, 'portfolio', company.id)
    const { error } = await supabase.from('portfolio_companies').delete().eq('id', company.id)
    if (error) {
      setDeleting(false)
      setDeleteError(`Couldn't delete ${company.name}: ${error.message}`)
      return
    }
    // Kills any public share links and removes the orphaned storage objects.
    await finishEntityCleanup(supabase, 'portfolio', company.id, paths)
    onDeleted(company.id)
    onClose()
  }

  function handleUpdated(updated: PortfolioCompany) {
    setCompany(updated)
    onUpdated(updated)
    setShowEdit(false)
  }

  // Most portfolio companies are pre-revenue, so Revenue is opt-in: the tab
  // appears only for companies added to the roster on the Revenue page. Kept
  // visible if it's the tab we were asked to open, so a stale link can't land on
  // a tab that isn't there.
  const showRevenue = !!company.track_revenue || initialTab === 'revenue'
  // Runway applies to any operating company, so unlike Revenue it needs no
  // roster — every Active company gets the tab. A wound-down company has no
  // runway and gets none, but stays reachable when opened deliberately on it,
  // which is how the Runway page's "wound down" list links in — so figures
  // already recorded against a legacy company never become unreachable.
  const showRunway = isActive(company.status) || initialTab === 'runway'
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'fundraising', label: 'Fundraising' },
    { key: 'rounds', label: 'Ownership' },
    ...(showRevenue ? [{ key: 'revenue' as Tab, label: 'Revenue' }] : []),
    ...(showRunway ? [{ key: 'runway' as Tab, label: 'Runway' }] : []),
    { key: 'catalysts', label: 'Catalysts' },
    // Portfolio companies had no document storage at all until August 2026,
    // which meant a company lost the ability to hold a file at exactly the
    // point it starts producing the most of them. Unconditional: unlike Revenue
    // and Runway there is no roster or status that makes documents not apply.
    { key: 'files', label: 'Files' },
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
            {tab === 'fundraising' && (
              <div className="space-y-4">
                <FundraisingTab companyId={company.id} />
                <h3 className="text-sm font-semibold text-slate-700 pt-2 border-t border-slate-100">Investor intros</h3>
                <InvestorIntrosTab table="portfolio_investor_intros" fkColumn="company_id" entityId={company.id} />
              </div>
            )}
            {tab === 'rounds' && (
              <div className="space-y-4">
                <CapRoundsTab companyId={company.id} />
                <CapTableTab company={company} onCompanyUpdated={(c) => { setCompany(c); onUpdated(c) }} />
              </div>
            )}
            {tab === 'revenue' && <RevenueTab companyId={company.id} />}
            {tab === 'runway' && <RunwayTab companyId={company.id} />}
            {tab === 'catalysts' && <CatalystsTab companyId={company.id} companyName={company.name} />}
            {tab === 'files' && <FilesSection entityType="portfolio" entityId={company.id} />}
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
            {deleteError && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">{deleteError}</p>
            )}
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
type OverviewField = { icon: React.ElementType; label: string; value: string | null | undefined; href?: string; hint?: string }

function OverviewTab({ company }: { company: PortfolioCompany }) {
  // Prefer the latest structured round; fall back to the free-text fields when
  // no round has been recorded.
  const latest = useLatestRound('portfolio_fundraise_rounds', 'company_id', company.id)

  const fields: OverviewField[] = [
    { icon: Globe, label: 'Website', value: company.website, href: company.website ?? undefined },
    { icon: Mail, label: 'Contact Email', value: company.contact_email, href: company.contact_email ? `mailto:${company.contact_email}` : undefined },
    { icon: Building2, label: 'Sector', value: company.sector },
    { icon: Tag, label: 'Series', value: company.series },
    { icon: Tag, label: 'Clinical Stage', value: company.clinical_stage },
    { icon: Tag, label: 'Indication', value: company.indication },
    { icon: MapPin, label: 'Location', value: [company.city, company.state, company.country].filter(Boolean).join(', ') || null },
    { icon: DollarSign, label: 'Current Valuation', value: latest?.valuation ?? company.current_valuation, hint: latest?.valuation ? latest.roundName : undefined },
    { icon: DollarSign, label: 'Current Fundraising Need', value: latest?.fundraise ?? company.current_fundraise, hint: latest?.fundraise ? latest.roundName : undefined },
    { icon: Link, label: 'SharePoint', value: company.sharepoint_link, href: company.sharepoint_link ?? undefined },
  ]

  return (
    <div className="space-y-6">
      <DecksSection
        entityType="portfolio"
        entityId={company.id}
        entityName={company.name}
        buildEmail={(deckUrl, label) => buildDeckEmail({
          name: company.name,
          sector: company.sector,
          series: company.series,
          clinicalStage: company.clinical_stage,
          // Prefer the latest fundraising round; fall back to the free-text fields.
          currentRaise: latest?.raiseSummary ?? company.current_fundraise,
          valuation: latest?.valuation ?? company.current_valuation,
          website: company.website,
        }, deckUrl, label)}
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
          {fields.map(({ icon: Icon, label, value, href, hint }) => (
            <div key={label} className="flex items-start gap-3">
              <Icon className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-slate-400">{label}</span>
                {hint && <span className="text-xs text-slate-300 ml-1.5">· {hint}</span>}
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
function CatalystsTab({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [catalysts, setCatalysts] = useState<Catalyst[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const currentYear = new Date().getFullYear()
  const [form, setForm] = useState({ title: '', period: '1Q', year: String(currentYear), notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  useEffect(() => {
    let active = true
    // company_id is the structural link (it survives renames); the name query
    // still catches rows that predate the FK or were never backfilled.
    Promise.all([
      supabase.from('catalysts').select('*').eq('company_id', companyId),
      supabase.from('catalysts').select('*').is('company_id', null).eq('company_name', companyName),
    ]).then(([byId, byName]) => {
      if (!active) return // tab switched away mid-flight
      const rows = [...((byId.data as Catalyst[]) ?? []), ...((byName.data as Catalyst[]) ?? [])]
      setCatalysts(rows.sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date)))
      setLoading(false)
    })
    return () => { active = false }
  }, [companyId, companyName, supabase])

  async function handleAdd() {
    if (!form.title.trim()) return
    const year = parseInt(form.year, 10)
    if (!year || year < 2000 || year > 2100) return
    setSaving(true)
    setError('')
    const dateEnd = periodEnd(form.period, year)
    const { data, error: insErr } = await supabase.from('catalysts').insert({
      company_id: companyId,
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
                {PERIODS.map((p) => (
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
                isPast && isClosed(status) ? 'border-slate-100 bg-slate-50 opacity-70' : 'border-slate-200 bg-white'
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}>
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
