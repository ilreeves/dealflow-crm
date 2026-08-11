"use client"

import { useState, useEffect } from "react"
import { X, Loader2, Plus, ArrowRightCircle, Building2 } from "lucide-react"
import { Deal, PortfolioCompany, SECURITY_TYPES } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { logActivity } from "@/lib/activity"
// Shared parser so "$25M"-style shorthand works here too.
import { parseNum, numError, fmtMoney, inputCls } from "@/lib/rounds"
import Field from "@/components/shared/Field"

interface Props {
  deal: Deal
  actorName: string | null
  onCancel: () => void
  onDone: (updated: Deal) => void
}

export default function InvestModal({ deal, actorName, onCancel, onDone }: Props) {
  const supabase = createClient()
  const [funds, setFunds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const seriesRound = deal.series ? (/^[A-D]\+?$/.test(deal.series) ? `Series ${deal.series}` : deal.series) : ""
  const [f, setF] = useState({
    round_name: seriesRound,
    security_type: "Priced equity",
    date: new Date().toISOString().slice(0, 10),
    round_size: "",
    pre_money: "",
    post_money: "",
    price_per_share: "",
    interest_rate: "",
    interest_type: "Simple",
    maturity_date: "",
    discount: "",
    valuation_cap: "",
    cap_type: "Post-money",
    warrant_coverage: "",
    lead_investor: "",
    // Solas position
    fund: "",
    invested_amount: "",
    shares: "",
    ownership_pct: "",
  })
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  useEffect(() => {
    supabase.from("list_options").select("value,sort_order").eq("list_key", "fund").order("sort_order")
      .then(({ data }) => setFunds(((data as { value: string }[]) ?? []).map((x) => x.value)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sec = f.security_type
  const isEquity = sec === "Priced equity"
  const isNote = sec === "Convertible note"
  const isSafe = sec === "SAFE"

  async function confirm() {
    if (!f.fund) { setError("Choose which fund is investing."); return }

    // Reject unreadable numbers before writing anything.
    const numIssue = [
      numError("Invested amount", f.invested_amount),
      numError("Round size", f.round_size),
      numError("Pre-money", f.pre_money),
      numError("Post-money", f.post_money),
      numError("Price / share", f.price_per_share),
      numError("Shares", f.shares),
      numError("Ownership %", f.ownership_pct),
      numError("Valuation cap", f.valuation_cap),
      numError("Discount", f.discount),
    ].find(Boolean)
    if (numIssue) { setError(numIssue); return }

    setSaving(true)
    setError("")
    // Track what we create so we can roll it back if a later step fails —
    // otherwise a mid-sequence error leaves an orphaned company/round/position.
    let createdCompanyId: string | null = null
    let createdRoundId: string | null = null
    let createdPositionId: string | null = null
    try {
      // 1) create or fetch the portfolio company
      const { data: existing } = await supabase.from("portfolio_companies").select("id,funds").ilike("name", deal.name).limit(1)
      let companyId: string
      if (existing && existing.length > 0) {
        companyId = (existing[0] as { id: string }).id
        const cur = ((existing[0] as PortfolioCompany).funds) ?? []
        if (!cur.includes(f.fund)) await supabase.from("portfolio_companies").update({ funds: [...cur, f.fund] }).eq("id", companyId)
      } else {
        const { data: co, error: e1 } = await supabase.from("portfolio_companies").insert({
          name: deal.name, sector: deal.sector, category: deal.category, funds: [f.fund],
          series: deal.series, clinical_stage: deal.clinical_stage, website: deal.website,
          contact_email: deal.contact_email, description: deal.description,
          current_valuation: deal.current_valuation, current_fundraise: deal.current_fundraise,
          sharepoint_link: deal.sharepoint_link, city: deal.city, state: deal.state, country: deal.country,
          status: "Active",
        }).select("id").single()
        if (e1 || !co) throw new Error(e1?.message || "Could not create portfolio company")
        companyId = (co as { id: string }).id
        createdCompanyId = companyId
      }

      // 2) build round terms + payload
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const terms: Record<string, any> = {}
      if (isNote || isSafe) {
        if (f.valuation_cap) terms.valuation_cap = parseNum(f.valuation_cap)
        if (f.discount) terms.discount = parseNum(f.discount)
      }
      if (isNote) {
        if (f.interest_rate) terms.interest_rate = parseNum(f.interest_rate)
        terms.interest_type = f.interest_type
        if (f.maturity_date) terms.maturity_date = f.maturity_date
        if (f.warrant_coverage) terms.warrant_coverage = parseNum(f.warrant_coverage)
      }
      if (isSafe) terms.cap_type = f.cap_type

      const { data: rnd, error: e2 } = await supabase.from("portfolio_fundraise_rounds").insert({
        company_id: companyId,
        round_name: f.round_name.trim() || "Investment",
        security_type: f.security_type,
        date: f.date || null,
        lead_investor: f.lead_investor || null,
        round_size: parseNum(f.round_size),
        pre_money: isEquity ? parseNum(f.pre_money) : null,
        post_money: isEquity ? parseNum(f.post_money) : null,
        price_per_share: isEquity ? parseNum(f.price_per_share) : null,
        status: isNote || isSafe ? "Unconverted" : null,
        terms,
        notes: `Created on investment from pipeline deal.`,
      }).select("id").single()
      if (e2 || !rnd) throw new Error(e2?.message || "Could not create round")
      createdRoundId = (rnd as { id: string }).id

      // 3) Solas position (held at cost at entry)
      const invested = parseNum(f.invested_amount)
      const { data: pos, error: e3 } = await supabase.from("portfolio_positions").insert({
        company_id: companyId,
        round_id: (rnd as { id: string }).id,
        fund: f.fund,
        invested_amount: invested,
        shares: parseNum(f.shares),
        ownership_pct: parseNum(f.ownership_pct),
        fair_value: invested,
        fair_value_date: f.date || null,
        fair_value_source: "Investment entry (at cost)",
      }).select("id").single()
      if (e3 || !pos) throw new Error(e3?.message || "Could not create position")
      createdPositionId = (pos as { id: string }).id

      // 4) move the deal to Invested + log
      const now = new Date().toISOString()
      const { data: updated, error: e4 } = await supabase.from("deals")
        .update({ stage: "Invested", stage_entered_at: now }).eq("id", deal.id).select().single()
      if (e4 || !updated) throw new Error(e4?.message || "Could not update deal")
      await logActivity(deal.id, deal.name, "Stage changed", `${deal.stage} → Invested`, actorName)
      await logActivity(deal.id, deal.name, "Added to portfolio", `Invested via ${f.fund}${invested != null ? ` — ${fmtMoney(invested)}` : ""}`, actorName)

      setSaving(false)
      onDone(updated as Deal)
    } catch (err) {
      // Roll back anything we created (reverse order) so a failed investment
      // doesn't leave orphaned portfolio records behind. Deleting the round
      // cascades its positions; we only delete the company if we created it.
      // A rollback delete can itself fail — track those so the user knows an
      // orphan survived instead of silently trusting the cleanup.
      const orphaned: string[] = []
      if (createdPositionId) {
        const { error: e } = await supabase.from("portfolio_positions").delete().eq("id", createdPositionId)
        if (e) orphaned.push("position")
      }
      if (createdRoundId) {
        const { error: e } = await supabase.from("portfolio_fundraise_rounds").delete().eq("id", createdRoundId)
        if (e) orphaned.push("round")
      }
      if (createdCompanyId) {
        const { error: e } = await supabase.from("portfolio_companies").delete().eq("id", createdCompanyId)
        if (e) orphaned.push("portfolio company")
      }
      const msg = err instanceof Error ? err.message : "Something went wrong"
      setError(orphaned.length ? `${msg} — rollback also failed; manual cleanup may be needed for: ${orphaned.join(", ")}` : msg)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invest in {deal.name}</h2>
            <p className="text-sm text-slate-500 mt-0.5">Moves the deal to your Portfolio and records the round.</p>
          </div>
          <button onClick={onCancel} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Round name"><input placeholder="e.g. Series A" value={f.round_name} onChange={(e) => set("round_name", e.target.value)} className={inputCls} /></Field>
            <Field label="Security">
              <select value={f.security_type} onChange={(e) => set("security_type", e.target.value)} className={inputCls}>
                {SECURITY_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} /></Field>

            <Field label={isNote ? "Principal" : "Round size"}><input placeholder="$" value={f.round_size} onChange={(e) => set("round_size", e.target.value)} className={inputCls} /></Field>
            {isEquity && <>
              <Field label="Pre-money"><input placeholder="$" value={f.pre_money} onChange={(e) => set("pre_money", e.target.value)} className={inputCls} /></Field>
              <Field label="Post-money"><input placeholder="$" value={f.post_money} onChange={(e) => set("post_money", e.target.value)} className={inputCls} /></Field>
              <Field label="Price / share"><input placeholder="$" value={f.price_per_share} onChange={(e) => set("price_per_share", e.target.value)} className={inputCls} /></Field>
            </>}
            {(isNote || isSafe) && <>
              <Field label="Discount (%)"><input placeholder="20" value={f.discount} onChange={(e) => set("discount", e.target.value)} className={inputCls} /></Field>
              <Field label="Valuation cap"><input placeholder="$" value={f.valuation_cap} onChange={(e) => set("valuation_cap", e.target.value)} className={inputCls} /></Field>
            </>}
            {isNote && <>
              <Field label="Interest (%)"><input placeholder="6" value={f.interest_rate} onChange={(e) => set("interest_rate", e.target.value)} className={inputCls} /></Field>
              <Field label="Interest type"><select value={f.interest_type} onChange={(e) => set("interest_type", e.target.value)} className={inputCls}><option>Simple</option><option>Compound</option></select></Field>
              <Field label="Maturity date"><input type="date" value={f.maturity_date} onChange={(e) => set("maturity_date", e.target.value)} className={inputCls} /></Field>
              <Field label="Warrant coverage (%)"><input placeholder="10" value={f.warrant_coverage} onChange={(e) => set("warrant_coverage", e.target.value)} className={inputCls} /></Field>
            </>}
            {isSafe && <Field label="Cap type"><select value={f.cap_type} onChange={(e) => set("cap_type", e.target.value)} className={inputCls}><option>Post-money</option><option>Pre-money</option></select></Field>}
            <Field label="Lead investor"><input placeholder="Lead" value={f.lead_investor} onChange={(e) => set("lead_investor", e.target.value)} className={inputCls} /></Field>
          </div>

          {(isNote || isSafe) && (
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
              <ArrowRightCircle className="w-3.5 h-3.5 shrink-0" style={{ color: "#e98925" }} />
              Recorded as unconverted; it&apos;ll convert at the next priced round.
            </div>
          )}

          <div className="border-t border-slate-100 pt-3">
            <p className="text-[11px] text-slate-400 mb-1.5 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5" /> Solas position</p>
            <div className="grid grid-cols-4 gap-2">
              <select value={f.fund} onChange={(e) => set("fund", e.target.value)} className={inputCls}>
                <option value="">Fund…</option>
                {funds.map((fd) => <option key={fd} value={fd}>{fd}</option>)}
              </select>
              <input placeholder="$ invested" value={f.invested_amount} onChange={(e) => set("invested_amount", e.target.value)} className={inputCls} />
              <input placeholder="Shares" value={f.shares} onChange={(e) => set("shares", e.target.value)} className={inputCls} />
              <input placeholder="Own %" value={f.ownership_pct} onChange={(e) => set("ownership_pct", e.target.value)} className={inputCls} />
            </div>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
          <button onClick={confirm} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition" style={{ backgroundColor: "#023a51" }}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Confirm investment
          </button>
        </div>
      </div>
    </div>
  )
}

