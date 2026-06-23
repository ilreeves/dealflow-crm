'use client'

import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Deal, PortfolioCompany, Catalyst } from '@/lib/types'

interface Props {
  deals: Deal[]
  portfolio: PortfolioCompany[]
  catalysts: Catalyst[]
  legacy: string[]
}

const CLOSED = ['Done', 'Failed', 'Terminated']

export default function ReportView({ deals, portfolio, catalysts, legacy }: Props) {
  const [asOf] = useState(() => new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }))
  const legacySet = new Set(legacy)
  const todayStr = new Date().toISOString().slice(0, 10)

  const active = deals.filter((d) => d.stage !== 'Passed' && d.stage !== 'Invested')
  const invested = deals.filter((d) => d.stage === 'Invested')
  const passed = deals.filter((d) => d.stage === 'Passed')
  const activePortfolio = portfolio.filter((p) => !legacySet.has(p.name))

  // Active pipeline grouped by stage (excluding passed/invested)
  const STAGE_ORDER = ['Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet']
  const byStage = STAGE_ORDER.map((s) => ({ stage: s, items: active.filter((d) => d.stage === s) })).filter((g) => g.items.length)

  // Upcoming catalysts (open, not legacy, next 6 months) sorted
  const horizon = new Date(Date.now() + 183 * 86400000).toISOString().slice(0, 10)
  const upcoming = catalysts
    .filter((c) => !legacySet.has(c.company_name) && !CLOSED.includes(c.status ?? 'Pending') && !c.resolved_date && c.catalyst_date <= horizon)
    .sort((a, b) => a.catalyst_date.localeCompare(b.catalyst_date))

  // Recently resolved catalysts (last 6 months)
  const since = new Date(Date.now() - 183 * 86400000).toISOString().slice(0, 10)
  const resolved = catalysts
    .filter((c) => c.resolved_date && c.resolved_date >= since)
    .sort((a, b) => (b.resolved_date ?? '').localeCompare(a.resolved_date ?? ''))

  return (
    <div className="flex flex-col h-full bg-slate-50 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0 print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Report</h1>
          <p className="text-sm text-slate-500">Print-ready summary — use your browser’s &quot;Save as PDF&quot;</p>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg transition"
          style={{ backgroundColor: '#023a51' }}
        >
          <Printer className="w-4 h-4" />
          Print / Save PDF
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto bg-white my-6 p-10 shadow-sm print:my-0 print:shadow-none print:p-0 report-sheet">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Solas BioVentures</h2>
              <p className="text-sm text-slate-500 mt-0.5">Dealflow &amp; Portfolio Report</p>
            </div>
            <p className="text-sm text-slate-500">As of {asOf}</p>
          </div>

          {/* Snapshot */}
          <section className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">Snapshot</h3>
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Active Pipeline', value: active.length },
                { label: 'Invested', value: invested.length },
                { label: 'Portfolio Companies', value: activePortfolio.length },
                { label: 'Passed (all-time)', value: passed.length },
              ].map((s) => (
                <div key={s.label} className="border border-slate-200 rounded-lg px-4 py-3">
                  <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Active pipeline */}
          <section className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">Active Pipeline ({active.length})</h3>
            {byStage.length === 0 ? (
              <p className="text-sm text-slate-400">No active deals.</p>
            ) : byStage.map(({ stage, items }) => (
              <div key={stage} className="mb-3 break-inside-avoid">
                <p className="text-xs font-semibold text-slate-600 mb-1">{stage} ({items.length})</p>
                <table className="w-full text-sm border-collapse">
                  <tbody>
                    {items.sort((a, b) => a.name.localeCompare(b.name)).map((d) => (
                      <tr key={d.id} className="border-b border-slate-100">
                        <td className="py-1 pr-3 font-medium text-slate-800">{d.name}</td>
                        <td className="py-1 px-3 text-slate-500">{d.category ?? ''}</td>
                        <td className="py-1 px-3 text-slate-500">{d.sector ?? ''}</td>
                        <td className="py-1 pl-3 text-slate-500 text-right whitespace-nowrap">{d.current_fundraise ? `Raising ${d.current_fundraise}` : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>

          {/* Portfolio */}
          <section className="mb-8 break-inside-avoid">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">Portfolio Companies ({activePortfolio.length})</h3>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-400 uppercase tracking-wide">
                  <th className="py-1.5 pr-3 font-semibold">Company</th>
                  <th className="py-1.5 px-3 font-semibold">Category</th>
                  <th className="py-1.5 px-3 font-semibold">Clinical Stage</th>
                  <th className="py-1.5 px-3 font-semibold">Series</th>
                  <th className="py-1.5 pl-3 font-semibold">Fund(s)</th>
                </tr>
              </thead>
              <tbody>
                {activePortfolio.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1 pr-3 font-medium text-slate-800">{p.name}</td>
                    <td className="py-1 px-3 text-slate-500">{p.category ?? ''}</td>
                    <td className="py-1 px-3 text-slate-500">{p.clinical_stage ?? ''}</td>
                    <td className="py-1 px-3 text-slate-500">{p.series ?? ''}</td>
                    <td className="py-1 pl-3 text-slate-500">{(p.funds ?? []).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Upcoming catalysts */}
          <section className="mb-8">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">Upcoming Catalysts — next 6 months ({upcoming.length})</h3>
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-400">None.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {upcoming.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 break-inside-avoid">
                      <td className="py-1 pr-3 text-slate-500 whitespace-nowrap w-20">{c.period ?? c.catalyst_date}</td>
                      <td className="py-1 px-3 font-medium text-slate-800 whitespace-nowrap">{c.company_name}</td>
                      <td className="py-1 px-3 text-slate-600">{c.title}</td>
                      <td className="py-1 pl-3 text-slate-400 text-right whitespace-nowrap">{c.status}{c.catalyst_date < todayStr ? ' (overdue)' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {/* Recently resolved */}
          {resolved.length > 0 && (
            <section className="mb-2">
              <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400 mb-3">Recently Resolved — last 6 months ({resolved.length})</h3>
              <table className="w-full text-sm border-collapse">
                <tbody>
                  {resolved.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 break-inside-avoid">
                      <td className="py-1 pr-3 text-slate-500 whitespace-nowrap w-24">{c.resolved_date}</td>
                      <td className="py-1 px-3 font-medium text-slate-800 whitespace-nowrap">{c.company_name}</td>
                      <td className="py-1 px-3 text-slate-600">{c.title}</td>
                      <td className="py-1 pl-3 text-right whitespace-nowrap" style={{ color: c.status === 'Done' ? '#15803d' : c.status === 'Failed' || c.status === 'Terminated' ? '#b91c1c' : '#64748b' }}>{c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <p className="text-xs text-slate-300 mt-8 pt-4 border-t border-slate-100">Confidential · Solas BioVentures · Generated {asOf}</p>
        </div>
      </div>
    </div>
  )
}
