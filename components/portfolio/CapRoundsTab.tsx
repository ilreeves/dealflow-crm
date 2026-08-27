"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Loader2, Pencil, TrendingUp } from "lucide-react"
import { PortfolioFundraiseRound, PortfolioPosition, PortfolioValuationMark, VALUATION_BASES } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { parseNum, numToStr, fmtMoney, fmtPct, saveHint, exactDate, valueColor, inputCls } from "@/lib/rounds"
import { latestValuation, positionValue } from "@/lib/portfolio"
import Field from "@/components/shared/Field"

// Our valuation view: what Solas has in, what it's worth now, and the interim
// marks that drive it. The company's financing rounds (and the positions nested
// under them) live in the Fundraising tab.
export default function CapRoundsTab({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const [rounds, setRounds] = useState<PortfolioFundraiseRound[]>([])
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [marks, setMarks] = useState<PortfolioValuationMark[]>([])
  const [loading, setLoading] = useState(true)
  const [addingMark, setAddingMark] = useState(false)
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null)
  const [markError, setMarkError] = useState("")

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  async function load() {
    setLoading(true)
    const [{ data: rd }, { data: ps }, { data: mk }] = await Promise.all([
      supabase.from("portfolio_fundraise_rounds").select("*").eq("company_id", companyId).order("date", { ascending: false }),
      supabase.from("portfolio_positions").select("*").eq("company_id", companyId),
      supabase.from("portfolio_valuation_marks").select("*").eq("company_id", companyId).order("as_of_date", { ascending: false }),
    ])
    setRounds((rd as PortfolioFundraiseRound[]) ?? [])
    setPositions((ps as PortfolioPosition[]) ?? [])
    setMarks((mk as PortfolioValuationMark[]) ?? [])
    setLoading(false)
  }

  // A look-through row is a fund's interest in a vehicle whose position we also
  // hold at vehicle level — the same economics twice. Excluded from the company
  // totals below, exactly as fund-performance excludes them portfolio-wide, so a
  // position isn't counted once at the fund and again at the vehicle. Basking is
  // the example: EHF's $3.5M is capital *into* Basking Holdings, whose own
  // $9.01M position is the real exposure.
  const ownPositions = positions.filter((p) => !p.lookthrough_of)
  const lookthroughPositions = positions.filter((p) => p.lookthrough_of)
  const lookthroughInvested = lookthroughPositions.reduce((s, p) => s + (Number(p.invested_amount) || 0), 0)
  const totalInvested = ownPositions.reduce((s, p) => s + (Number(p.invested_amount) || 0), 0)
  const ownership = ownPositions.reduce((s, p) => s + (Number(p.ownership_pct) || 0), 0)
  // Both resolutions live in lib/portfolio.ts — the SAME functions Fund
  // Performance uses, so this tab can't drift out of agreement with it.
  const valuation = latestValuation(rounds, marks)
  const currentValue = (() => {
    if (!ownPositions.length) return null
    let total = 0
    let any = false
    for (const p of ownPositions) {
      const v = positionValue(p, valuation)
      if (v == null) continue
      total += v
      any = true
    }
    return any ? total : null
  })()
  const moic = currentValue != null && totalInvested > 0 ? currentValue / totalInvested : null

  async function handleDeleteMark(id: string) {
    setMarkError("")
    const { error: e } = await supabase.from("portfolio_valuation_marks").delete().eq("id", id)
    if (e) { setMarkError(saveHint(e.message)); return }
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
        <Stat label="Current value" value={fmtMoney(currentValue)} accent={valueColor(currentValue, totalInvested)} />
        <Stat label="Ownership" value={fmtPct(ownership)} />
        <Stat label="MOIC" value={moic != null ? `${moic.toFixed(2)}×` : "—"} />
      </div>
      <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
        {currentValue == null
          ? "Add a round post-money (Fundraising tab), a valuation mark, or a position fair value to compute current value."
          : "Value uses the most recent mark per position — a position fair value, or ownership × company valuation, whichever is newer. Unrealized."}
      </p>
      {lookthroughInvested > 0 && (
        <p className="text-xs text-slate-400 -mt-2.5 px-0.5">
          Excludes {fmtMoney(lookthroughInvested)} invested via{" "}
          {Array.from(new Set(lookthroughPositions.map((p) => p.lookthrough_of))).join(", ")} — that capital is
          counted once, at the vehicle, so it isn&apos;t added on top of the vehicle&apos;s own position.
        </p>
      )}

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
        {markError && <p className="text-sm text-red-600 bg-red-50 mx-4 mb-2.5 px-3 py-2 rounded-lg">{markError}</p>}
        {marks.length > 0 && (
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            {marks.map((m) => (
              editingMarkId === m.id ? (
                <div key={m.id}><MarkEditor companyId={companyId} initial={m} onCancel={() => setEditingMarkId(null)} onDone={() => { setEditingMarkId(null); load() }} /></div>
              ) : (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-sm group">
                  <span className="text-slate-400 text-xs w-28 shrink-0">{m.as_of_date ? exactDate(m.as_of_date) : "—"}</span>
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
