import { createClient } from '@/lib/supabase/server'
import { Deal } from '@/lib/types'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('deals')
    .select('name,stage,category,source,sector,clinical_stage,series')

  const deals = (data as Deal[]) ?? []
  const total = deals.length
  const passed = deals.filter((d) => d.stage === 'Passed').length
  const active = total - passed

  // Source breakdown
  const sourceMap: Record<string, { total: number; passed: number }> = {}
  for (const d of deals) {
    const key = d.source?.trim() || 'Unknown'
    if (!sourceMap[key]) sourceMap[key] = { total: 0, passed: 0 }
    sourceMap[key].total++
    if (d.stage === 'Passed') sourceMap[key].passed++
  }
  const sources = Object.entries(sourceMap)
    .map(([name, s]) => ({ name, ...s, active: s.total - s.passed }))
    .sort((a, b) => b.total - a.total)
  const maxSourceTotal = Math.max(...sources.map((s) => s.total), 1)

  // Category breakdown
  const devices = deals.filter((d) => d.category === 'Devices')
  const drugs = deals.filter((d) => d.category === 'Drugs')

  // Sector breakdown (active only)
  const sectorMap: Record<string, number> = {}
  for (const d of deals.filter((d) => d.stage !== 'Passed')) {
    const key = d.sector?.trim() || 'Unknown'
    sectorMap[key] = (sectorMap[key] ?? 0) + 1
  }
  const sectors = Object.entries(sectorMap).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">Dealflow breakdown and sourcing stats</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 max-w-3xl">

        {/* Overview cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Deals', value: total, color: 'text-slate-900' },
            { label: 'Active', value: active, color: 'text-green-700' },
            { label: 'Passed', value: passed, sub: total ? `${Math.round(passed / total * 100)}% pass rate` : undefined, color: 'text-red-600' },
          ].map(({ label, value, sub, color }) => (
            <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
              <p className={`text-3xl font-bold ${color}`}>{value}</p>
              {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            </div>
          ))}
        </div>

        {/* Category split */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">Devices vs. Drugs</p>
          <div className="grid grid-cols-2 gap-4">
            {[
              { label: 'Devices', items: devices, color: 'bg-blue-500' },
              { label: 'Drugs', items: drugs, color: 'bg-purple-500' },
            ].map(({ label, items, color }) => (
              <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">{label}</span>
                  <span className="text-lg font-bold text-slate-900">{items.length}</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-1.5">
                  <div className={`${color} h-1.5 rounded-full`} style={{ width: total ? `${items.length / total * 100}%` : '0%' }} />
                </div>
                <p className="text-xs text-slate-400 mt-1.5">
                  {items.filter(d => d.stage !== 'Passed').length} active · {items.filter(d => d.stage === 'Passed').length} passed
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Source breakdown */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-3">By Source</p>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Source</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Total</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Active</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Passed</th>
                  <th className="px-4 py-2.5 w-32"></th>
                </tr>
              </thead>
              <tbody>
                {sources.map(({ name, total: t, active: a, passed: p }) => (
                  <tr key={name} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{name}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{t}</td>
                    <td className="px-4 py-2.5 text-right text-green-600 font-medium">{a}</td>
                    <td className="px-4 py-2.5 text-right text-red-400">{p}</td>
                    <td className="px-4 py-2.5">
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="bg-slate-400 h-1.5 rounded-full" style={{ width: `${t / maxSourceTotal * 100}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active pipeline by sector */}
        {sectors.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-3">Active Pipeline by Sector</p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {sectors.map(([sector, count]) => (
                    <tr key={sector} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{sector}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 w-8">{count}</td>
                      <td className="px-4 py-2.5 w-32">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${count / sectors[0][1] * 100}%`, backgroundColor: '#5ba200' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
