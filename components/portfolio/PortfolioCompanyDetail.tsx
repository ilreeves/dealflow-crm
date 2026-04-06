'use client'

import { useState, useEffect } from 'react'
import { X, Pencil, Trash2, Plus, Globe, Mail, Building2, DollarSign, Loader2, Check } from 'lucide-react'
import { PortfolioCompany, PortfolioFundraiseRound, PortfolioInvestorIntro, INTRO_STATUSES } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import PortfolioCompanyForm from './PortfolioCompanyForm'

type Tab = 'overview' | 'rounds' | 'intros'

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
    { key: 'rounds', label: 'Fundraise Rounds' },
    { key: 'intros', label: 'Investor Intros' },
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
            {tab === 'rounds' && <FundraiseRoundsTab companyId={company.id} />}
            {tab === 'intros' && <InvestorIntrosTab companyId={company.id} />}
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
    { icon: DollarSign, label: 'Current Valuation', value: company.current_valuation },
    { icon: DollarSign, label: 'Current Fundraising Need', value: company.current_fundraise },
  ]

  return (
    <div className="space-y-6">
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

// ─── Fundraise Rounds Tab ─────────────────────────────────────────────────────
function FundraiseRoundsTab({ companyId }: { companyId: string }) {
  const [rounds, setRounds] = useState<PortfolioFundraiseRound[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ round_name: '', amount: '', date: '', lead_investor: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('portfolio_fundraise_rounds').select('*').eq('company_id', companyId)
      .order('date', { ascending: false })
      .then(({ data }) => { setRounds((data as PortfolioFundraiseRound[]) ?? []); setLoading(false) })
  }, [companyId])

  async function handleAdd() {
    if (!form.round_name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('portfolio_fundraise_rounds').insert({
      company_id: companyId,
      round_name: form.round_name.trim(),
      amount: form.amount || null,
      date: form.date || null,
      lead_investor: form.lead_investor || null,
      notes: form.notes || null,
    }).select().single()
    if (data) {
      setRounds((prev) => [data as PortfolioFundraiseRound, ...prev])
      setForm({ round_name: '', amount: '', date: '', lead_investor: '', notes: '' })
      setShowForm(false)
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('portfolio_fundraise_rounds').delete().eq('id', id)
    setRounds((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Round
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">New Fundraise Round</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Round Name *</label>
              <input
                placeholder="e.g. Series A"
                value={form.round_name}
                onChange={(e) => setForm((p) => ({ ...p, round_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Amount Raised</label>
              <input
                placeholder="e.g. $10M"
                value={form.amount}
                onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Lead Investor</label>
              <input
                placeholder="e.g. Andreessen Horowitz"
                value={form.lead_investor}
                onChange={(e) => setForm((p) => ({ ...p, lead_investor: e.target.value }))}
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
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.round_name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
              style={{backgroundColor: '#023a51'}}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add Round
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : rounds.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No fundraise rounds recorded yet</p>
      ) : (
        <div className="space-y-2">
          {rounds.map((r) => (
            <div key={r.id} className="border border-slate-200 rounded-xl px-4 py-3 bg-white group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{r.round_name}</span>
                    {r.amount && <span className="text-sm text-green-700 font-medium">{r.amount}</span>}
                    {r.date && (
                      <span className="text-xs text-slate-400">
                        {new Date(r.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {r.lead_investor && <p className="text-xs text-slate-500 mt-0.5">Lead: {r.lead_investor}</p>}
                  {r.notes && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{r.notes}</p>}
                </div>
                <button
                  onClick={() => handleDelete(r.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Investor Intros Tab ──────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  'Introduced':        'bg-blue-100 text-blue-700',
  'Meeting Scheduled': 'bg-indigo-100 text-indigo-700',
  'In Diligence':      'bg-yellow-100 text-yellow-700',
  'Passed':            'bg-red-100 text-red-700',
  'Invested':          'bg-green-100 text-green-700',
}

function InvestorIntrosTab({ companyId }: { companyId: string }) {
  const [intros, setIntros] = useState<PortfolioInvestorIntro[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ investor_name: '', investor_firm: '', contact_email: '', intro_date: '', status: 'Introduced', notes: '' })
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('portfolio_investor_intros').select('*').eq('company_id', companyId)
      .order('intro_date', { ascending: false })
      .then(({ data }) => { setIntros((data as PortfolioInvestorIntro[]) ?? []); setLoading(false) })
  }, [companyId])

  async function handleAdd() {
    if (!form.investor_name.trim()) return
    setSaving(true)
    const { data } = await supabase.from('portfolio_investor_intros').insert({
      company_id: companyId,
      investor_name: form.investor_name.trim(),
      investor_firm: form.investor_firm || null,
      contact_email: form.contact_email || null,
      intro_date: form.intro_date || null,
      status: form.status,
      notes: form.notes || null,
    }).select().single()
    if (data) {
      setIntros((prev) => [data as PortfolioInvestorIntro, ...prev])
      setForm({ investor_name: '', investor_firm: '', contact_email: '', intro_date: '', status: 'Introduced', notes: '' })
      setShowForm(false)
    }
    setSaving(false)
  }

  async function handleStatusChange(id: string, status: string) {
    const { data } = await supabase.from('portfolio_investor_intros').update({ status }).eq('id', id).select().single()
    if (data) setIntros((prev) => prev.map((i) => i.id === id ? data as PortfolioInvestorIntro : i))
  }

  async function handleDelete(id: string) {
    await supabase.from('portfolio_investor_intros').delete().eq('id', id)
    setIntros((prev) => prev.filter((i) => i.id !== id))
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition"
        >
          <Plus className="w-3.5 h-3.5" />
          Log Introduction
        </button>
      ) : (
        <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
          <p className="text-sm font-semibold text-slate-700">Log Investor Introduction</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Investor Name *</label>
              <input
                placeholder="e.g. John Smith"
                value={form.investor_name}
                onChange={(e) => setForm((p) => ({ ...p, investor_name: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Firm</label>
              <input
                placeholder="e.g. Atlas Venture"
                value={form.investor_firm}
                onChange={(e) => setForm((p) => ({ ...p, investor_firm: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Contact Email</label>
              <input
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm((p) => ({ ...p, contact_email: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Intro Date</label>
              <input
                type="date"
                value={form.intro_date}
                onChange={(e) => setForm((p) => ({ ...p, intro_date: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              {INTRO_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
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
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
            <button
              onClick={handleAdd}
              disabled={saving || !form.investor_name.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
              style={{backgroundColor: '#023a51'}}
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Log Intro
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : intros.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No investor introductions logged yet</p>
      ) : (
        <div className="space-y-2">
          {intros.map((intro) => (
            <div key={intro.id} className="border border-slate-200 rounded-xl px-4 py-3 bg-white group">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-slate-800">{intro.investor_name}</span>
                    {intro.investor_firm && <span className="text-xs text-slate-500">{intro.investor_firm}</span>}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[intro.status] ?? 'bg-slate-100 text-slate-600'}`}>
                      {intro.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    {intro.contact_email && (
                      <a href={`mailto:${intro.contact_email}`} className="text-xs text-blue-600 hover:underline">{intro.contact_email}</a>
                    )}
                    {intro.intro_date && (
                      <span className="text-xs text-slate-400">
                        Introduced {new Date(intro.intro_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                  {intro.notes && <p className="text-sm text-slate-600 mt-1 leading-relaxed">{intro.notes}</p>}
                  <div className="flex items-center gap-1 mt-2 flex-wrap">
                    {INTRO_STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => handleStatusChange(intro.id, s)}
                        className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition ${
                          intro.status === s
                            ? `${STATUS_COLORS[s]} border-current`
                            : 'border-slate-200 text-slate-400 hover:text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {intro.status === s && <Check className="w-2.5 h-2.5" />}
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(intro.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
