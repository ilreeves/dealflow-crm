import { createClient } from '@/lib/supabase/server'
import { Deal } from '@/lib/types'
import BreakdownTable, { BreakdownRow } from '@/components/analytics/BreakdownTable'
import CollapsibleSection from '@/components/analytics/CollapsibleSection'

export default async function AnalyticsPage() {
  const supabase = await createClient()
  const [{ data }, { data: activityData }, { data: catalystData }, { data: portfolioData }, { data: legacyData }, { data: listData }] = await Promise.all([
    supabase.from('deals').select('id,name,stage,category,source,sector,clinical_stage,series,stage_entered_at,created_at'),
    supabase.from('deal_activity').select('deal_id,details,created_at').eq('action', 'Stage changed').order('created_at', { ascending: true }),
    supabase.from('catalysts').select('company_name,catalyst_date,original_date,status,resolved_date'),
    supabase.from('portfolio_companies').select('name,sector,category,series,clinical_stage,status'),
    supabase.from('legacy_companies').select('company_name'),
    supabase.from('list_options').select('list_key,value,sort_order').order('sort_order'),
  ])

  const deals = (data as Deal[]) ?? []
  const total = deals.length
  const passed = deals.filter((d) => d.stage === 'Passed').length
  const invested = deals.filter((d) => d.stage === 'Invested').length
  const active = total - passed - invested

  // Source breakdown
  const sourceMap: Record<string, { total: number; passed: number }> = {}
  for (const d of deals) {
    const key = d.source?.trim() || 'Unknown'
    if (!sourceMap[key]) sourceMap[key] = { total: 0, passed: 0 }
    sourceMap[key].total++
    if (d.stage === 'Passed') sourceMap[key].passed++
  }
  const sources = Object.entries(sourceMap)
    .filter(([name]) => name !== 'Unknown')
    .map(([name, s]) => ({ name, ...s, active: s.total - s.passed }))
    .sort((a, b) => b.total - a.total)
  const maxSourceTotal = Math.max(...sources.map((s) => s.total), 1)

  // Category breakdown
  const devices = deals.filter((d) => d.category === 'Devices')
  const drugs = deals.filter((d) => d.category === 'Drugs')

  // Sector breakdowns: deals and portfolio as separate expandable tables
  const legacyNames = new Set(((legacyData as { company_name: string }[]) ?? []).map((l) => l.company_name))
  const portfolioCompaniesAll = (portfolioData as { name: string; sector: string | null; category: string | null; series: string | null; clinical_stage: string | null; status: string | null }[]) ?? []
  // Legacy comes from two places: the legacy_companies list and a Legacy/Exited
  // status on the company itself. Exclude both everywhere on this page.
  const excludedNames = new Set(legacyNames)
  for (const pc of portfolioCompaniesAll) {
    if (pc.status === 'Legacy' || pc.status === 'Exited') excludedNames.add(pc.name)
  }
  const portfolioCompanies = portfolioCompaniesAll.filter((pc) => !excludedNames.has(pc.name))

  function sectorRows(items: { name: string; sector: string | null; sub: string }[]): BreakdownRow[] {
    const map: Record<string, { name: string; stage: string }[]> = {}
    for (const it of items) {
      const key = it.sector?.trim() || 'Unknown'
      if (!map[key]) map[key] = []
      map[key].push({ name: it.name, stage: it.sub })
    }
    return Object.entries(map)
      .filter(([k]) => k !== 'Unknown')
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
      .map(([label, companies]) => ({
        label,
        count: companies.length,
        companies: companies.sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }

  const dealSectorRows = sectorRows(deals.map((d) => ({ name: d.name, sector: d.sector, sub: d.stage })))
  const portfolioSectorRows = sectorRows(portfolioCompanies.map((pc) => ({ name: pc.name, sector: pc.sector, sub: pc.category ?? '' })))
  const maxDealSector = Math.max(...dealSectorRows.map((r) => r.count), 1)
  const maxPortfolioSector = Math.max(...portfolioSectorRows.map((r) => r.count), 1)

  // Series + clinical stage breakdowns (active deals), with company lists
  function buildBreakdown(field: 'series' | 'clinical_stage', order: string[]): BreakdownRow[] {
    const map: Record<string, { name: string; stage: string }[]> = {}
    for (const d of deals.filter((d) => d.stage !== 'Passed')) {
      const key = d[field]?.trim() || 'Unknown'
      if (!map[key]) map[key] = []
      map[key].push({ name: d.name, stage: d.stage })
    }
    return Object.entries(map)
      .filter(([k]) => k !== 'Unknown')
      .sort((a, b) => {
        const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0])
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
      .map(([label, companies]) => ({
        label,
        count: companies.length,
        companies: companies.sort((a, b) => a.name.localeCompare(b.name)),
      }))
  }

  const listRows = (listData as { list_key: string; value: string }[]) ?? []
  const fromList = (key: string, fallback: string[]) => {
    const v = listRows.filter((r) => r.list_key === key).map((r) => r.value)
    return v.length ? v : fallback
  }
  const SERIES_ORDER = fromList('series', ['Pre-Seed', 'Seed', 'Convertible Note/SAFE', 'Bridge', 'A', 'B', 'C', 'D+', 'Crossover', 'Public'])
  const CLINICAL_ORDER = fromList('clinical_stage', ['Preclinical', 'Pre-IND', 'Phase I', 'Phase II', 'Phase III', 'Pre-IDE', 'FIH', 'Pivotal', '510(k)', 'PMA', 'Approved / Marketed'])
  const seriesBreakdown = buildBreakdown('series', SERIES_ORDER)
  const clinicalBreakdown = buildBreakdown('clinical_stage', CLINICAL_ORDER)
  const maxSeries = Math.max(...seriesBreakdown.map((r) => r.count), 1)
  const maxClinical = Math.max(...clinicalBreakdown.map((r) => r.count), 1)

  function portfolioRows(field: 'series' | 'clinical_stage', order: string[]): BreakdownRow[] {
    const map: Record<string, { name: string; stage: string }[]> = {}
    for (const pc of portfolioCompanies) {
      const key = pc[field]?.trim() || 'Unknown'
      if (!map[key]) map[key] = []
      map[key].push({ name: pc.name, stage: pc.category ?? '' })
    }
    return Object.entries(map)
      .filter(([k]) => k !== 'Unknown')
      .sort((a, b) => {
        const ia = order.indexOf(a[0]); const ib = order.indexOf(b[0])
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
      .map(([label, companies]) => ({ label, count: companies.length, companies: companies.sort((a, b) => a.name.localeCompare(b.name)) }))
  }
  const portfolioSeriesRows = portfolioRows('series', SERIES_ORDER)
  const portfolioClinicalRows = portfolioRows('clinical_stage', CLINICAL_ORDER)
  const maxPortfolioSeries = Math.max(...portfolioSeriesRows.map((r) => r.count), 1)
  const maxPortfolioClinical = Math.max(...portfolioClinicalRows.map((r) => r.count), 1)

  // Average time in current stage, per stage
  const STAGE_ORDER = ['Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet', 'Invested', 'Passed']
  const stageTime: Record<string, number[]> = {}
  const now = Date.now()
  for (const d of deals) {
    if (!d.stage_entered_at || d.stage === 'Passed' || d.stage === 'Invested') continue
    const days = (now - new Date(d.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24)
    if (!stageTime[d.stage]) stageTime[d.stage] = []
    stageTime[d.stage].push(days)
  }
  const stageAverages = STAGE_ORDER
    .filter((s) => stageTime[s]?.length)
    .map((s) => ({
      stage: s,
      count: stageTime[s].length,
      avgDays: stageTime[s].reduce((a, b) => a + b, 0) / stageTime[s].length,
    }))
  const maxAvg = Math.max(...stageAverages.map((s) => s.avgDays), 1)

  // Historical time in stage, from the stage-change activity log.
  // A completed interval = time between entering a stage and leaving it.
  type StageEvent = { deal_id: string; details: string; created_at: string }
  const events = (activityData as StageEvent[]) ?? []
  const dealCreated: Record<string, string> = {}
  for (const d of deals) dealCreated[d.id] = d.created_at

  const historical: Record<string, number[]> = {}
  const lastEntered: Record<string, { stage: string; at: string }> = {}
  for (const e of events) {
    const arrow = e.details.indexOf(' \u2192 ')
    if (arrow === -1) continue
    const fromStage = e.details.slice(0, arrow).trim()
    // Entry time for fromStage: previous transition into it, else deal creation
    const enteredAt = lastEntered[e.deal_id]?.stage === fromStage
      ? lastEntered[e.deal_id].at
      : dealCreated[e.deal_id]
    if (enteredAt) {
      const days = (new Date(e.created_at).getTime() - new Date(enteredAt).getTime()) / (1000 * 60 * 60 * 24)
      if (days >= 0) {
        if (!historical[fromStage]) historical[fromStage] = []
        historical[fromStage].push(days)
      }
    }
    let toStage = e.details.slice(arrow + 3).trim()
    const colon = toStage.indexOf(':')
    if (colon !== -1) toStage = toStage.slice(0, colon).trim()
    lastEntered[e.deal_id] = { stage: toStage, at: e.created_at }
  }
  const historicalAverages = STAGE_ORDER
    .filter((s) => s !== 'Passed' && historical[s]?.length)
    .map((s) => ({
      stage: s,
      count: historical[s].length,
      avgDays: historical[s].reduce((a, b) => a + b, 0) / historical[s].length,
    }))
  const maxHistAvg = Math.max(...historicalAverages.map((s) => s.avgDays), 1)
  const totalTransitions = historicalAverages.reduce((a, s) => a + s.count, 0)

  // Stage advancement funnel: of the deals that reached each stage, how many advanced to the next.
  // "Reached" = the furthest forward stage a deal ever hit (current stage, plus any stage in its change log —
  // so a deal that passed out of Finance still counts as having reached Finance).
  const FUNNEL_STAGES = ['Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet', 'Invested']
  const funnelIdx = (s: string) => FUNNEL_STAGES.indexOf(s)
  const reachedIdx: Record<string, number> = {}
  for (const d of deals) reachedIdx[d.id] = funnelIdx(d.stage) // Passed → -1
  for (const e of events) {
    if (!e.deal_id || !(e.deal_id in reachedIdx)) continue
    const arrow = e.details.indexOf(' → ')
    if (arrow === -1) continue
    const fromStage = e.details.slice(0, arrow).trim()
    let toStage = e.details.slice(arrow + 3).trim()
    const colon = toStage.indexOf(':')
    if (colon !== -1) toStage = toStage.slice(0, colon).trim()
    const m = Math.max(funnelIdx(fromStage), funnelIdx(toStage))
    if (m > reachedIdx[e.deal_id]) reachedIdx[e.deal_id] = m
  }
  const reachedCount = FUNNEL_STAGES.map((_, i) => Object.values(reachedIdx).filter((r) => r >= i).length)
  const advancement = FUNNEL_STAGES.slice(0, -1).map((from, i) => ({
    from,
    to: FUNNEL_STAGES[i + 1],
    reached: reachedCount[i],
    advanced: reachedCount[i + 1],
    rate: reachedCount[i] ? reachedCount[i + 1] / reachedCount[i] : null,
  }))

  // Catalyst reliability: per company, how many catalysts slipped vs original timeline
  type CatalystRow = { company_name: string; catalyst_date: string; original_date: string | null; status: string | null; resolved_date: string | null }
  const catalysts = (catalystData as CatalystRow[]) ?? []
  const reliabilityMap: Record<string, { total: number; delayed: number; slipDays: number[] }> = {}
  for (const cat of catalysts) {
    // Legacy / exited companies are out entirely — their historical slips aren't
    // useful signal on current holdings.
    if (excludedNames.has(cat.company_name)) continue
    if (!reliabilityMap[cat.company_name]) reliabilityMap[cat.company_name] = { total: 0, delayed: 0, slipDays: [] }
    const r = reliabilityMap[cat.company_name]
    r.total++
    // Once resolved, judge against the date it actually happened, not the (possibly never-moved) expected date
    const effectiveDate = cat.resolved_date ?? cat.catalyst_date
    const slipped = cat.original_date && effectiveDate > cat.original_date
    if (slipped || cat.status === 'Delayed') r.delayed++
    if (slipped && cat.original_date) {
      r.slipDays.push((new Date(effectiveDate).getTime() - new Date(cat.original_date).getTime()) / (1000 * 60 * 60 * 24))
    }
  }
  const reliability = Object.entries(reliabilityMap)
    .map(([company, r]) => ({
      company,
      total: r.total,
      delayed: r.delayed,
      // Reliability = share of catalysts that held their original guidance, so
      // higher is better and the table reads best-to-worst.
      rate: (r.total - r.delayed) / r.total,
      avgSlip: r.slipDays.length ? r.slipDays.reduce((a, b) => a + b, 0) / r.slipDays.length : null,
    }))
    .sort((a, b) => b.rate - a.rate || b.total - a.total)

  // Green when they hit guidance, through amber, to red when nothing held.
  function reliabilityColor(rate: number): string {
    if (rate >= 0.9) return '#5ba200'
    if (rate >= 0.75) return '#8aad1f'
    if (rate >= 0.5) return '#d9a406'
    if (rate >= 0.25) return '#e98925'
    if (rate > 0) return '#d9531e'
    return '#dc2626'
  }

  function formatDays(days: number): string {
    if (days < 1) return '<1 day'
    if (days < 14) return `${Math.round(days)} days`
    if (days < 60) return `${(days / 7).toFixed(1)} weeks`
    return `${(days / 30).toFixed(1)} months`
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
        <p className="text-sm text-slate-500">Dealflow breakdown and sourcing stats</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">

        {/* ── Left column: pipeline analytics ── */}
        <div className="space-y-8">
        <div>
          <h2 className="text-base font-bold text-slate-900">Pipeline Data</h2>
          <div className="h-0.5 w-12 mt-1 rounded-full" style={{ backgroundColor: '#5ba200' }} />
        </div>

        {/* Overview cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total Deals', value: total, color: 'text-slate-900' },
            { label: 'Active', value: active, color: 'text-blue-600' },
            { label: 'Invested', value: invested, sub: total ? `${Math.round(invested / total * 100)}% invested` : undefined, color: 'text-green-700' },
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
              { label: 'Devices', items: devices },
              { label: 'Drugs', items: drugs },
            ].map(({ label, items }) => {
              const aCount = items.filter(d => d.stage !== 'Passed' && d.stage !== 'Invested').length
              const iCount = items.filter(d => d.stage === 'Invested').length
              const pCount = items.filter(d => d.stage === 'Passed').length
              return (
                <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-700">{label}</span>
                    <span className="text-lg font-bold text-slate-900">{items.length}</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 flex overflow-hidden">
                    <div className="h-1.5 bg-blue-500" style={{ width: total ? `${aCount / total * 100}%` : '0%' }} />
                    <div className="h-1.5" style={{ width: total ? `${iCount / total * 100}%` : '0%', backgroundColor: '#5ba200' }} />
                    <div className="h-1.5 bg-red-300" style={{ width: total ? `${pCount / total * 100}%` : '0%' }} />
                  </div>
                  <p className="text-xs mt-1.5">
                    <span className="text-blue-600">{aCount} active</span>
                    <span className="text-slate-300"> · </span>
                    <span className="text-green-700">{iCount} invested</span>
                    <span className="text-slate-300"> · </span>
                    <span className="text-red-400">{pCount} passed</span>
                  </p>
                </div>
              )
            })}
          </div>
        </div>

        {/* Average time in stage */}
        {stageAverages.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Current Inventory Age</p>
            <p className="text-xs text-slate-400 mb-3">How long the deals currently sitting in each stage have been there.</p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {stageAverages.map(({ stage, count, avgDays }) => (
                    <tr key={stage} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{stage}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400 text-xs whitespace-nowrap">{count} {count === 1 ? 'deal' : 'deals'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap w-24">{formatDays(avgDays)}</td>
                      <td className="px-4 py-2.5 w-32">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="bg-slate-400 h-1.5 rounded-full" style={{ width: `${avgDays / maxAvg * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Historical time in stage */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1">Historical Time in Stage</p>
          <p className="text-xs text-slate-400 mb-3">
            Average time deals spent in each stage before moving on, from the stage-change log ({totalTransitions} completed {totalTransitions === 1 ? 'transition' : 'transitions'}). Tracking began June 11, 2026, so this builds accuracy over time.
          </p>
          {historicalAverages.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 px-5 py-6 text-center">
              <p className="text-sm text-slate-400">No completed stage transitions logged yet — this fills in as deals move through the pipeline.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {historicalAverages.map(({ stage, count, avgDays }) => (
                    <tr key={stage} className="border-b border-slate-50 last:border-0">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{stage}</td>
                      <td className="px-4 py-2.5 text-right text-slate-400 text-xs whitespace-nowrap">{count} {count === 1 ? 'exit' : 'exits'}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap w-24">{formatDays(avgDays)}</td>
                      <td className="px-4 py-2.5 w-32">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          <div className="h-1.5 rounded-full" style={{ width: `${avgDays / maxHistAvg * 100}%`, backgroundColor: '#023a51' }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Stage advancement funnel */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-1">Stage Advancement</p>
          <p className="text-xs text-slate-400 mb-3">
            Of the deals that reached each stage, the share that advanced to the next. Based on the furthest stage each deal reached; early history is partial (stage tracking began June 11, 2026).
          </p>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {advancement.map(({ from, to, reached, advanced, rate }) => (
                  <tr key={from} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5 font-medium text-slate-700">{from} <span className="text-slate-300">→</span> {to}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400 text-xs whitespace-nowrap">{advanced} / {reached}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600 whitespace-nowrap w-14">{rate === null ? '—' : `${Math.round(rate * 100)}%`}</td>
                    <td className="px-4 py-2.5 w-32">
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 rounded-full" style={{ width: `${rate ? rate * 100 : 0}%`, backgroundColor: '#5ba200' }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Series & Clinical Stage breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BreakdownTable title="Active Pipeline by Series" rows={seriesBreakdown} max={maxSeries} color="#023a51" />
          <BreakdownTable title="Active Pipeline by Clinical Stage" rows={clinicalBreakdown} max={maxClinical} color="#e98925" />
        </div>

        {/* Deals by sector */}
        <BreakdownTable title="All Deals by Sector" rows={dealSectorRows} max={maxDealSector} color="#5ba200" />

        {/* Source breakdown */}
        <CollapsibleSection title="By Source" subtitle={`${sources.length} ${sources.length === 1 ? 'source' : 'sources'}`}>
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
        </CollapsibleSection>

        </div>

        {/* ── Right column: catalyst & portfolio analytics ── */}
        <div className="space-y-8">
        <div>
          <h2 className="text-base font-bold text-slate-900">Portfolio Data</h2>
          <div className="h-0.5 w-12 mt-1 rounded-full" style={{ backgroundColor: '#5ba200' }} />
        </div>
        {/* Portfolio by sector */}
        <BreakdownTable title="Portfolio Holdings by Sector" rows={portfolioSectorRows} max={maxPortfolioSector} color="#023a51" />

        {/* Portfolio by clinical stage */}
        <BreakdownTable title="Portfolio by Clinical Stage" rows={portfolioClinicalRows} max={maxPortfolioClinical} color="#e98925" />

        {/* Portfolio by series */}
        <BreakdownTable title="Portfolio by Series" rows={portfolioSeriesRows} max={maxPortfolioSeries} color="#5ba200" />

        {/* Catalyst reliability */}
        {reliability.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-700 mb-1">Catalyst Reliability by Company</p>
            <p className="text-xs text-slate-400 mb-3">
              How reliably each company holds its original catalyst guidance — 100% means nothing has slipped. Slip magnitude is tracked from when each catalyst was first entered (timeline snapshots began June 11, 2026).
            </p>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Company</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Catalysts</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Delayed</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Reliability</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Avg Slip</th>
                    <th className="px-4 py-2.5 w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {reliability.map(({ company, total: t, delayed, rate, avgSlip }) => (
                    <tr key={company} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700">{company}</td>
                      <td className="px-4 py-2.5 text-right text-slate-600">{t}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${delayed === 0 ? 'text-slate-300' : 'text-orange-600'}`}>{delayed}</td>
                      <td className="px-4 py-2.5 text-right font-medium" style={{ color: reliabilityColor(rate) }}>{Math.round(rate * 100)}%</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{avgSlip !== null ? formatDays(avgSlip) : '\u2014'}</td>
                      <td className="px-4 py-2.5">
                        <div className="w-full bg-slate-100 rounded-full h-1.5">
                          {/* floor the width so a 0% bar still shows a red nub rather than looking like missing data */}
                          <div className="h-1.5 rounded-full" style={{ width: `${Math.max(rate * 100, 3)}%`, backgroundColor: reliabilityColor(rate) }} />
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
      </div>
    </div>
  )
}
