"use client"

import { useState, useEffect, useMemo } from "react"
import { Plus, Trash2, Loader2, Pencil, Layers, ChevronDown, ChevronRight, TrendingDown } from "lucide-react"
import { PortfolioCompany, PortfolioPosition, PortfolioFundraiseRound, PortfolioClassHolding, SHARE_CLASS_TYPES } from "@/lib/types"
import { computeWaterfall, lastRoundPrice as lastRoundPriceOf, fmtPrice, WaterfallRow, ShareClassWithHoldings, investedBasis, breakEvenExit, solasProceeds, solasCost, solasBreakEven } from "@/lib/waterfall"
export type { ShareClassWithHoldings } from "@/lib/waterfall"
import { createClient } from "@/lib/supabase/client"
import { parseNum, numError, numToStr, fmtMoney, fmtPct, saveHint, inputCls, noteAccruedInterest, exactDate, calendarDaysUntil, dayCount } from "@/lib/rounds"
import Field from "@/components/shared/Field"
import InfoTip from "@/components/shared/InfoTip"
import Stat from "@/components/shared/Stat"

// Share-class structure: Common, each preferred series, the option pool —
// shares, price, preference. Deliberately STANDALONE from positions:
// ownership_pct stays hand-entered and keeps driving Fund Performance, so a
// half-filled cap table can never silently move AUM. When both sides have
// enough data to compare, a mismatch between the computed fully-diluted % and
// the entered ownership % is flagged below instead of auto-corrected.

export default function CapTableTab({ company, onCompanyUpdated }: {
  company: PortfolioCompany
  onCompanyUpdated: (c: PortfolioCompany) => void
}) {
  const supabase = createClient()
  const [classes, setClasses] = useState<ShareClassWithHoldings[]>([])
  const [positions, setPositions] = useState<PortfolioPosition[]>([])
  const [rounds, setRounds] = useState<PortfolioFundraiseRound[]>([])
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
    const [scRes, psRes, rdRes] = await Promise.all([
      // Preference-stack order: seniority 1 first, then the null-seniority rows
      // (common, pool) last — Postgres sorts nulls last ascending by default.
      supabase.from("portfolio_share_classes").select("*, portfolio_class_holdings(*)").eq("company_id", company.id).order("seniority").order("name"),
      supabase.from("portfolio_positions").select("*").eq("company_id", company.id),
      supabase.from("portfolio_fundraise_rounds").select("id,company_id,round_name,security_type,status,date,price_per_share,terms").eq("company_id", company.id),
    ])
    // A failed read must not render as an empty cap table — someone would
    // re-key the classes on top of it. Most likely failure: the migration
    // hasn't been run, which saveHint turns into "run migration_cap_table.sql".
    const loadErr = scRes.error ?? psRes.error ?? rdRes.error
    if (loadErr) setError(saveHint(loadErr.message))
    setClasses((scRes.data as ShareClassWithHoldings[]) ?? [])
    setPositions((psRes.data as PortfolioPosition[]) ?? [])
    setRounds((rdRes.data as PortfolioFundraiseRound[]) ?? [])
    setLoading(false)
  }

  // Same exclusion as the Ownership tab and Fund Performance: a look-through
  // row duplicates economics held at vehicle level.
  const ownPositions = positions.filter((p) => !p.lookthrough_of)

  const fdShares = classes.reduce((s, c) => s + (Number(c.shares_outstanding) || 0), 0)
  // Implied valuation = LAST ROUND price × fully diluted shares — "the company
  // at what the newest investor paid", the natural anchor for the waterfall's
  // exit box. (A per-class Σ shares × price would mostly reproduce invested
  // capital, since our prices are original-issue.) Last round = the most
  // senior priced preferred, highest price breaking a seniority tie.
  // The books know the actual last round when a dated, priced equity round is
  // on file — prefer it over the class heuristic, which can't identify the
  // newest class in a pari passu stack (equal seniority everywhere).
  const latestPricedRound = rounds
    .filter((r) => r.security_type === "Priced equity" && r.price_per_share != null && r.date != null)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0]
  const lastRound = latestPricedRound != null ? Number(latestPricedRound.price_per_share) : lastRoundPriceOf(classes)
  const impliedValuation = lastRound != null && fdShares > 0 ? lastRound * fdShares : null
  const solasShares = ownPositions.reduce((s, p) => s + (Number(p.shares) || 0), 0)
  const solasFdPct = fdShares > 0 && solasShares > 0 ? (solasShares / fdShares) * 100 : null
  const enteredPct = ownPositions.reduce((s, p) => s + (Number(p.ownership_pct) || 0), 0)
  // Flag, don't fix — and on a mismatch the AUDITED figure (positions, from the
  // fund audit) stands; the computed FD % is reference. Decided 2026-08-27.
  const mismatch = solasFdPct != null && enteredPct > 0 ? Math.abs(solasFdPct - enteredPct) > 0.5 : false
  // Unconverted notes/SAFEs are carried as share-less rows, so they sit OUTSIDE
  // the FD denominator — the usual reason the two figures legitimately differ.
  const hasConvertibles = classes.some((c) => c.shares_outstanding == null)

  // ── Live check against the books: the CRM's note rounds and positions keep
  // moving (accrual, maturity, conversion) while the cap table is a snapshot.
  // Positions carry only SOLAS's slice of each note, so the comparable figure
  // on the cap-table side is the note rows' Solas holdings (entered as $).
  const roundById = new Map(rounds.map((r) => [r.id, r]))
  const isNoteRound = (r: PortfolioFundraiseRound) => r.security_type === "Convertible note" || r.security_type === "SAFE"
  const noteRounds = rounds.filter(isNoteRound)
  const unconvertedRounds = noteRounds.filter((r) => r.status !== "Converted")
  // Solas live P+I per entity — the same accrual rules as Fund Performance's
  // Notes Exposure: computed simple interest when terms allow, entered fallback.
  const liveByFund = new Map<string, number>()
  for (const p of ownPositions) {
    const r = p.round_id ? roundById.get(p.round_id) : undefined
    if (!r || !isNoteRound(r) || r.status === "Converted") continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const terms = (r.terms as any) ?? {}
    const principal = Number(p.invested_amount) || 0
    const rate = terms.interest_rate != null ? Number(terms.interest_rate) : null
    const isSimple = !terms.interest_type || terms.interest_type === "Simple"
    const computed = isSimple ? noteAccruedInterest(principal || null, rate, r.date) : null
    const total = principal + (computed ?? (Number(p.accrued_interest) || 0))
    if (total <= 0) continue
    const fund = p.fund || "Unassigned"
    liveByFund.set(fund, (liveByFund.get(fund) ?? 0) + total)
  }
  const liveSolasNotes = Array.from(liveByFund.values()).reduce((a, b) => a + b, 0)
  const earliestMaturity = unconvertedRounds
    .map((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = ((r.terms as any) ?? {}).maturity_date
      return md ? String(md) : null
    })
    .filter((d): d is string => d != null)
    .sort()[0]
  // Whole calendar days, not a ms diff rounded by time of day (which read
  // "overdue by 1 days" on maturity day itself after noon).
  const maturityDays = calendarDaysUntil(earliestMaturity)
  const noteClassRows = classes.filter((c) => c.shares_outstanding == null && Number(c.convertible_balance) > 0)
  // Cap table says a note is outstanding, the books say everything converted:
  // the strongest stale signal there is.
  const staleConversion = noteClassRows.length > 0 && noteRounds.length > 0 && unconvertedRounds.length === 0
  const enteredSolasNoteDollars = noteClassRows.reduce(
    (t, c) => t + c.portfolio_class_holdings.reduce((u, h) => u + (Number(h.shares) || 0), 0), 0)
  const noteDrift = liveSolasNotes > 0 && enteredSolasNoteDollars > 0
    ? Math.abs(liveSolasNotes - enteredSolasNoteDollars) / liveSolasNotes > 0.02
    : false
  // Adopting the live figure only makes sense when there is exactly one note
  // row to receive it — with several, the per-row split is a human call.
  const adoptTarget = noteClassRows.length === 1 && liveSolasNotes > 0 ? noteClassRows[0] : null
  const [adopting, setAdopting] = useState(false)

  async function adoptLiveSolasNotes() {
    if (!adoptTarget) return
    setError("")
    setAdopting(true)
    // Positions carry their fund, so the live figure arrives pre-split by
    // entity — write it as this note row's holdings (dollars of balance).
    const rows = Array.from(liveByFund.entries()).map(([entity, dollars]) => ({
      class_id: adoptTarget.id, entity, shares: Math.round(dollars),
    }))
    const err = await replaceHoldings(supabase, adoptTarget.id, rows)
    setAdopting(false)
    if (err) { setError(err.message); if (err.lost) load(); return }
    load()
  }

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
      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-2.5">
        <Stat label="Fully diluted" value={fmtShares(fdShares || null)} />
        <Stat
          label="Implied valuation"
          value={fmtMoney(impliedValuation)}
          tip={impliedValuation != null
            ? `Last round price (${fmtPrice(lastRound)}${latestPricedRound ? `, ${latestPricedRound.round_name}` : ""}) × fully diluted shares.`
            : "The last round price applied across all fully diluted shares."}
        />
        <Stat label="Solas shares" value={fmtShares(solasShares || null)} />
        <Stat label="Solas FD %" value={fmtPct(solasFdPct)} tip="Solas shares ÷ fully diluted shares." />
      </div>
      {/* The formulas live in the cards' (?) tips; only a missing input stays
          visible, since it tells you what to enter. */}
      {(classes.length === 0 || impliedValuation == null) && (
        <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
          {classes.length === 0
            ? "Add the share classes from the company's cap table to compute fully diluted totals."
            : "Implied valuation needs a priced preferred class."}
        </p>
      )}
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
        {/* Phones: "as of" drops under the title and the button keeps one line. */}
        <div className="flex items-center justify-between max-md:gap-2 px-4 py-2.5">
          <div className="flex items-center gap-2 max-md:flex-wrap max-md:gap-y-1 max-md:min-w-0">
            <Layers className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Share classes</span>
            <label className="flex items-center gap-1.5 text-xs text-slate-400 max-md:basis-full max-md:pl-6">
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
            <button onClick={() => setAdding(true)} className="flex items-center gap-1 max-md:shrink-0 max-md:whitespace-nowrap text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 transition">
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
                // Phones (max-md): name + type on the first line, figures on the
                // second (notes, if any, on a third) — the fixed-width columns summed
                // to ~560px and pushed the whole modal body into a sideways
                // scroll. The zero-height basis-full span is the line break
                // (display:none from md); `order` keeps the actions on line one.
                <div key={c.id} className="flex items-center gap-3 max-md:flex-wrap max-md:gap-y-1 px-4 py-2.5 text-sm group">
                  <span className="font-medium text-slate-800 w-36 shrink-0 truncate max-md:w-auto max-md:shrink max-md:min-w-0" title={c.name}>{c.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-md shrink-0" style={{ backgroundColor: "#e6eef1", color: "#023a51" }}>{c.class_type}</span>
                  <span className="basis-full h-0 md:hidden max-md:order-2" aria-hidden />
                  <span className="text-slate-600 shrink-0 w-24 text-right tabular-nums max-md:order-2">
                    {c.shares_outstanding != null ? fmtShares(c.shares_outstanding) : c.convertible_balance != null ? fmtMoney(c.convertible_balance) : "—"}
                  </span>
                  <span className="text-xs text-slate-400 shrink-0 w-12 text-right tabular-nums max-md:order-2">
                    {fdShares > 0 && c.shares_outstanding != null ? fmtPct((Number(c.shares_outstanding) / fdShares) * 100) : "—"}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0 w-20 text-right tabular-nums max-md:order-2">{fmtPrice(c.price_per_share)}</span>
                  <span className="text-xs text-slate-400 shrink-0 w-10 text-right max-md:order-2">{c.liq_pref_multiple != null ? `${Number(c.liq_pref_multiple)}×` : ""}</span>
                  <span className="flex-1 min-w-0 truncate text-xs text-slate-400 max-md:order-2 max-md:basis-full max-md:empty:hidden">{c.notes}</span>
                  <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition shrink-0 max-md:order-1 max-md:ml-auto">
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

      {staleConversion && (
        <p className="text-xs px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef3e6", color: "#9a5b13" }}>
          Every note round on the books is marked <span className="font-medium">Converted</span>, but this cap table still
          carries {noteClassRows.length === 1 ? "an unconverted note row" : "unconverted note rows"} — it predates the
          conversion. Re-key the classes from a fresh cap table.
        </p>
      )}
      {!staleConversion && noteClassRows.length > 0 && liveSolasNotes > 0 && (
        <div className="text-xs px-3 py-2 rounded-lg space-y-1" style={{ backgroundColor: noteDrift ? "#fef3e6" : "#f8fafc", color: noteDrift ? "#9a5b13" : "#64748b" }}>
          <p>
            CRM books today: {unconvertedRounds.length} unconverted note {unconvertedRounds.length === 1 ? "round" : "rounds"};
            Solas principal + accrued ≈ <span className="font-medium">{fmtMoney(liveSolasNotes)}</span> (accrues daily
            {earliestMaturity != null && maturityDays != null && (
              maturityDays < 0
                ? <>; earliest maturity {exactDate(earliestMaturity)}, <span className="font-medium">overdue by {dayCount(Math.abs(maturityDays))}</span></>
                : maturityDays === 0
                  ? <>; earliest maturity {exactDate(earliestMaturity)}, <span className="font-medium">today</span></>
                  : <>; earliest maturity {exactDate(earliestMaturity)}, in {dayCount(maturityDays)}</>
            )}).
            {noteDrift && <> The note {noteClassRows.length === 1 ? "row carries" : "rows carry"} Solas holdings of {fmtMoney(enteredSolasNoteDollars)} — drifted from the live figure.</>}
            {enteredSolasNoteDollars === 0 && <> The note {noteClassRows.length === 1 ? "row has" : "rows have"} no Solas holdings entered.</>}
          </p>
          {adoptTarget && (noteDrift || enteredSolasNoteDollars === 0) && (
            <button onClick={adoptLiveSolasNotes} disabled={adopting} className="flex items-center gap-1.5 text-xs px-2.5 py-1 border rounded-lg transition disabled:opacity-40" style={{ borderColor: "#e0b27a", color: "#9a5b13" }}>
              {adopting && <Loader2 className="w-3 h-3 animate-spin" />}
              Use live figure — set “{adoptTarget.name}” Solas holdings to {fmtMoney(liveSolasNotes)}, split by fund
            </button>
          )}
        </div>
      )}
      {classes.some((c) => c.shares_outstanding != null) && <WaterfallSection classes={classes} impliedValue={impliedValuation} refPrice={lastRound} />}

      <p className="text-xs text-slate-400 text-center">
        Solas positions and ownership % live in the <span className="font-medium text-slate-500">Fundraising</span> tab and are the source of truth for valuations.
      </p>
    </div>
  )
}

type Supa = ReturnType<typeof createClient>

/**
 * Replace a class's Solas holdings wholesale (delete + insert), snapshotting
 * first so a failed insert can put the old rows back. Returns null on success;
 * otherwise the message to show, with `lost` set when even the restore failed
 * and the old holdings are gone from the database.
 */
async function replaceHoldings(
  supabase: Supa,
  classId: string,
  rows: { class_id: string; entity: string; shares: number | null }[],
): Promise<{ message: string; lost: boolean } | null> {
  // No snapshot, no delete: without it a failed insert has nothing to restore.
  const { data: prev, error: snapErr } = await supabase.from("portfolio_class_holdings").select("*").eq("class_id", classId)
  if (snapErr) return { message: `${saveHint(snapErr.message)} (Holdings were not changed.)`, lost: false }
  const { error: delErr } = await supabase.from("portfolio_class_holdings").delete().eq("class_id", classId)
  if (delErr) return { message: saveHint(delErr.message), lost: false }
  if (!rows.length) return null
  const { error: insErr } = await supabase.from("portfolio_class_holdings").insert(rows)
  if (!insErr) return null
  const prevRows = (prev as PortfolioClassHolding[] | null) ?? []
  if (!prevRows.length) return { message: saveHint(insErr.message), lost: false }
  const { error: restoreErr } = await supabase.from("portfolio_class_holdings").insert(prevRows)
  if (!restoreErr) return { message: `${saveHint(insErr.message)} (Previous holdings restored.)`, lost: false }
  return {
    message: `${saveHint(insErr.message)} — AND the previous holdings could not be restored (${restoreErr.message}). They are no longer in the database: ${prevRows.map((h) => `${h.entity} ${Number(h.shares).toLocaleString("en-US")}`).join(", ")}. Re-enter them, or contact whoever administers Supabase to recover them.`,
    lost: true,
  }
}

function fmtShares(n: number | null | undefined): string {
  return n == null || isNaN(Number(n)) ? "—" : Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })
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
  // Set once a new class's row exists. If its holdings then fail, the retry
  // must UPDATE that row — inserting again created a second copy of the class.
  const [createdId, setCreatedId] = useState<string | null>(null)
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
    // A typo in a number field would otherwise save as null (or, for a
    // holding, silently drop the row). Only fields that are saved are checked.
    const isOther = f.class_type === "Other"
    const numIssue = [
      numError("Shares outstanding", f.shares_outstanding),
      numError("Price per share", f.price_per_share),
      numError("Liq pref multiple", f.liq_pref_multiple),
      numError("Seniority", f.seniority),
      isOther ? numError("Convertible balance", f.convertible_balance) : null,
      isOther ? numError("Conversion price", f.conversion_price) : null,
      ...holdings.map((h) => numError(`Holding${h.entity.trim() ? ` (${h.entity.trim()})` : ""} shares`, h.shares)),
    ].find(Boolean)
    if (numIssue) { setError(numIssue); return }
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
    let classId = initial?.id ?? createdId ?? undefined
    if (!classId) {
      const { data, error: e } = await supabase.from("portfolio_share_classes").insert(payload).select("id").single()
      if (e || !data) { setError(saveHint(e?.message ?? "insert returned no row")); setSaving(false); return }
      classId = (data as { id: string }).id
      setCreatedId(classId)
    } else {
      const { error: e } = await supabase.from("portfolio_share_classes").update(payload).eq("id", classId!)
      if (e) { setError(saveHint(e.message)); setSaving(false); return }
    }
    // Holdings are replaced wholesale — the editor rows ARE the state.
    const rows = holdings
      .map((h) => ({ class_id: classId!, entity: h.entity.trim(), shares: parseNum(h.shares) }))
      .filter((h) => h.entity && h.shares != null)
    // Class fields are already saved by now; a failure here is holdings only.
    const holdErr = await replaceHoldings(supabase, classId!, rows)
    if (holdErr) { setError(`Class saved, but holdings failed: ${holdErr.message}`); setSaving(false); return }
    setSaving(false)
    onDone()
  }

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-3 max-md:grid-cols-2 gap-3">
        <Field label="Class name *"><input placeholder="Series B Preferred" value={f.name} onChange={(e) => set("name", e.target.value)} className={inputCls} /></Field>
        <Field label="Type">
          <select value={f.class_type} onChange={(e) => set("class_type", e.target.value as typeof f.class_type)} className={inputCls}>
            {SHARE_CLASS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Shares outstanding"><input placeholder="e.g. 4,215,000" value={f.shares_outstanding} onChange={(e) => set("shares_outstanding", e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-4 max-md:grid-cols-2 gap-3">
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

// ─── quick waterfall (math lives in lib/waterfall.ts, tested there) ─────────
// Money multiples read to the cent below 10× ("1.42×"), coarser above.
function fmtMult(n: number): string {
  const d = n < 10 ? 2 : 1
  return `${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}×`
}

const MODE_STYLE: Record<WaterfallRow["mode"], { bg: string; fg: string }> = {
  preference: { bg: "#e6eef1", fg: "#023a51" },
  participating: { bg: "#e6eef1", fg: "#023a51" },
  "partial preference": { bg: "#fef3e6", fg: "#9a5b13" },
  converted: { bg: "#eaf3df", fg: "#3b6d11" },
  "as-converted": { bg: "#eaf3df", fg: "#3b6d11" },
  wiped: { bg: "#fdeaea", fg: "#993c1d" },
}

function WaterfallSection({ classes, impliedValue, refPrice }: { classes: ShareClassWithHoldings[]; impliedValue: number | null; refPrice: number | null }) {
  const [open, setOpen] = useState(false)
  const [exitStr, setExitStr] = useState("")

  const [discountStr, setDiscountStr] = useState("20")
  const exitValue = parseNum(exitStr) ?? 0
  const noteDiscount = Math.min(0.95, Math.max(0, (parseNum(discountStr) ?? 20) / 100))
  const rows = exitValue > 0 ? computeWaterfall(exitValue, classes, noteDiscount, refPrice) : []
  const solasTotal = solasProceeds(rows)
  const anySolas = classes.some((c) => c.portfolio_class_holdings.length > 0)
  // Make-whole exits depend on the structure and discount, not the exit box —
  // bisection over computeWaterfall per class, cheap at single-digit counts.
  const basisById = new Map(classes.map((c) => [c.id, investedBasis(c)]))
  const wholeAtById = useMemo(() => {
    const m = new Map<string, number | null>()
    for (const c of classes) m.set(c.id, breakEvenExit(c.id, classes, noteDiscount, refPrice))
    return m
  }, [classes, noteDiscount, refPrice])
  const solasIn = useMemo(() => solasCost(classes), [classes])
  const solasWholeAt = useMemo(() => solasBreakEven(classes, noteDiscount, refPrice), [classes, noteDiscount, refPrice])
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

  const methodology = (
    <>
      <p>Directional: where terms are silent a preferred is treated as 1× non-participating.</p>
      <p className="mt-1.5">Each preferred takes the better of its preference or converting; proceeds short of the stack pay down in seniority order. Options and warrants count as shares with strikes ignored.</p>
      <p className="mt-1.5">Multiple = payout ÷ money in (shares × original-issue price; a note&apos;s balance — liq-pref multiples don&apos;t inflate it). Break-even is the smallest exit that returns that money. Both apply pro-rata to the Solas slice of each class.</p>
      {modeledNotes.length > 0 && (
        <p className="mt-1.5">Unconverted notes convert at documented terms where stated, else at the discount to the last round price, with a floor at their balance (debt-like, ahead of the stack). Balances are as of the cap table date — interest accrued since is not added.</p>
      )}
    </>
  )
  const solasMult = solasIn != null && solasIn > 0 ? solasTotal / solasIn : null

  return (
    <div className="border border-slate-200 rounded-xl bg-white">
      {/* The (?) sits beside the toggle, not inside it — no button in a button. */}
      <div className="flex items-center pr-4 rounded-xl hover:bg-slate-50 transition">
        <button onClick={() => (open ? setOpen(false) : openWith(impliedValue))} className="flex-1 flex items-center gap-2 px-4 py-2.5 text-left">
          <span className="text-slate-300">{open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
          <TrendingDown className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">Quick waterfall</span>
        </button>
        <InfoTip label="How the waterfall is calculated">{methodology}</InfoTip>
      </div>
      {open && (
        <div className="border-t border-slate-100 p-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Field label="Exit value (to equity)">
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
                {([["implied", 1], ["2×", 2], ["3×", 3], ["5×", 5], ["10×", 10]] as const).map(([label, mult]) => (
                  <button key={label} onClick={() => setExitStr(String(Math.round(impliedValue * mult)))} className="text-xs px-2 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-900 hover:border-slate-300 transition">
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Solas summary: the answer first, then where it lands by vehicle. */}
          {exitValue > 0 && anySolas && (
            <div className="rounded-lg bg-slate-50 px-4 py-3">
              <div className="flex flex-wrap items-end gap-x-10 gap-y-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Solas proceeds</p>
                  <p className="text-xl font-semibold tabular-nums" style={{ color: "#3b6d11" }}>{fmtMoney(solasTotal)}</p>
                </div>
                {solasIn != null && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Multiple</p>
                    {/* A $0 basis is real (e.g. a class priced at $0) but has no
                        multiple — dividing by it rendered "∞×" / "NaN×". */}
                    <p className="text-sm font-medium tabular-nums" style={{ color: solasMult == null ? "#64748b" : solasMult >= 1 ? "#3b6d11" : "#9a5b13" }}>
                      {solasMult != null ? fmtMult(solasMult) : "—"}
                      <span className="text-slate-400 font-normal"> on {fmtMoney(solasIn)} in</span>
                    </p>
                  </div>
                )}
                {solasIn != null && solasWholeAt != null && (
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
                      Break-even exit
                      <InfoTip size="xs" label="About break-even">The smallest exit at which Solas gets back the money it put in, across all its classes.</InfoTip>
                    </p>
                    <p className="text-sm font-medium tabular-nums text-slate-700">{fmtMoney(solasWholeAt)}</p>
                  </div>
                )}
              </div>
              {entityRows.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-1.5">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400 flex items-center gap-1">
                    By entity
                    <InfoTip size="xs" label="About proceeds by entity">Every vehicle receives cash at an exit, whether or not it carries.</InfoTip>
                  </p>
                  {entityRows.map(([entity, amount]) => {
                    const share = solasTotal > 0 ? amount / solasTotal : 0
                    return (
                      <div key={entity} className="flex items-center gap-3 text-[13px]">
                        <span className="w-36 max-md:w-24 shrink-0 truncate text-slate-600" title={entity}>{entity}</span>
                        <span className="flex-1 h-1.5 rounded-full bg-slate-200/80 overflow-hidden">
                          <span className="block h-full rounded-full" style={{ width: `${Math.max(share * 100, 1)}%`, backgroundColor: "#5ba200" }} />
                        </span>
                        <span className="w-10 text-right text-xs text-slate-400 tabular-nums">{Math.round(share * 100)}%</span>
                        <span className="w-16 text-right font-medium tabular-nums" style={{ color: "#3b6d11" }}>{fmtMoney(amount)}</span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {exitValue > 0 && rows.length > 0 && (
            <div>
              <div className="flex items-center gap-3 pb-1.5 border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                {/* Phones: Treatment folds under the class name and Multiple is
                    dropped — five fixed columns left the name 0px at 375px. */}
                <span className="flex-1">Class</span>
                <span className="w-24 shrink-0 max-md:hidden">Treatment</span>
                <span className="w-14 shrink-0 text-right max-md:hidden">Multiple</span>
                <span className="w-20 shrink-0 text-right">Payout</span>
                {anySolas && <span className="w-20 shrink-0 text-right">Solas</span>}
              </div>
              <div className="divide-y divide-slate-50">
                {rows.map((r) => {
                  const basis = basisById.get(r.id)
                  const mult = basis != null && basis > 0 ? r.payout / basis : null
                  const wholeAt = wholeAtById.get(r.id)
                  const solasShare = r.solas > 0 && r.unitTotal > 0 ? (r.payout * r.solas) / r.unitTotal : null
                  return (
                    <div key={r.id} className="flex items-center gap-3 py-2 text-[13px]">
                      {/* Break-even gets its own line — it depends on the
                          structure, not the exit box. The class's modelling
                          assumption sits behind a (?) instead of repeating
                          on every row. */}
                      <span className="flex-1 min-w-0">
                        {/* Wraps rather than truncates: class names like "Series
                            Seed-1 Preferred (as-converted)" differ only at the end. */}
                        <span className="block text-slate-700 leading-snug">
                          {r.name}
                          {r.assumed && <InfoTip size="xs" className="ml-1 -mt-0.5" label={`Assumption for ${r.name}`}>{r.assumed.charAt(0).toUpperCase() + r.assumed.slice(1)}.</InfoTip>}
                        </span>
                        {wholeAt != null && <span className="block text-slate-400 text-xs tabular-nums">Break-even at {fmtMoney(wholeAt)}</span>}
                        <span className="md:hidden block mt-0.5">
                          <span className="text-xs px-2 py-0.5 rounded-md whitespace-nowrap" style={{ backgroundColor: MODE_STYLE[r.mode].bg, color: MODE_STYLE[r.mode].fg }}>{r.mode}</span>
                        </span>
                      </span>
                      <span className="w-24 shrink-0 max-md:hidden">
                        <span className="text-xs px-2 py-0.5 rounded-md whitespace-nowrap" style={{ backgroundColor: MODE_STYLE[r.mode].bg, color: MODE_STYLE[r.mode].fg }}>{r.mode}</span>
                      </span>
                      <span className="w-14 shrink-0 text-xs tabular-nums text-right font-medium max-md:hidden" style={{ color: mult == null ? undefined : mult >= 1 ? "#3b6d11" : "#9a5b13" }}>
                        {mult != null ? fmtMult(mult) : ""}
                      </span>
                      <span className="w-20 shrink-0 text-slate-600 tabular-nums text-right">{fmtMoney(r.payout)}</span>
                      {anySolas && (
                        <span className="w-20 shrink-0 tabular-nums text-right" style={{ color: solasShare != null ? "#3b6d11" : undefined }}>
                          {solasShare != null ? fmtMoney(solasShare) : <span className="text-slate-300">—</span>}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Action-required gaps stay visible — they change what the numbers mean. */}
          {unmodeledNotes.length > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">Some convertibles have no balance entered and aren&apos;t modeled — edit the row and set its convertible balance.</p>
          )}
          {!anySolas && (
            <p className="text-xs text-slate-500">No Solas holdings entered on the classes yet — add them per entity (pencil → Solas holdings) to see our proceeds.</p>
          )}
        </div>
      )}
    </div>
  )
}
