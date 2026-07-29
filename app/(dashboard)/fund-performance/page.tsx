import { createClient } from "@/lib/supabase/server"
import { PortfolioFundraiseRound, PortfolioPosition, PortfolioValuationMark } from "@/lib/types"
import FundPerformanceView, { FundRow, TopPosition, RiskFlag, CompanyInFund } from "@/components/fund/FundPerformanceView"
import ValuationHistory, { FundSeries } from "@/components/fund/ValuationHistory"
import NotesExposure, { NotePosition } from "@/components/fund/NotesExposure"

export const dynamic = "force-dynamic"

type CompRow = { id: string; name: string }

export default async function FundPerformancePage() {
  const supabase = await createClient()
  const [{ data: companies }, { data: rounds }, { data: positions }, { data: funds }, { data: valMarks }, { data: snapshots }] = await Promise.all([
    supabase.from("portfolio_companies").select("id,name"),
    supabase.from("portfolio_fundraise_rounds").select("id,company_id,round_name,date,post_money,security_type,status,terms"),
    supabase.from("portfolio_positions").select("*"),
    supabase.from("list_options").select("value,sort_order,list_key").in("list_key", ["fund", "spv_fund"]).order("sort_order"),
    supabase.from("portfolio_valuation_marks").select("company_id,as_of_date,valuation"),
    supabase.from("fund_snapshots").select("as_of_date,fund,invested,value").order("as_of_date"),
  ])

  const comps = (companies as CompRow[]) ?? []
  const rs = (rounds as PortfolioFundraiseRound[]) ?? []
  const ps = (positions as PortfolioPosition[]) ?? []
  const fundRows = (funds as { value: string; list_key: string }[]) ?? []
  const fundOrder = fundRows.filter((f) => f.list_key === "fund").map((f) => f.value)
  // Vehicles to roll up under "SPVs & Sidecars". Managed in Settings → SPV /
  // Sidecar Vehicles, so a new commingled fund needs no code change.
  const spvFunds = fundRows.filter((f) => f.list_key === "spv_fund").map((f) => f.value)

  const nameById: Record<string, string> = {}
  for (const c of comps) nameById[c.id] = c.name

  // effective current valuation per company = most recent by date among round post-moneys and manual marks
  const marks = (valMarks as { company_id: string; as_of_date: string | null; valuation: number | null }[]) ?? []
  const latestVal: Record<string, { value: number; date: string }> = {}
  for (const c of comps) {
    const cand: { value: number; date: string }[] = []
    for (const r of rs) if (r.company_id === c.id && r.post_money != null) cand.push({ value: Number(r.post_money), date: r.date ?? "" })
    for (const m of marks) if (m.company_id === c.id && m.valuation != null) cand.push({ value: Number(m.valuation), date: m.as_of_date ?? "" })
    cand.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    if (cand.length) latestVal[c.id] = cand[0]
  }

  const posValue = (p: PortfolioPosition): number | null => {
    const cands: { v: number; d: string }[] = []
    if (p.fair_value != null) cands.push({ v: Number(p.fair_value), d: p.fair_value_date || "" })
    const lv = latestVal[p.company_id]
    if (lv && p.ownership_pct != null) cands.push({ v: (Number(p.ownership_pct) / 100) * lv.value, d: lv.date || "" })
    if (!cands.length) return null
    cands.sort((a, b) => (b.d || "").localeCompare(a.d || ""))
    return cands[0].v
  }

  // ── by fund → company ──
  const fundMap = new Map<string, Map<string, CompanyInFund>>()
  for (const p of ps) {
    const fund = p.fund || "Unassigned"
    if (!fundMap.has(fund)) fundMap.set(fund, new Map())
    const cm = fundMap.get(fund)!
    const cname = nameById[p.company_id] ?? "Unknown"
    const e = cm.get(cname) ?? { name: cname, invested: 0, value: 0, ownership: 0 }
    e.invested += Number(p.invested_amount) || 0
    const v = posValue(p)
    if (v != null) e.value = (e.value ?? 0) + v
    e.ownership += Number(p.ownership_pct) || 0
    cm.set(cname, e)
  }

  const orderIdx = (f: string) => {
    const i = fundOrder.indexOf(f)
    return i === -1 ? 99 : i
  }
  const funds_: FundRow[] = Array.from(fundMap.entries())
    .map(([fund, cm]) => {
      const companiesArr = Array.from(cm.values()).sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      const invested = companiesArr.reduce((s, c) => s + c.invested, 0)
      const value = companiesArr.reduce((s, c) => s + (c.value ?? 0), 0)
      return { fund, invested, value, moic: invested > 0 && value > 0 ? value / invested : null, companies: companiesArr }
    })
    .sort((a, b) => orderIdx(a.fund) - orderIdx(b.fund) || b.invested - a.invested)

  // ── per company (for totals + top positions) ──
  const compMap = new Map<string, { name: string; fund: string; fundInvested: Record<string, number>; invested: number; value: number; ownership: number }>()
  for (const p of ps) {
    const cname = nameById[p.company_id] ?? "Unknown"
    const e = compMap.get(cname) ?? { name: cname, fund: "", fundInvested: {}, invested: 0, value: 0, ownership: 0 }
    const inv = Number(p.invested_amount) || 0
    e.invested += inv
    const f = p.fund || "Unassigned"
    e.fundInvested[f] = (e.fundInvested[f] ?? 0) + inv
    const v = posValue(p)
    if (v != null) e.value += v
    e.ownership += Number(p.ownership_pct) || 0
    compMap.set(cname, e)
  }
  for (const e of compMap.values()) {
    // list every fund the company is held in, largest allocation first
    e.fund = Object.entries(e.fundInvested).sort((a, b) => b[1] - a[1]).map(([f]) => f).join(", ") || "—"
  }

  const totalInvested = Array.from(compMap.values()).reduce((s, c) => s + c.invested, 0)
  const totalValue = Array.from(compMap.values()).reduce((s, c) => s + c.value, 0)
  const totals = {
    invested: totalInvested,
    value: totalValue,
    moic: totalInvested > 0 && totalValue > 0 ? totalValue / totalInvested : null,
    gain: totalValue - totalInvested,
  }

  const top: TopPosition[] = Array.from(compMap.values())
    .map((c) => ({ name: c.name, fund: c.fund, ownership: c.ownership, invested: c.invested, value: c.value || null, moic: c.invested > 0 && c.value > 0 ? c.value / c.invested : null }))
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, 6)

  // ── risk flags: unconverted notes/SAFEs at/near maturity ──
  const flags: RiskFlag[] = []
  const now = new Date()
  for (const r of rs) {
    if ((r.security_type === "Convertible note" || r.security_type === "SAFE") && r.status !== "Converted") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (r.terms as any)?.maturity_date
      if (md) {
        const d = new Date(String(md) + "T00:00:00")
        const days = Math.round((d.getTime() - now.getTime()) / 86400000)
        const company = nameById[r.company_id] ?? "A company"
        if (days < 0) flags.push({ kind: "overdue", company, text: `${r.security_type.toLowerCase()} matured ${Math.abs(days)} days ago and is still unconverted.` })
        else if (days <= 90) flags.push({ kind: "maturing", company, text: `${r.security_type.toLowerCase()} matures in ${days} days, still unconverted.` })
      }
    }
  }
  flags.sort((a, b) => (a.kind === "overdue" ? -1 : 1) - (b.kind === "overdue" ? -1 : 1))

  const asOf = now.toLocaleDateString("en-US", { month: "short", year: "numeric" })

  // ── semi-annual valuation history (from the audited fund valuation files) ──
  type Snap = { as_of_date: string; fund: string; invested: number | null; value: number | null }
  const snapRows = (snapshots as Snap[]) ?? []
  const snapMap = new Map<string, Map<string, { invested: number; value: number }>>()
  for (const s of snapRows) {
    if (!snapMap.has(s.fund)) snapMap.set(s.fund, new Map())
    const byDate = snapMap.get(s.fund)!
    const e = byDate.get(s.as_of_date) ?? { invested: 0, value: 0 }
    e.invested += Number(s.invested) || 0
    e.value += Number(s.value) || 0
    byDate.set(s.as_of_date, e)
  }
  const history: FundSeries[] = Array.from(snapMap.entries())
    .map(([fund, byDate]) => ({
      fund,
      points: Array.from(byDate.entries())
        .map(([date, v]) => ({ date, invested: v.invested, value: v.value }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    }))
    .sort((a, b) => orderIdx(a.fund) - orderIdx(b.fund) || a.fund.localeCompare(b.fund))
  const scaleMax = Math.max(
    1,
    ...history.flatMap((s) => s.points.flatMap((p) => [p.invested, p.value])),
  )

  // ── convertible-note exposure across the funds ────────────────────────────
  const roundById = new Map(rs.map((r) => [r.id, r]))
  const notes: NotePosition[] = ps
    .map((p) => ({ p, r: roundById.get(p.round_id ?? "") }))
    .filter(({ r }) => r?.security_type === "Convertible note")
    .map(({ p, r }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const terms = (r!.terms as any) ?? {}
      const principal = Number(p.invested_amount) || 0
      const accrued = Number(p.accrued_interest) || 0
      return {
        company: nameById[p.company_id] ?? "Unknown",
        fund: p.fund || "Unassigned",
        note: r!.round_name,
        rate: terms.interest_rate != null ? Number(terms.interest_rate) : null,
        maturity: terms.maturity_date ? String(terms.maturity_date) : null,
        principal,
        accrued,
        // fall back to principal + accrued when no explicit mark is set
        value: p.fair_value != null ? Number(p.fair_value) : principal + accrued,
        status: r!.status ?? null,
      }
    })
    .sort((a, b) => orderIdx(a.fund) - orderIdx(b.fund) || a.company.localeCompare(b.company) || a.note.localeCompare(b.note))

  return (
    <>
      <FundPerformanceView totals={totals} funds={funds_} top={top} flags={flags} asOf={asOf} spvFunds={spvFunds} />
      <div className="px-4 md:px-6 pb-8 max-w-4xl space-y-8">
        {notes.length > 0 && <NotesExposure notes={notes} />}
        {history.length > 0 && <ValuationHistory series={history} scaleMax={scaleMax} spvFunds={spvFunds} />}
      </div>
    </>
  )
}
