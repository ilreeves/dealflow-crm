"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Pencil, Building2, ArrowRightCircle, TrendingUp } from "lucide-react"
import { PortfolioFundraiseRound, PortfolioPosition, PortfolioValuationMark, SECURITY_TYPES, VALUATION_BASES } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"

// ─── helpers ──────────────────────────────────────────────────────────────────
function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null
  const cleaned = String(v).replace(/[$,%\s]/g, "")
  if (cleaned === "") return null
  const n = Number(cleaned)
  return isNaN(n) ? null : n
}
function numToStr(n: number | null | undefined): string {
  return n == null ? "" : String(n)
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function termStr(terms: any, key: string): string {
  const v = terms?.[key]
  return v == null ? "" : String(v)
}
function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  const x = Number(n)
  const abs = Math.abs(x)
  if (abs >= 1e9) return `$${(x / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(x / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(x / 1e3).toFixed(0)}K`
  return `$${x.toLocaleString()}`
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  return `${Number(n).toFixed(1)}%`
}
function saveHint(msg: string): string {
  if (/portfolio_positions|column .* does not exist|schema cache|could not find/i.test(msg)) {
    return "Save failed — the Ownership database migration hasn't been run yet. Run the portfolio_positions migration in Supabase, then try again. (" + msg + ")"
  }
  return "Save failed: " + msg
}
function monthYear(date: string | null): string {
  if (!date) return ""
  return new Date(date + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" })
}
const SECURITY_COLOR: Record<string, string> = {
  "Priced equity": "#5ba200",
  "Convertible note": "#e98925",
  "SAFE": "#023a51",
}
const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"

type Staged = {
  _k: number
  id?: string
  fund: string
  invested_amount: string
  shares: string
  ownership_pct: string
  accrued_interest: string
  fair_value: string
  fair_value_date: string
  fair_value_source: string
}

// ─── main tab ───────────────────────────────────────────────────────────────
export default function CapRoundsTab({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const [rounds, setRounds] = useState<PortfolioFundraiseRound[]>([])
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [funds, setFunds] = useState<string[]>([])
  const [marks, setMarks] = useState<PortfolioValuationMark[]>([])
  const [loading, setLoading] = useState(true)
  const [addingMark, setAddingMark] = useState(false)
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  async function load() {
    setLoading(true)
    const [{ data: rd }, { data: ps }, { data: fu }, { data: mk }] = await Promise.all([
      supabase.from("portfolio_fundraise_rounds").select("*").eq("company_id", companyId).order("date", { ascending: false }),
      supabase.from("portfolio_positions").select("*").eq("company_id", companyId),
      supabase.from("list_options").select("value,sort_order").eq("list_key", "fund").order("sort_order"),
      supabase.from("portfolio_valuation_marks").select("*").eq("company_id", companyId).order("as_of_date", { ascending: false }),
    ])
    setRounds((rd as PortfolioFundraiseRound[]) ?? [])
    setPositions((ps as PortfolioPosition[]) ?? [])
    setFunds(((fu as { value: string }[]) ?? []).map((f) => f.value))
    setMarks((mk as PortfolioValuationMark[]) ?? [])
    setLoading(false)
  }

  const positionsForRound = (rid: string) => positions.filter((p) => p.round_id === rid)

  const totalInvested = positions.reduce((s, p) => s + (Number(p.invested_amount) || 0), 0)
  const ownership = positions.reduce((s, p) => s + (Number(p.ownership_pct) || 0), 0)
  // effective current valuation = most recent by date among round post-moneys and manual marks
  const valuation = (() => {
    const candidates: { value: number; date: string; source: string }[] = []
    for (const r of rounds) if (r.post_money != null) candidates.push({ value: Number(r.post_money), date: r.date ?? "", source: `${r.round_name} post-money` })
    for (const m of marks) if (m.valuation != null) candidates.push({ value: Number(m.valuation), date: m.as_of_date ?? "", source: m.basis || "mark" })
    candidates.sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    return candidates[0] ?? null
  })()
  const usesFairValue = positions.some((p) => p.fair_value != null)
  const currentValue = (() => {
    if (!positions.length) return null
    if (!usesFairValue && valuation == null) return null
    return positions.reduce((s, p) => {
      if (p.fair_value != null) return s + Number(p.fair_value)
      if (valuation != null && p.ownership_pct != null) return s + (Number(p.ownership_pct) / 100) * valuation.value
      return s
    }, 0)
  })()
  const moic = currentValue != null && totalInvested > 0 ? currentValue / totalInvested : null

  async function handleDeleteRound(id: string) {
    await supabase.from("portfolio_positions").delete().eq("round_id", id)
    await supabase.from("portfolio_fundraise_rounds").delete().eq("id", id)
    setRounds((prev) => prev.filter((r) => r.id !== id))
    setPositions((prev) => prev.filter((p) => p.round_id !== id))
    if (editingId === id) setEditingId(null)
  }

  async function handleDeleteMark(id: string) {
    await supabase.from("portfolio_valuation_marks").delete().eq("id", id)
    setMarks((prev) => prev.filter((m) => m.id !== id))
    if (editingMarkId === id) setEditingMarkId(null)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Position stat cards */}
      <div className="grid grid-cols-4 gap-2.5">
        <Stat label="Invested" value={fmtMoney(totalInvested)} />
        <Stat label="Current value" value={fmtMoney(currentValue)} accent="#3b6d11" />
        <Stat label="Ownership" value={fmtPct(ownership)} />
        <Stat label="MOIC" value={moic != null ? `${moic.toFixed(2)}×` : "—"} />
      </div>
      <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
        {currentValue == null
          ? "Add a round post-money, a valuation mark, or a position fair value to compute current value."
          : usesFairValue
            ? `Value uses position fair-value marks where set${valuation != null ? `, else ownership × ${valuation.source}` : ""}. Unrealized.`
            : `Value = ownership × ${valuation!.source} (${fmtMoney(valuation!.value)}${valuation!.date ? `, ${monthYear(valuation!.date)}` : ""}). Unrealized.`}
      </p>

      {/* Valuation marks */}
      <div className="border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Valuation marks</span>
            <span className="text-xs text-slate-400">interim fair value between rounds</span>
          </div>
          {!addingMark && !editingMarkId && (
            <button onClick={() => setAddingMark(true)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 transition">
              <Plus className="w-3.5 h-3.5" /> Add mark
            </button>
          )}
        </div>
        {addingMark && (
          <div className="border-t border-slate-100">
            <MarkEditor companyId={companyId} onCancel={() => setAddingMark(false)} onDone={() => { setAddingMark(false); load() }} />
          </div>
        )}
        {marks.length > 0 && (
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            {marks.map((m) => (
              editingMarkId === m.id ? (
                <div key={m.id}><MarkEditor companyId={companyId} initial={m} onCancel={() => setEditingMarkId(null)} onDone={() => { setEditingMarkId(null); load() }} /></div>
              ) : (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm group">
                  <span className="text-slate-400 text-xs w-20 shrink-0">{m.as_of_date ? monthYear(m.as_of_date) : "—"}</span>
                  <span className="font-medium text-slate-800 shrink-0">{fmtMoney(m.valuation)}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: "#e6eef1", color: "#023a51" }}>{m.basis || "mark"}</span>
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-500">{m.notes}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button onClick={() => { setEditingMarkId(m.id); setAddingMark(false) }} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDeleteMark(m.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {/* Add round */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">Rounds</span>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed rounded-lg text-sm transition"
            style={{ color: "#023a51", borderColor: "#023a51" }}
          >
            <Plus className="w-3.5 h-3.5" /> Add round
          </button>
        )}
      </div>

      {adding && (
        <RoundEditor
          companyId={companyId}
          funds={funds}
          initialPositions={[]}
          onCancel={() => setAdding(false)}
          onDone={() => { setAdding(false); load() }}
        />
      )}

      {rounds.length === 0 && !adding ? (
        <p className="text-center text-sm text-slate-400 py-6">No rounds recorded yet</p>
      ) : (
        <div className="space-y-2.5">
          {rounds.map((r) => {
            const rpos = positionsForRound(r.id)
            const solasInvested = rpos.reduce((s, p) => s + (Number(p.invested_amount) || 0), 0)
            const isEditing = editingId === r.id
            const isOpen = expanded === r.id || isEditing
            const color = SECURITY_COLOR[r.security_type ?? ""] ?? "#94a3b8"
            const isConvertible = r.security_type === "SAFE" || r.security_type === "Convertible note"
            return (
              <div key={r.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                {/* summary header */}
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <button onClick={() => setExpanded(isOpen ? null : r.id)} className="text-slate-400 hover:text-slate-600 shrink-0">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-semibold text-slate-800 shrink-0">{r.round_name}</span>
                  <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                    {[monthYear(r.date), r.round_size != null ? fmtMoney(r.round_size) : null, r.post_money != null ? `post ${fmtMoney(r.post_money)}` : null].filter(Boolean).join(" · ")}
                  </span>
                  {isConvertible && r.status && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: r.status === "Converted" ? "#eaf3de" : "#faece7", color: r.status === "Converted" ? "#3b6d11" : "#993c1d" }}>
                      {r.status}
                    </span>
                  )}
                  {solasInvested > 0 && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: "#eaf3de", color: "#3b6d11" }}>
                      Solas {fmtMoney(solasInvested)}
                    </span>
                  )}
                </div>

                {isOpen && !isEditing && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                    <RoundDetails round={r} />
                    {rpos.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-[11px] text-slate-400">Solas positions</p>
                        {rpos.map((p) => (
                          <div key={p.id} className="flex items-center gap-2.5 text-sm px-3 py-2 border border-slate-100 rounded-lg bg-slate-50">
                            <Building2 className="w-3.5 h-3.5 shrink-0" style={{ color: "#023a51" }} />
                            <span className="flex-1 min-w-0 truncate">
                              <span className="text-slate-800">{p.fund || "—"}</span>
                              {" · "}{fmtMoney(p.invested_amount)}
                              {p.shares != null && ` · ${Number(p.shares).toLocaleString()} sh`}
                              {p.ownership_pct != null && <span style={{ color: "#3b6d11" }}> · {fmtPct(p.ownership_pct)}</span>}
                              {p.accrued_interest != null && Number(p.accrued_interest) > 0 && <span className="text-slate-400"> · accrued {fmtMoney(p.accrued_interest)}</span>}
                              {p.fair_value != null && <span className="text-slate-500"> · FV {fmtMoney(p.fair_value)}{p.fair_value_source ? ` (${p.fair_value_source})` : ""}</span>}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No Solas positions in this round.</p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => handleDeleteRound(r.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                      <button onClick={() => { setEditingId(r.id); setExpanded(r.id) }} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg transition">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    </div>
                  </div>
                )}

                {isEditing && (
                  <div className="border-t border-slate-100">
                    <RoundEditor
                      companyId={companyId}
                      funds={funds}
                      initial={r}
                      initialPositions={rpos.map((p, i) => ({
                        _k: i,
                        id: p.id,
                        fund: p.fund ?? "",
                        invested_amount: numToStr(p.invested_amount),
                        shares: numToStr(p.shares),
                        ownership_pct: numToStr(p.ownership_pct),
                        accrued_interest: numToStr(p.accrued_interest),
                        fair_value: numToStr(p.fair_value),
                        fair_value_date: p.fair_value_date ?? "",
                        fair_value_source: p.fair_value_source ?? "",
                      }))}
                      onCancel={() => setEditingId(null)}
                      onDone={() => { setEditingId(null); load() }}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5" style={{ color: accent ?? "#0f172a" }}>{value}</p>
    </div>
  )
}

function RoundDetails({ round: r }: { round: PortfolioFundraiseRound }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terms = (r.terms as any) ?? {}
  const rows: [string, string][] = []
  if (r.lead_investor) rows.push(["Lead", r.lead_investor])
  rows.push(["Security", r.security_type ?? "—"])
  if (r.security_type === "Priced equity") {
    if (r.pre_money != null) rows.push(["Pre-money", fmtMoney(r.pre_money)])
    if (r.post_money != null) rows.push(["Post-money", fmtMoney(r.post_money)])
    if (r.price_per_share != null) rows.push(["Price / share", `$${Number(r.price_per_share).toLocaleString(undefined, { minimumFractionDigits: 2 })}`])
  } else {
    if (terms.valuation_cap) rows.push(["Valuation cap", fmtMoney(parseNum(String(terms.valuation_cap)))])
    if (terms.discount) rows.push(["Discount", `${terms.discount}%`])
    if (r.security_type === "Convertible note") {
      if (terms.interest_rate) rows.push(["Interest", `${terms.interest_rate}% ${terms.interest_type || ""}`.trim()])
      if (terms.maturity_date) rows.push(["Maturity", monthYear(String(terms.maturity_date))])
      if (terms.warrant_coverage) rows.push(["Warrants", `${terms.warrant_coverage}%`])
    }
    if (r.security_type === "SAFE") {
      if (terms.cap_type) rows.push(["Cap type", String(terms.cap_type)])
      if (terms.mfn) rows.push(["MFN", "Yes"])
      if (terms.pro_rata) rows.push(["Pro-rata", "Yes"])
    }
  }
  return (
    <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 pt-2">
      {rows.map(([k, v]) => (
        <div key={k}>
          <span className="text-[11px] text-slate-400 block">{k}</span>
          <span className="text-sm text-slate-700">{v}</span>
        </div>
      ))}
      {r.notes && <div className="col-span-3"><span className="text-[11px] text-slate-400 block">Notes</span><span className="text-sm text-slate-600">{r.notes}</span></div>}
    </div>
  )
}

// ─── round editor (create + edit, security-aware) ─────────────────────────────
function RoundEditor({
  companyId, initial, initialPositions, funds, onDone, onCancel,
}: {
  companyId: string
  initial?: PortfolioFundraiseRound
  initialPositions: Staged[]
  funds: string[]
  onDone: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const isNew = !initial
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const it = (initial?.terms as any) ?? {}
  const [f, setF] = useState({
    round_name: initial?.round_name ?? "",
    security_type: initial?.security_type ?? "Priced equity",
    date: initial?.date ?? "",
    lead_investor: initial?.lead_investor ?? "",
    round_size: numToStr(initial?.round_size),
    pre_money: numToStr(initial?.pre_money),
    post_money: numToStr(initial?.post_money),
    price_per_share: numToStr(initial?.price_per_share),
    status: initial?.status ?? "Unconverted",
    notes: initial?.notes ?? "",
    interest_rate: termStr(it, "interest_rate"),
    interest_type: termStr(it, "interest_type") || "Simple",
    maturity_date: termStr(it, "maturity_date"),
    discount: termStr(it, "discount"),
    valuation_cap: termStr(it, "valuation_cap"),
    cap_type: termStr(it, "cap_type") || "Post-money",
    warrant_coverage: termStr(it, "warrant_coverage"),
    mfn: !!it.mfn,
    pro_rata: !!it.pro_rata,
  })
  const [posList, setPosList] = useState<Staged[]>(initialPositions)
  const [keyCounter, setKeyCounter] = useState(initialPositions.length)

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }
  const sec = f.security_type
  const isEquity = sec === "Priced equity"
  const isNote = sec === "Convertible note"
  const isSafe = sec === "SAFE"
  const roundSizeLabel = isNote ? "Principal" : "Round size"

  function addPos() {
    setPosList((p) => [...p, { _k: keyCounter, fund: funds[0] ?? "", invested_amount: "", shares: "", ownership_pct: "", accrued_interest: "", fair_value: "", fair_value_date: "", fair_value_source: "" }])
    setKeyCounter((c) => c + 1)
  }
  function setPos(k: number, key: keyof Staged, v: string) {
    setPosList((p) => p.map((x) => (x._k === k ? { ...x, [key]: v } : x)))
  }
  function removePos(k: number) { setPosList((p) => p.filter((x) => x._k !== k)) }

  async function save() {
    if (!f.round_name.trim()) return
    setSaving(true)
    setError("")

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
    if (isSafe) {
      terms.cap_type = f.cap_type
      terms.mfn = f.mfn
      terms.pro_rata = f.pro_rata
    }

    const payload = {
      company_id: companyId,
      round_name: f.round_name.trim(),
      security_type: f.security_type,
      date: f.date || null,
      lead_investor: f.lead_investor || null,
      round_size: parseNum(f.round_size),
      pre_money: isEquity ? parseNum(f.pre_money) : null,
      post_money: isEquity ? parseNum(f.post_money) : null,
      price_per_share: isEquity ? parseNum(f.price_per_share) : null,
      status: isNote || isSafe ? f.status : null,
      terms,
      notes: f.notes || null,
      // keep legacy free-text amount in sync for older views
      amount: f.round_size ? fmtMoney(parseNum(f.round_size)) : (initial?.amount ?? null),
    }

    let roundId = initial?.id
    if (isNew) {
      const { data, error: e } = await supabase.from("portfolio_fundraise_rounds").insert(payload).select().single()
      if (e) { setError(saveHint(e.message)); setSaving(false); return }
      roundId = (data as PortfolioFundraiseRound | null)?.id
    } else {
      const { error: e } = await supabase.from("portfolio_fundraise_rounds").update(payload).eq("id", initial!.id)
      if (e) { setError(saveHint(e.message)); setSaving(false); return }
    }

    if (roundId) {
      // sync positions: replace all for this round
      await supabase.from("portfolio_positions").delete().eq("round_id", roundId)
      const rows = posList
        .filter((p) => p.fund || p.invested_amount || p.shares || p.ownership_pct || p.fair_value)
        .map((p) => ({
          company_id: companyId,
          round_id: roundId,
          fund: p.fund || null,
          invested_amount: parseNum(p.invested_amount),
          shares: parseNum(p.shares),
          ownership_pct: parseNum(p.ownership_pct),
          accrued_interest: isNote ? parseNum(p.accrued_interest) : null,
          fair_value: parseNum(p.fair_value),
          fair_value_date: p.fair_value_date || null,
          fair_value_source: p.fair_value_source || null,
        }))
      if (rows.length) {
        const { error: e } = await supabase.from("portfolio_positions").insert(rows)
        if (e) { setError(saveHint(e.message)); setSaving(false); return }
      }
    }

    setSaving(false)
    onDone()
  }

  const color = SECURITY_COLOR[sec] ?? "#94a3b8"

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      {isNew && <p className="text-sm font-semibold text-slate-700">New round</p>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Round name *">
          <input placeholder="e.g. Series B" value={f.round_name} onChange={(e) => set("round_name", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Security">
          <select value={f.security_type} onChange={(e) => set("security_type", e.target.value)} className={inputCls}>
            {SECURITY_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" value={f.date} onChange={(e) => set("date", e.target.value)} className={inputCls} />
        </Field>

        <Field label={roundSizeLabel}>
          <input placeholder="$" value={f.round_size} onChange={(e) => set("round_size", e.target.value)} className={inputCls} />
        </Field>

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
          <Field label="Interest rate (%)"><input placeholder="6.0" value={f.interest_rate} onChange={(e) => set("interest_rate", e.target.value)} className={inputCls} /></Field>
          <Field label="Interest type">
            <select value={f.interest_type} onChange={(e) => set("interest_type", e.target.value)} className={inputCls}>
              <option>Simple</option><option>Compound</option>
            </select>
          </Field>
          <Field label="Maturity date"><input type="date" value={f.maturity_date} onChange={(e) => set("maturity_date", e.target.value)} className={inputCls} /></Field>
          <Field label="Warrant coverage (%)"><input placeholder="10" value={f.warrant_coverage} onChange={(e) => set("warrant_coverage", e.target.value)} className={inputCls} /></Field>
        </>}

        {isSafe && (
          <Field label="Cap type">
            <select value={f.cap_type} onChange={(e) => set("cap_type", e.target.value)} className={inputCls}>
              <option>Post-money</option><option>Pre-money</option>
            </select>
          </Field>
        )}

        <Field label="Lead investor"><input placeholder="e.g. Slate Path" value={f.lead_investor} onChange={(e) => set("lead_investor", e.target.value)} className={inputCls} /></Field>

        {(isNote || isSafe) && (
          <Field label="Status">
            <select value={f.status} onChange={(e) => set("status", e.target.value)} className={inputCls}>
              <option>Unconverted</option><option>Converted</option>
            </select>
          </Field>
        )}
      </div>

      {isSafe && (
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.mfn} onChange={(e) => set("mfn", e.target.checked)} /> MFN</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.pro_rata} onChange={(e) => set("pro_rata", e.target.checked)} /> Pro-rata</label>
        </div>
      )}

      {(isNote || isSafe) && (
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-white border border-slate-100 rounded-lg px-3 py-2">
          <ArrowRightCircle className="w-3.5 h-3.5 shrink-0" style={{ color }} />
          Converts on the next qualified priced round — at the better of the discount or the valuation cap. Conversion math lands in a later phase.
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} resize-none`} />
      </div>

      {/* nested positions */}
      <div className="pt-1">
        <p className="text-[11px] text-slate-400 mb-1.5">Solas positions in this round</p>
        <div className="space-y-2">
          {posList.map((p) => (
            <div key={p._k} className="border border-slate-100 rounded-lg p-2 bg-white space-y-2">
              <div className="grid grid-cols-12 gap-2 items-center">
                <select value={p.fund} onChange={(e) => setPos(p._k, "fund", e.target.value)} className={`${inputCls} col-span-3`}>
                  <option value="">Fund…</option>
                  {funds.map((fd) => <option key={fd} value={fd}>{fd}</option>)}
                </select>
                <input placeholder="$ invested" value={p.invested_amount} onChange={(e) => setPos(p._k, "invested_amount", e.target.value)} className={`${inputCls} col-span-3`} />
                <input placeholder="Shares" value={p.shares} onChange={(e) => setPos(p._k, "shares", e.target.value)} className={`${inputCls} col-span-2`} />
                <input placeholder="Own %" value={p.ownership_pct} onChange={(e) => setPos(p._k, "ownership_pct", e.target.value)} className={`${inputCls} col-span-2`} />
                {isNote ? (
                  <input placeholder="Accrued $" value={p.accrued_interest} onChange={(e) => setPos(p._k, "accrued_interest", e.target.value)} className={`${inputCls} col-span-1`} />
                ) : <span className="col-span-1" />}
                <button onClick={() => removePos(p._k)} className="col-span-1 flex justify-center text-slate-300 hover:text-red-500 transition"><Trash2 className="w-4 h-4" /></button>
              </div>
              <div className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-3 text-[11px] text-slate-400 pl-1">Fair-value mark</span>
                <input placeholder="$ fair value" value={p.fair_value} onChange={(e) => setPos(p._k, "fair_value", e.target.value)} className={`${inputCls} col-span-3`} />
                <input type="date" value={p.fair_value_date} onChange={(e) => setPos(p._k, "fair_value_date", e.target.value)} className={`${inputCls} col-span-3`} />
                <input placeholder="Source (e.g. audited financials)" value={p.fair_value_source} onChange={(e) => setPos(p._k, "fair_value_source", e.target.value)} className={`${inputCls} col-span-3`} />
              </div>
            </div>
          ))}
        </div>
        <button onClick={addPos} className="mt-2 flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition">
          <Plus className="w-3.5 h-3.5" /> Add Solas position
        </button>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
        <button onClick={save} disabled={saving || !f.round_name.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition" style={{ backgroundColor: "#023a51" }}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save round
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      {children}
    </div>
  )
}


// ─── valuation mark editor ────────────────────────────────────────────────────
function MarkEditor({
  companyId, initial, onDone, onCancel,
}: {
  companyId: string
  initial?: PortfolioValuationMark
  onDone: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const isNew = !initial
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [f, setF] = useState({
    as_of_date: initial?.as_of_date ?? "",
    valuation: numToStr(initial?.valuation),
    basis: initial?.basis ?? VALUATION_BASES[0],
    notes: initial?.notes ?? "",
  })
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  async function save() {
    if (!f.valuation.trim()) { setError("Enter a valuation amount."); return }
    setSaving(true)
    setError("")
    const payload = {
      company_id: companyId,
      as_of_date: f.as_of_date || null,
      valuation: parseNum(f.valuation),
      basis: f.basis || null,
      notes: f.notes || null,
    }
    const q = isNew
      ? supabase.from("portfolio_valuation_marks").insert(payload)
      : supabase.from("portfolio_valuation_marks").update(payload).eq("id", initial!.id)
    const { error: e } = await q
    if (e) { setError(saveHint(e.message)); setSaving(false); return }
    setSaving(false)
    onDone()
  }

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-3 gap-3">
        <Field label="As-of date"><input type="date" value={f.as_of_date} onChange={(e) => set("as_of_date", e.target.value)} className={inputCls} /></Field>
        <Field label="Valuation *"><input placeholder="$ implied post-money" value={f.valuation} onChange={(e) => set("valuation", e.target.value)} className={inputCls} /></Field>
        <Field label="Basis">
          <select value={f.basis} onChange={(e) => set("basis", e.target.value)} className={inputCls}>
            {VALUATION_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} resize-none`} placeholder="Source / rationale for the mark" />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
        <button onClick={save} disabled={saving || !f.valuation.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition" style={{ backgroundColor: "#023a51" }}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save mark
        </button>
      </div>
    </div>
  )
}
