"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Loader2, ChevronDown, ChevronRight, Pencil, ArrowRightCircle } from "lucide-react"
import { DealFundraiseRound, SECURITY_TYPES } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { parseNum, numToStr, termStr, fmtMoney, fmtPct, saveHint, monthYear, SECURITY_COLOR, inputCls } from "@/lib/rounds"
import Field from "@/components/shared/Field"

// Fundraising rounds for a pipeline deal — the round they're raising now plus
// any prior rounds. No Solas positions: we don't hold the company yet. When the
// deal converts to portfolio, the Invest flow creates the portfolio round.
export default function DealFundraisingTab({ dealId }: { dealId: string }) {
  const supabase = createClient()
  const [rounds, setRounds] = useState<DealFundraiseRound[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId])

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("deal_fundraise_rounds").select("*").eq("deal_id", dealId).order("date", { ascending: false })
    setRounds((data as DealFundraiseRound[]) ?? [])
    setLoading(false)
  }

  async function handleDelete(id: string) {
    setError("")
    const { error: delErr } = await supabase.from("deal_fundraise_rounds").delete().eq("id", id)
    if (delErr) { setError(saveHint(delErr.message)); return }
    setRounds((prev) => prev.filter((r) => r.id !== id))
    if (editingId === id) setEditingId(null)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-slate-500">Rounds</span>
          <p className="text-xs text-slate-400">Current raise and prior rounds — type, size, and valuation terms.</p>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed rounded-lg text-sm transition shrink-0"
            style={{ color: "#023a51", borderColor: "#023a51" }}
          >
            <Plus className="w-3.5 h-3.5" /> Add round
          </button>
        )}
      </div>

      {adding && (
        <RoundEditor dealId={dealId} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      {rounds.length === 0 && !adding ? (
        <p className="text-center text-sm text-slate-400 py-6">No rounds recorded yet</p>
      ) : (
        <div className="space-y-2.5">
          {rounds.map((r) => {
            const isEditing = editingId === r.id
            const isOpen = expanded === r.id || isEditing
            const color = SECURITY_COLOR[r.security_type ?? ""] ?? "#94a3b8"
            const isConvertible = r.security_type === "SAFE" || r.security_type === "Convertible note"
            const sizeLabel = r.security_type === "Convertible note" ? "principal" : "round"
            return (
              <div key={r.id} className="border border-slate-200 rounded-xl bg-white overflow-hidden">
                <div className="flex items-center gap-2.5 px-4 py-3">
                  <button onClick={() => setExpanded(isOpen ? null : r.id)} className="text-slate-400 hover:text-slate-600 shrink-0">
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-sm font-semibold text-slate-800 shrink-0">{r.round_name}</span>
                  <span className="text-xs text-slate-400 flex-1 min-w-0 truncate">
                    {[
                      monthYear(r.date),
                      r.round_size != null ? `${sizeLabel} ${fmtMoney(r.round_size)}` : null,
                      r.pre_money != null ? `pre ${fmtMoney(r.pre_money)}` : null,
                      r.post_money != null ? `post ${fmtMoney(r.post_money)}` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                  {isConvertible && r.status && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: r.status === "Converted" ? "#eaf3de" : "#faece7", color: r.status === "Converted" ? "#3b6d11" : "#993c1d" }}>
                      {r.status}
                    </span>
                  )}
                </div>

                {isOpen && !isEditing && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                    <RoundDetails round={r} />
                    <div className="flex justify-end gap-2 pt-1">
                      <button onClick={() => handleDelete(r.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
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
                    <RoundEditor dealId={dealId} initial={r} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); load() }} />
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

function RoundDetails({ round: r }: { round: DealFundraiseRound }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const terms = (r.terms as any) ?? {}
  const rows: [string, string][] = []
  if (r.lead_investor) rows.push(["Lead", r.lead_investor])
  rows.push(["Security", r.security_type ?? "—"])
  rows.push([r.security_type === "Convertible note" ? "Principal" : "Total round", fmtMoney(r.round_size)])
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
  if (r.option_pool != null) rows.push(["Option pool", fmtPct(r.option_pool)])
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

function RoundEditor({
  dealId, initial, onDone, onCancel,
}: {
  dealId: string
  initial?: DealFundraiseRound
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
    option_pool: numToStr(initial?.option_pool),
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

  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }
  const sec = f.security_type
  const isEquity = sec === "Priced equity"
  const isNote = sec === "Convertible note"
  const isSafe = sec === "SAFE"
  const roundSizeLabel = isNote ? "Principal" : "Total round size"

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
      deal_id: dealId,
      round_name: f.round_name.trim(),
      security_type: f.security_type,
      date: f.date || null,
      lead_investor: f.lead_investor || null,
      round_size: parseNum(f.round_size),
      pre_money: isEquity ? parseNum(f.pre_money) : null,
      post_money: isEquity ? parseNum(f.post_money) : null,
      option_pool: parseNum(f.option_pool),
      price_per_share: isEquity ? parseNum(f.price_per_share) : null,
      status: isNote || isSafe ? f.status : null,
      terms,
      notes: f.notes || null,
    }

    const q = isNew
      ? supabase.from("deal_fundraise_rounds").insert(payload)
      : supabase.from("deal_fundraise_rounds").update(payload).eq("id", initial!.id)
    const { error: e } = await q
    if (e) { setError(saveHint(e.message)); setSaving(false); return }
    setSaving(false)
    onDone()
  }

  const color = SECURITY_COLOR[sec] ?? "#94a3b8"

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      {isNew && <p className="text-sm font-semibold text-slate-700">New round</p>}
      <div className="grid grid-cols-3 gap-3">
        <Field label="Round name *">
          <input placeholder="e.g. Series A" value={f.round_name} onChange={(e) => set("round_name", e.target.value)} className={inputCls} />
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

        <Field label="Option pool (%)">
          <input placeholder="10" value={f.option_pool} onChange={(e) => set("option_pool", e.target.value)} className={inputCls} />
        </Field>

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
          Converts on the next qualified priced round — at the better of the discount or the valuation cap.
        </div>
      )}

      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} resize-none`} />
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
