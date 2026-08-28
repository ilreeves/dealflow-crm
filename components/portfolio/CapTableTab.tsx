"use client"

import { useState, useEffect } from "react"
import { Plus, Trash2, Loader2, Pencil, Layers, ChevronDown, ChevronRight, TrendingDown } from "lucide-react"
import { PortfolioCompany, PortfolioShareClass, PortfolioClassHolding, PortfolioPosition, SHARE_CLASS_TYPES } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { parseNum, numToStr, fmtMoney, fmtPct, saveHint, inputCls } from "@/lib/rounds"
import Field from "@/components/shared/Field"

// Share-class structure: Common, each preferred series, the option pool —
// shares, price, preference. Deliberately STANDALONE from positions:
// ownership_pct stays hand-entered and keeps driving Fund Performance, so a
// half-filled cap table can never silently move AUM. When both sides have
// enough data to compare, a mismatch between the computed fully-diluted % and
// the entered ownership % is flagged below instead of auto-corrected.
export type ShareClassWithHoldings = PortfolioShareClass & { portfolio_class_holdings: PortfolioClassHolding[] }

export default function CapTableTab({ company, onCompanyUpdated }: {
  company: PortfolioCompany
  onCompanyUpdated: (c: PortfolioCompany) => void
}) {
  const supabase = createClient()
  const [classes, setClasses] = useState<ShareClassWithHoldings[]>([])
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id])

  async function load() {
    setLoading(true)
    const [scRes, psRes] = await Promise.all([
      // Preference-stack order: seniority 1 first, then the null-seniority rows
      // (common, pool) last — Postgres sorts nulls last ascending by default.
      supabase.from("portfolio_share_classes").select("*, portfolio_class_holdings(*)").eq("company_id", company.id).order("seniority").order("name"),
      supabase.from("portfolio_positions").select("*").eq("company_id", company.id),
    ])
    // A failed read must not render as an empty cap table — someone would
    // re-key the classes on top of it. Most likely failure: the migration
    // hasn't been run, which saveHint turns into "run migration_cap_table.sql".
    const loadErr = scRes.error ?? psRes.error
    if (loadErr) setError(saveHint(loadErr.message))
    setClasses((scRes.data as ShareClassWithHoldings[]) ?? [])
    setPositions((psRes.data as PortfolioPosition[]) ?? [])
    setLoading(false)
  }

  // Same exclusion as the Ownership tab and Fund Performance: a look-through
  // row duplicates economics held at vehicle level.
  const ownPositions = positions.filter((p) => !p.lookthrough_of)

  const fdShares = classes.reduce((s, c) => s + (Number(c.shares_outstanding) || 0), 0)
  // Implied value only covers classes that carry BOTH a share count and a
  // price; the footnote says so when coverage is partial.
  const pricedClasses = classes.filter((c) => c.shares_outstanding != null && c.price_per_share != null)
  const impliedValue = pricedClasses.length
    ? pricedClasses.reduce((s, c) => s + Number(c.shares_outstanding) * Number(c.price_per_share), 0)
    : null
  const solasShares = ownPositions.reduce((s, p) => s + (Number(p.shares) || 0), 0)
  const solasFdPct = fdShares > 0 && solasShares > 0 ? (solasShares / fdShares) * 100 : null
  const enteredPct = ownPositions.reduce((s, p) => s + (Number(p.ownership_pct) || 0), 0)
  // Flag, don't fix — and on a mismatch the AUDITED figure (positions, from the
  // fund audit) stands; the computed FD % is reference. Decided 2026-08-27.
  const mismatch = solasFdPct != null && enteredPct > 0 ? Math.abs(solasFdPct - enteredPct) > 0.5 : false
  // Unconverted notes/SAFEs are carried as share-less rows, so they sit OUTSIDE
  // the FD denominator — the usual reason the two figures legitimately differ.
  const hasConvertibles = classes.some((c) => c.shares_outstanding == null)

  async function saveAsOf(date: string) {
    setError("")
    const cap_table_as_of = date || null
    const { error: e } = await supabase.from("portfolio_companies").update({ cap_table_as_of }).eq("id", company.id)
    if (e) { setError(saveHint(e.message)); return }
    onCompanyUpdated({ ...company, cap_table_as_of })
  }

  async function handleDelete(id: string) {
    setError("")
    const { error: e } = await supabase.from("portfolio_share_classes").delete().eq("id", id)
    if (e) { setError(saveHint(e.message)); return }
    setClasses((prev) => prev.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  }

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Rendered inside the Ownership tab, below positions and marks — the
          heading separates the company's structure from Solas's stake above. */}
      <h3 className="text-sm font-semibold text-slate-700 pt-2 border-t border-slate-100">Cap table</h3>
      {/* Structure stat cards */}
      <div className="grid grid-cols-4 gap-2.5">
        <Stat label="Fully diluted" value={fmtShares(fdShares || null)} />
        <Stat label="Implied value" value={fmtMoney(impliedValue)} />
        <Stat label="Solas shares" value={fmtShares(solasShares || null)} />
        <Stat label="Solas FD %" value={fmtPct(solasFdPct)} />
      </div>
      <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
        {classes.length === 0
          ? "Add the share classes from the company's cap table to compute fully diluted totals."
          : pricedClasses.length < classes.filter((c) => c.shares_outstanding != null).length
            ? "Implied value covers only the classes that have a price per share."
            : "Implied value = Σ shares × price per class. Solas FD % = Solas shares ÷ fully diluted."}
      </p>
      {mismatch && (
        <p className="text-xs px-3 py-2 rounded-lg -mt-1.5" style={{ backgroundColor: "#fef3e6", color: "#9a5b13" }}>
          Computed FD % ({fmtPct(solasFdPct)}) differs from the audited ownership on positions ({fmtPct(enteredPct)}).
          <span className="font-medium"> The audited figure stands</span> — it drives all valuations; this cap table is reference.
          {hasConvertibles
            ? " Likely cause: the unconverted convertibles below sit outside the fully diluted share count."
            : " Likely cause: a stale cap table, or ownership stated on a different basis (outstanding vs fully diluted)."}
        </p>
      )}

      {/* Share classes */}
      <div className="border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Share classes</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-400">
              as of
              <input
                type="date"
                value={company.cap_table_as_of ?? ""}
                onChange={(e) => saveAsOf(e.target.value)}
                className="px-1.5 py-0.5 text-xs border border-slate-200 rounded-md text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-400"
              />
            </label>
          </div>
          {!adding && !editingId && (
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 transition">
              <Plus className="w-3.5 h-3.5" /> Add class
            </button>
          )}
        </div>
        {adding && (
          <div className="border-t border-slate-100">
            <ClassEditor companyId={company.id} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 mx-4 mb-2.5 px-3 py-2 rounded-lg">{error}</p>}
        {classes.length > 0 && (
          <div className="border-t border-slate-100 divide-y divide-slate-50">
            {classes.map((c) => (
              editingId === c.id ? (
                <div key={c.id}><ClassEditor companyId={company.id} initial={c} onCancel={() => setEditingId(null)} onDone={() => { setEditingId(null); load() }} /></div>
              ) : (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 text-sm group">
                  <span className="font-medium text-slate-800 w-36 shrink-0 truncate">{c.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: "#e6eef1", color: "#023a51" }}>{c.class_type}</span>
                  <span className="text-slate-600 shrink-0 w-24 text-right tabular-nums">
                    {c.shares_outstanding != null ? fmtShares(c.shares_outstanding) : c.convertible_balance != null ? fmtMoney(c.convertible_balance) : "—"}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0 w-12 text-right tabular-nums">
                    {fdShares > 0 && c.shares_outstanding != null ? fmtPct((Number(c.shares_outstanding) / fdShares) * 100) : "—"}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0 w-20 text-right tabular-nums">{fmtPrice(c.price_per_share)}</span>
                  <span className="text-xs text-slate-400 shrink-0 w-10 text-right">{c.liq_pref_multiple != null ? `${Number(c.liq_pref_multiple)}×` : ""}</span>
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-400">{c.notes}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                    <button onClick={() => { setEditingId(c.id); setAdding(false) }} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
        {classes.length === 0 && !adding && (
          <p className="text-sm text-slate-400 text-center border-t border-slate-100 px-4 py-6">
            No share classes recorded. Structure only — Common, each preferred series, the option pool. No per-holder ledger.
          </p>
        )}
      </div>

      {classes.some((c) => c.shares_outstanding != null) && <WaterfallSection classes={classes} impliedValue={impliedValue} />}

      <p className="text-xs text-slate-400 text-center">
        Solas positions and ownership % live in the <span className="font-medium text-slate-500">Fundraising</span> tab and are the source of truth for valuations.
      </p>
    </div>
  )
}

function fmtShares(n: number | null | undefined): string {
  return n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })
}

// Per-share prices carry real sub-cent precision (e.g. Francis's ladder), so
// unlike fmtMoney this keeps up to 4 decimals and never abbreviates to K/M.
function fmtPrice(n: number | null | undefined): string {
  return n == null || isNaN(Number(n)) ? "—" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 4 })}`
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 text-slate-900">{value}</p>
    </div>
  )
}

// ─── share class editor ───────────────────────────────────────────────────────
function ClassEditor({
  companyId, initial, onDone, onCancel,
}: {
  companyId: string
  initial?: ShareClassWithHoldings
  onDone: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const isNew = !initial
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  // Per-entity Solas holdings in this class ("Fund II", "Cryosa Sidecar", …).
  // Saved wholesale on class save: delete-and-reinsert, so removing a row here
  // removes it in the database too.
  const [holdings, setHoldings] = useState<{ entity: string; shares: string }[]>(
    (initial?.portfolio_class_holdings ?? [])
      .slice()
      .sort((a, b) => Number(b.shares) - Number(a.shares))
      .map((h) => ({ entity: h.entity, shares: numToStr(h.shares) })),
  )
  const [f, setF] = useState({
    name: initial?.name ?? "",
    class_type: initial?.class_type ?? SHARE_CLASS_TYPES[0],
    shares_outstanding: numToStr(initial?.shares_outstanding),
    price_per_share: numToStr(initial?.price_per_share),
    liq_pref_multiple: numToStr(initial?.liq_pref_multiple),
    seniority: numToStr(initial?.seniority),
    participating: initial?.participating === true,
    convertible_balance: numToStr(initial?.convertible_balance),
    conversion_price: numToStr(initial?.conversion_price),
    notes: initial?.notes ?? "",
  })
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  async function save() {
    if (!f.name.trim()) { setError("Enter a class name."); return }
    setSaving(true)
    setError("")
    const payload = {
      company_id: companyId,
      name: f.name.trim(),
      class_type: f.class_type,
      shares_outstanding: parseNum(f.shares_outstanding),
      price_per_share: parseNum(f.price_per_share),
      liq_pref_multiple: parseNum(f.liq_pref_multiple),
      seniority: parseNum(f.seniority),
      participating: f.participating || null,
      convertible_balance: f.class_type === "Other" ? parseNum(f.convertible_balance) : null,
      conversion_price: f.class_type === "Other" ? parseNum(f.conversion_price) : null,
      notes: f.notes || null,
    }
    let classId = initial?.id
    if (isNew) {
      const { data, error: e } = await supabase.from("portfolio_share_classes").insert(payload).select("id").single()
      if (e || !data) { setError(saveHint(e?.message ?? "insert returned no row")); setSaving(false); return }
      classId = (data as { id: string }).id
    } else {
      const { error: e } = await supabase.from("portfolio_share_classes").update(payload).eq("id", classId!)
      if (e) { setError(saveHint(e.message)); setSaving(false); return }
    }
    // Holdings are replaced wholesale — the editor rows ARE the state.
    const rows = holdings
      .map((h) => ({ class_id: classId!, entity: h.entity.trim(), shares: parseNum(h.shares) }))
      .filter((h) => h.entity && h.shares != null)
    const { error: delErr } = await supabase.from("portfolio_class_holdings").delete().eq("class_id", classId!)
    if (delErr) { setError(saveHint(delErr.message)); setSaving(false); return }
    if (rows.length) {
      const { error: insErr } = await supabase.from("portfolio_class_holdings").insert(rows)
      if (insErr) { setError(saveHint(insErr.message)); setSaving(false); return }
    }
    setSaving(false)
    onDone()
  }

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Class name *"><input placeholder="Series B Preferred" value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field>
        <Field label="Type">
          <select value={f.class_type} onChange={(e) => set("class_type", e.target.value as typeof f.class_type)} className={inputCls}>
            {SHARE_CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Shares outstanding"><input placeholder="e.g. 4,215,000" value={f.shares_outstanding} onChange={(e) => set("shares_outstanding", e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-4 gap-3">
        <Field label="Price per share"><input placeholder="$ (4 decimals ok)" value={f.price_per_share} onChange={(e) => set("price_per_share", e.target.value)} className={inputCls} /></Field>
        <Field label="Liq pref multiple">
          <div className="flex items-center gap-2">
            <input placeholder="1 = 1×" value={f.liq_pref_multiple} onChange={(e) => set("liq_pref_multiple", e.target.value)} className={inputCls} />
            <label className="flex items-center gap-1 text-xs text-slate-500 shrink-0" title="Takes its preference AND shares pro-rata">
              <input type="checkbox" checked={f.participating} onChange={(e) => set("participating", e.target.checked)} /> part.
            </label>
          </div>
        </Field>
        <Field label="Seniority"><input placeholder="1 = most senior" value={f.seniority} onChange={(e) => set("seniority", e.target.value)} className={inputCls} /></Field>
      </div>
      {f.class_type === "Other" && (
        <div className="grid grid-cols-4 gap-3">
          <Field label="Convertible balance ($)"><input placeholder="principal + accrued" value={f.convertible_balance} onChange={(e) => set("convertible_balance", e.target.value)} className={inputCls} /></Field>
          <Field label="Conversion price ($)"><input placeholder="blank = discount to last round" value={f.conversion_price} onChange={(e) => set("conversion_price", e.target.value)} className={inputCls} /></Field>
        </div>
      )}
      <div>
        <label className="block text-xs text-slate-500 mb-1">Solas holdings in this class — by entity, since several vehicles can hold the same company{f.class_type === "Other" && !f.shares_outstanding.trim() ? " (for a note row, enter DOLLARS of its balance)" : ""}</label>
        <div className="space-y-2">
          {holdings.map((h, i) => (
            <div key={i} className="flex items-center gap-2">
              <input placeholder="Entity (Fund II, EHF, Cryosa Sidecar…)" value={h.entity} onChange={(e) => setHoldings((prev) => prev.map((x, j) => (j === i ? { ...x, entity: e.target.value } : x)))} className={inputCls} />
              <input placeholder="Shares" value={h.shares} onChange={(e) => setHoldings((prev) => prev.map((x, j) => (j === i ? { ...x, shares: e.target.value } : x)))} className={inputCls} />
              <button onClick={() => setHoldings((prev) => prev.filter((_, j) => j !== i))} className="p-1.5 text-slate-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
          <button onClick={() => setHoldings((prev) => [...prev, { entity: "", shares: "" }])} className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 transition">
            <Plus className="w-3.5 h-3.5" /> Add entity
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} className={`${inputCls} resize-none`} placeholder="Participation, conversion terms, source document" />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
        <button onClick={save} disabled={saving || !f.name.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition" style={{ backgroundColor: "#023a51" }}>
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save class
        </button>
      </div>
    </div>
  )
}

// ─── quick waterfall ──────────────────────────────────────────────────────────
// DIRECTIONAL, not a legal waterfall. Class-level, non-participating
// convert-or-take. Where the data is silent the assumptions are: liq pref
// defaults to 1× when a preferred class has a price but no stated multiple;
// preferred with NO price on file has no computable preference and is treated
// as-converted; options/warrants count as shares with strikes ignored;
// share-less rows (unconverted notes/SAFEs) are not modeled at all. Every
// assumption is tagged on the row it applies to.

type WaterfallRow = {
  id: string
  name: string
  shares: number
  /** Denominator for holdings fractions: shares, except note rows where holdings are entered as DOLLARS of balance. */
  unitTotal: number
  solas: number
  prefBasis: number | null
  participating: boolean
  seniority: number | null
  payout: number
  mode: "preference" | "partial preference" | "participating" | "converted" | "as-converted" | "wiped"
  assumed: string | null
}

function computeWaterfall(exitValue: number, classes: ShareClassWithHoldings[], noteDiscount: number): WaterfallRow[] {
  const rows: WaterfallRow[] = classes
    .filter((c) => c.shares_outstanding != null && Number(c.shares_outstanding) > 0)
    .map((c) => {
      const shares = Number(c.shares_outstanding)
      const hasPref = c.class_type === "Preferred" && c.price_per_share != null
      const mult = c.liq_pref_multiple != null ? Number(c.liq_pref_multiple) : 1
      return {
        id: c.id,
        name: c.name,
        shares,
        unitTotal: shares,
        solas: c.portfolio_class_holdings.reduce((t, h) => t + (Number(h.shares) || 0), 0),
        prefBasis: hasPref ? shares * Number(c.price_per_share) * mult : null,
        participating: hasPref && c.participating === true,
        seniority: c.seniority,
        payout: 0,
        mode: (hasPref ? "preference" : "as-converted") as WaterfallRow["mode"],
        assumed:
          c.class_type === "Preferred" && c.price_per_share == null
            ? "no price on file — treated as-converted, no preference"
            : hasPref && c.liq_pref_multiple == null
              ? "1× multiple assumed"
              : c.class_type === "Option pool" || c.class_type === "Warrants"
                ? "strike ignored"
                : null,
      }
    })

  // ── Unconverted notes/SAFEs (share-less rows with a balance) ──
  // Modeled as a most-senior preferred whose basis is its balance × multiple:
  // convert-or-take then gives the note its debt-like floor at low exits and
  // conversion upside at high ones. Conversion price = documented terms when
  // stated, else the given discount to the LAST ROUND price (the most senior
  // priced preferred). Holdings on note rows are entered as DOLLARS of balance,
  // so unitTotal is the balance rather than the share count.
  const pricedPref = classes.filter((c) => c.class_type === "Preferred" && c.price_per_share != null && c.shares_outstanding != null)
  const lastRound = pricedPref
    .slice()
    .sort((a, b) => (a.seniority ?? 99) - (b.seniority ?? 99) || Number(b.price_per_share) - Number(a.price_per_share))[0]
  const refPrice = lastRound ? Number(lastRound.price_per_share) : null
  for (const c of classes) {
    if (c.shares_outstanding != null) continue
    const balance = Number(c.convertible_balance)
    if (!(balance > 0)) continue
    const documented = c.conversion_price != null ? Number(c.conversion_price) : null
    const convPrice = documented ?? (refPrice != null ? refPrice * (1 - noteDiscount) : null)
    if (convPrice == null || convPrice <= 0) continue
    const mult = c.liq_pref_multiple != null ? Number(c.liq_pref_multiple) : 1
    rows.push({
      id: c.id,
      name: c.name,
      shares: balance / convPrice,
      unitTotal: balance,
      solas: c.portfolio_class_holdings.reduce((t, h) => t + (Number(h.shares) || 0), 0),
      prefBasis: balance * mult,
      participating: c.participating === true,
      seniority: c.seniority ?? 0, // debt-like: ahead of the preferred stack unless told otherwise
      payout: 0,
      mode: "preference",
      assumed: documented != null
        ? `converts at ${fmtPrice(documented)} per note terms`
        : `assumed conversion at ${fmtPrice(convPrice)} — ${Math.round(noteDiscount * 100)}% discount to ${fmtPrice(refPrice)}`,
    })
  }
  if (exitValue <= 0 || rows.length === 0) return rows.map((r) => ({ ...r, mode: "wiped" }))

  const prefs = rows.filter((r) => r.prefBasis != null && !r.participating)
  // Participating preferred takes its preference AND shares pro-rata, so its
  // shares always sit in the pro-rata pool and its basis always comes off the top.
  const parts = rows.filter((r) => r.participating)
  const partBasis = parts.reduce((t, r) => t + r.prefBasis!, 0)
  const commonShares =
    rows.filter((r) => r.prefBasis == null).reduce((t, r) => t + r.shares, 0) +
    parts.reduce((t, r) => t + r.shares, 0)

  // Non-participating equilibrium: a preferred converts when its as-converted
  // share of the residual beats taking its preference. Converting one class
  // changes everyone's per-share, so iterate to a fixed point (≤ one pass per
  // class, and class counts are single digits).
  const converted = new Set<string>()
  for (let guard = 0; guard <= prefs.length; guard++) {
    const residual = exitValue - partBasis - prefs.filter((r) => !converted.has(r.id)).reduce((t, r) => t + r.prefBasis!, 0)
    const convShares = commonShares + prefs.filter((r) => converted.has(r.id)).reduce((t, r) => t + r.shares, 0)
    let changed = false
    for (const r of prefs) {
      if (converted.has(r.id)) continue
      // per-share if THIS class also converts (its basis returns to the pool)
      const perShareIf = convShares + r.shares > 0 ? Math.max(0, residual + r.prefBasis!) / (convShares + r.shares) : 0
      if (perShareIf * r.shares > r.prefBasis!) {
        converted.add(r.id)
        changed = true
        break // recompute pools before judging the next class
      }
    }
    if (!changed) break
  }

  const staying = prefs.filter((r) => !converted.has(r.id))
  const prefTotal = staying.reduce((t, r) => t + r.prefBasis!, 0) + partBasis

  if (exitValue < prefTotal) {
    // Not enough for the stack: pay preferences in seniority order (nulls
    // last), pro-rata by basis within a rank. Everyone else is wiped.
    let remaining = exitValue
    const inStack = [...staying, ...parts]
    const ranks = Array.from(new Set(inStack.map((r) => r.seniority ?? Infinity))).sort((a, b) => a - b)
    for (const rank of ranks) {
      const tier = inStack.filter((r) => (r.seniority ?? Infinity) === rank)
      const tierBasis = tier.reduce((t, r) => t + r.prefBasis!, 0)
      const pay = Math.min(remaining, tierBasis)
      for (const r of tier) {
        r.payout = tierBasis > 0 ? (pay * r.prefBasis!) / tierBasis : 0
        r.mode = r.payout + 0.01 < r.prefBasis! ? "partial preference" : "preference"
      }
      remaining -= pay
      if (remaining <= 0) break
    }
    for (const r of rows) if ((r.prefBasis == null || converted.has(r.id)) && !r.participating) { r.payout = 0; r.mode = "wiped" }
    return rows
  }

  const residual = exitValue - prefTotal
  const convShares = commonShares + prefs.filter((r) => converted.has(r.id)).reduce((t, r) => t + r.shares, 0)
  const perShare = convShares > 0 ? residual / convShares : 0
  for (const r of rows) {
    if (r.participating) { r.payout = r.prefBasis! + r.shares * perShare; r.mode = "participating" }
    else if (r.prefBasis != null && !converted.has(r.id)) { r.payout = r.prefBasis; r.mode = "preference" }
    else { r.payout = r.shares * perShare; r.mode = r.prefBasis != null ? "converted" : "as-converted" }
  }
  return rows
}

const MODE_STYLE: Record<WaterfallRow["mode"], { bg: string; fg: string }> = {
  preference: { bg: "#e6eef1", fg: "#023a51" },
  participating: { bg: "#e6eef1", fg: "#023a51" },
  "partial preference": { bg: "#fef3e6", fg: "#9a5b13" },
  converted: { bg: "#eaf3df", fg: "#3b6d11" },
  "as-converted": { bg: "#eaf3df", fg: "#3b6d11" },
  wiped: { bg: "#fdeaea", fg: "#993c1d" },
}

function WaterfallSection({ classes, impliedValue }: { classes: ShareClassWithHoldings[]; impliedValue: number | null }) {
  const [open, setOpen] = useState(false)
  const [exitStr, setExitStr] = useState("")

  const [discountStr, setDiscountStr] = useState("20")
  const exitValue = parseNum(exitStr) ?? 0
  const noteDiscount = Math.min(0.95, Math.max(0, (parseNum(discountStr) ?? 20) / 100))
  const rows = exitValue > 0 ? computeWaterfall(exitValue, classes, noteDiscount) : []
  const solasTotal = rows.reduce((t, r) => t + (r.unitTotal > 0 ? (r.payout * r.solas) / r.unitTotal : 0), 0)
  const anySolas = classes.some((c) => c.portfolio_class_holdings.length > 0)
  const modeledNotes = classes.filter((c) => c.shares_outstanding == null && Number(c.convertible_balance) > 0)
  const unmodeledNotes = classes.filter((c) => c.shares_outstanding == null && !(Number(c.convertible_balance) > 0))
  // Proceeds by Solas ENTITY across all classes — the same company is held via
  // several vehicles, and each receives cash at an exit regardless of carry.
  const byEntity = new Map<string, number>()
  for (const r of rows) {
    if (r.unitTotal <= 0) continue
    const cls = classes.find((c) => c.id === r.id)
    for (const h of cls?.portfolio_class_holdings ?? []) {
      const take = (r.payout * (Number(h.shares) || 0)) / r.unitTotal
      if (take > 0) byEntity.set(h.entity, (byEntity.get(h.entity) ?? 0) + take)
    }
  }
  const entityRows = Array.from(byEntity.entries()).sort((a, b) => b[1] - a[1])

  function openWith(v: number | null) {
    setOpen(true)
    if (!exitStr && v) setExitStr(String(Math.round(v)))
  }

  return (
    <div className="border border-slate-200 rounded-xl bg-white">
      <button onClick={() => (open ? setOpen(false) : openWith(impliedValue))} className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-slate-50 transition rounded-xl">
        <span className="text-slate-300">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
        <TrendingDown className="w-4 h-4 text-slate-400" />
        <span className="text-sm font-medium text-slate-600">Quick waterfall</span>
        <span className="text-xs text-slate-400">directional — 1× non-participating where terms are silent</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-3">
          <div className="flex items-end gap-3">
            <div className="w-56">
              <Field label="Exit value (total proceeds to equity)">
                <input placeholder="e.g. 200,000,000" value={exitStr} onChange={(e) => setExitStr(e.target.value)} className={inputCls} />
              </Field>
            </div>
            {modeledNotes.length > 0 && (
              <div className="w-28">
                <Field label="Note discount %">
                  <input value={discountStr} onChange={(e) => setDiscountStr(e.target.value)} className={inputCls} />
                </Field>
              </div>
            )}
            {impliedValue != null && (
              <div className="flex gap-1.5 pb-0.5">
                {([["implied", 1], ["2×", 2], ["5×", 5]] as const).map(([label, mult]) => (
                  <button key={label} onClick={() => setExitStr(String(Math.round(impliedValue * mult)))} className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-300 transition">
                    {label}
                  </button>
                ))}
              </div>
            )}
            {exitValue > 0 && anySolas && (
              <div className="ml-auto text-right pb-0.5">
                <p className="text-xs text-slate-400">Solas proceeds</p>
                <p className="text-lg font-semibold" style={{ color: "#3b6d11" }}>{fmtMoney(solasTotal)}</p>
              </div>
            )}
          </div>

          {exitValue > 0 && rows.length > 0 && (
            <div className="divide-y divide-slate-50 border-t border-slate-100">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center gap-3 py-2 text-[13px]">
                  <span className="w-56 shrink-0 truncate text-slate-700">
                    {r.name}
                    {r.assumed && <span className="text-slate-400 text-xs"> · {r.assumed}</span>}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: MODE_STYLE[r.mode].bg, color: MODE_STYLE[r.mode].fg }}>{r.mode}</span>
                  <span className="flex-1" />
                  <span className="text-slate-600 tabular-nums w-24 text-right">{fmtMoney(r.payout)}</span>
                  <span className="text-xs text-slate-400 tabular-nums w-24 text-right">
                    {r.solas > 0 && r.shares > 0 ? `Solas ${fmtMoney((r.payout * r.solas) / r.shares)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}

          {exitValue > 0 && entityRows.length > 0 && (
            <div className="bg-slate-50 rounded-lg px-3 py-2.5">
              <p className="text-xs text-slate-400 mb-1.5">Solas proceeds by entity — every vehicle receives cash, whether or not it carries</p>
              <div className="space-y-1">
                {entityRows.map(([entity, amount]) => (
                  <div key={entity} className="flex items-center text-[13px]">
                    <span className="text-slate-600">{entity}</span>
                    <span className="flex-1 border-b border-dotted border-slate-200 mx-2" />
                    <span className="font-medium tabular-nums" style={{ color: "#3b6d11" }}>{fmtMoney(amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-xs text-slate-400">
            Class-level: each preferred takes the better of its preference or converting; proceeds short of the
            stack pay down seniority order. Options and warrants count as shares with strikes ignored.
            {modeledNotes.length > 0 && " Unconverted notes convert at documented terms where stated, else at the discount to the last round price, with a floor at their balance (debt-like, ahead of the stack). Balances are as of the cap table date — interest accrued since is not added."}
            {unmodeledNotes.length > 0 && " Some convertibles here have no balance entered and are NOT modeled — edit the row and set its convertible balance."}
            {!anySolas && " No Solas holdings entered on the classes yet — add them per entity (pencil → Solas holdings) to see our proceeds."}
          </p>
        </div>
      )}
    </div>
  )
}
