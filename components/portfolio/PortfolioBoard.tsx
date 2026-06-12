'use client'

import { useState } from 'react'
import { Plus, Search, Globe, DollarSign, Building2, Mail } from 'lucide-react'
import { PortfolioCompany } from '@/lib/types'
import PortfolioCompanyForm from './PortfolioCompanyForm'
import PortfolioCompanyDetail from './PortfolioCompanyDetail'

interface Props {
  initialCompanies: PortfolioCompany[]
}

export default function PortfolioBoard({ initialCompanies }: Props) {
  const [companies, setCompanies] = useState(initialCompanies)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<PortfolioCompany | null>(null)
  const [groupBy, setGroupBy] = useState<'fund' | 'series' | 'clinical'>('fund')

  const filtered = companies.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.sector ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const FUND_ORDER = ['Fund I', 'Fund II', 'EHF', 'Solas/Sower', 'SPV']
  const SERIES_ORDER = ['Pre-Seed', 'Seed', 'Convertible Note/SAFE', 'A', 'B', 'C', 'D+']
  const CLINICAL_ORDER = ['Preclinical', 'Pre-IND', 'Phase I', 'Phase II', 'Phase III', 'Pre-IDE', 'FIH', 'Pivotal', '510(k)', 'PMA', 'Approved / Marketed']

  // Build groups; a company can appear in multiple fund groups
  const groups: { label: string; items: PortfolioCompany[] }[] = []
  function addTo(label: string, company: PortfolioCompany) {
    let g = groups.find((x) => x.label === label)
    if (!g) {
      g = { label, items: [] }
      groups.push(g)
    }
    g.items.push(company)
  }
  for (const company of filtered) {
    if (groupBy === 'fund') {
      const funds = company.funds?.length ? company.funds : ['Unassigned']
      for (const f of funds) addTo(f, company)
    } else if (groupBy === 'series') {
      addTo(company.series?.trim() || 'Unknown', company)
    } else {
      addTo(company.clinical_stage?.trim() || 'Unknown', company)
    }
  }
  const order = groupBy === 'fund' ? FUND_ORDER : groupBy === 'series' ? SERIES_ORDER : CLINICAL_ORDER
  groups.sort((a, b) => {
    const ia = order.indexOf(a.label); const ib = order.indexOf(b.label)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.label.localeCompare(b.label)
  })
  for (const g of groups) g.items.sort((a, b) => a.name.localeCompare(b.name))

  function handleSaved(company: PortfolioCompany) {
    setCompanies((prev) => {
      const exists = prev.find((c) => c.id === company.id)
      return exists ? prev.map((c) => c.id === company.id ? company : c) : [company, ...prev]
    })
    setShowForm(false)
  }

  function handleUpdated(company: PortfolioCompany) {
    setCompanies((prev) => prev.map((c) => c.id === company.id ? company : c))
    setSelected(company)
  }

  function handleDeleted(id: string) {
    setCompanies((prev) => prev.filter((c) => c.id !== id))
    setSelected(null)
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Topbar */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Portfolio Companies</h1>
          <p className="text-sm text-slate-500 mt-0.5">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
            {([['fund', 'Fund'], ['series', 'Series'], ['clinical', 'Clinical Stage']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setGroupBy(key)}
                style={groupBy === key ? { color: '#5ba200' } : {}}
                className={`px-3 py-1 text-sm font-medium rounded-md transition ${
                  groupBy === key ? 'bg-white shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 w-52"
            />
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition"
            style={{backgroundColor: '#e98925'}}
          >
            <Plus className="w-4 h-4" />
            Add Company
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-slate-500 font-medium">
              {search ? 'No companies match your search' : 'No portfolio companies yet'}
            </p>
            {!search && (
              <p className="text-slate-400 text-sm mt-1">Add your first portfolio company to get started</p>
            )}
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map(({ label, items }) => (
              <div key={label}>
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-sm font-bold text-slate-700 uppercase tracking-wide">{label}</p>
                  <span className="text-xs text-slate-400 font-medium">{items.length}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map((company) => (
                    <CompanyCard key={`${label}-${company.id}`} company={company} onClick={() => setSelected(company)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <PortfolioCompanyForm onClose={() => setShowForm(false)} onSaved={handleSaved} />
      )}

      {selected && (
        <PortfolioCompanyDetail
          company={selected}
          onClose={() => setSelected(null)}
          onUpdated={handleUpdated}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}

function CompanyCard({ company, onClick }: { company: PortfolioCompany; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 p-4 cursor-pointer hover:shadow-md hover:border-slate-300 transition group"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-900 truncate group-hover:text-[#023a51] transition">{company.name}</h3>
          {company.sector && <p className="text-xs text-slate-500 mt-0.5">{company.sector}</p>}
          {(company.funds?.length ?? 0) > 0 && (
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {company.funds!.map((f) => (
                <span key={f} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide" style={{ backgroundColor: 'rgba(2,58,81,0.08)', color: '#023a51' }}>
                  {f}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{backgroundColor: 'rgba(2,58,81,0.08)'}}>
          <Building2 className="w-4 h-4" style={{color: '#023a51'}} />
        </div>
      </div>

      {company.description && (
        <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mb-3">{company.description}</p>
      )}

      <div className="space-y-1.5">
        {company.current_valuation && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium">Valuation:</span> {company.current_valuation}
          </div>
        )}
        {company.current_fundraise && (
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <DollarSign className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-medium">Raising:</span> {company.current_fundraise}
          </div>
        )}
        {company.website && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            <Globe className="w-3.5 h-3.5 shrink-0" />
            {company.website.replace(/^https?:\/\//, '')}
          </div>
        )}
        {company.contact_email && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 truncate">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            {company.contact_email}
          </div>
        )}
      </div>
    </div>
  )
}
