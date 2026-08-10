"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, Loader2, Pencil, Wallet } from "lucide-react"
import { PortfolioCash, BURN_BASES, CASH_SOURCES } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { parseNum, numToStr, numError, fmtMoney, saveHint, exactDate, inputCls } from "@/lib/rounds"
import {
  RUNWAY_COLORS,
  RUNWAY_BANDS,
  STALE_MONTHS,
  sortCash,
  latestCash,
  latestRunwaySource,
  runwayMonths,
  derivedRunwayMonths,
  zeroCashDate,
  monthsLeft,
  impliedCash,
  proFormaRunwayMonths,
  runwayMismatch,
  isMismatchAcked,
  MISMATCH_ACK_DRIFT,
  staleness,
  runwayBandColor,
  fmtMonths,
  burnTrendPct,
  cashMovementBurn,
  movementUnderstatesBurn,
  isPlannedBurn,
  todayISO,
} from "@/lib/runway"
import Field from "@/components/shared/Field"

const { navy: NAVY, green: GREEN, orange: ORANGE, red: RED } = RUNWAY_COLORS

// Cash, burn, and when the money runs out — one row per observation, newest
// first. The headline figures deliberately age the most recent report forward to
// today rather than presenting it as current: a stale balance shown as-is is the
// exact mistake this tab exists to prevent.
export default function RunwayTab({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<PortfolioCash[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Clearing a check flag: `clearing` opens the reason field, `acking` guards
  // the write so a double-click cannot record the gap twice.
  const [clearing, setClearing] = useState(false)
  const [ackNote, setAckNote] = useState("")
  const [acking, setAcking] = useState(false)
  const [ackError, setAckError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase
      .from("portfolio_cash")
      .select("*")
      .eq("company_id", companyId)
      .order("as_of", { ascending: false })
    if (e) setError(saveHint(e.message))
    setRows(sortCash((data as PortfolioCash[]) ?? []))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(id: string) {
    const { error: e } = await supabase.from("portfolio_cash").delete().eq("id", id)
    if (e) { setError("Couldn't delete that snapshot: " + e.message); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (editingId === id) setEditingId(null)
  }

  // ── headline figures, all from the most recent row carrying a balance ──
  const today = todayISO()
  const last = latestCash(rows)
  // Runway can come from a different (usually later) observation than cash.
  const rwRow = latestRunwaySource(rows)
  const r = rwRow ? runwayMonths(rwRow) : null
  const z = rwRow ? zeroCashDate(rwRow) : null
  const left = rwRow ? monthsLeft(rwRow, today) : null
  const implied = last ? impliedCash(last, today) : null
  const stale = last ? staleness(last, today) : null
  const mismatch = rwRow ? runwayMismatch(rwRow) : null
  const mismatchAcked = rwRow ? isMismatchAcked(rwRow, mismatch) : false

  // Accepting the gap stores the PERCENTAGE reviewed, not a flag, so the warning
  // can come back on its own if the numbers move — see isMismatchAcked.
  async function clearFlag() {
    if (!rwRow || !mismatch) return
    setAcking(true)
    setAckError("")
    const { data: u } = await supabase.auth.getUser()
    const { error: e } = await supabase
      .from("portfolio_cash")
      .update({
        mismatch_ack_pct: mismatch.pct,
        mismatch_ack_note: ackNote.trim() || null,
        mismatch_acked_at: new Date().toISOString(),
        mismatch_acked_by: u.user?.id ?? null,
        updated_by: u.user?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rwRow.id)
    setAcking(false)
    if (e) { setAckError(saveHint(e.message)); return }
    setClearing(false)
    load()
  }

  async function restoreFlag() {
    if (!rwRow) return
    setAcking(true)
    setAckError("")
    const { error: e } = await supabase
      .from("portfolio_cash")
      .update({ mismatch_ack_pct: null, mismatch_ack_note: null, mismatch_acked_at: null, mismatch_acked_by: null })
      .eq("id", rwRow.id)
    setAcking(false)
    if (e) { setAckError(saveHint(e.message)); return }
    load()
  }
  const proForma = rwRow ? proFormaRunwayMonths(rwRow) : null
  const trend = burnTrendPct(rows)
  const movement = cashMovementBurn(rows)
  // See MOVEMENT_CONFLICT_RATIO: financing that only OFFSETS burn keeps
  // cashRose false while flattering the movement figure.
  const understated = movementUnderstatesBurn(
    last?.monthly_burn != null ? Number(last.monthly_burn) : null,
    movement && !movement.cashRose ? movement.perMonth : null,
    last?.burn_basis,
  )
  const notBurning = !!last && last.monthly_burn != null && Number(last.monthly_burn) <= 0

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2.5">
        <Stat
          label="Cash on hand"
          value={fmtMoney(last?.cash_on_hand)}
          sub={last ? `as of ${exactDate(last.as_of)}` : undefined}
        />
        <Stat
          label="Monthly burn"
          value={notBurning ? "not burning" : fmtMoney(last?.monthly_burn)}
          sub={
            notBurning
              ? "covering its own costs"
              : trend
                ? `${trend.pct > 0 ? "+" : ""}${trend.pct.toFixed(0)}% vs ${exactDate(trend.from.as_of)}`
                : (last?.burn_basis ?? undefined)
          }
          // A rising burn is worth noticing but is not itself bad news, so this
          // stays neutral — only the runway columns carry a verdict colour.
        />
        <Stat
          label="Runway"
          value={r ? fmtMonths(r.months) : "—"}
          sub={
            r
              ? r.basis === "stated"
                ? `company-stated, at ${exactDate(rwRow!.as_of)}`
                // Name the plan when one is driving the arithmetic — a figure
                // divided by a budget is not the same claim as one divided by
                // what actually went out of the door.
                : `cash ÷ ${isPlannedBurn(rwRow?.burn_basis) ? "planned " : ""}burn, at ${exactDate(rwRow!.as_of)}`
              : undefined
          }
          accent={r ? runwayBandColor(r.months) : undefined}
        />
        {/* The actionable one: not what the deck said, but what it means now. */}
        <Stat
          label="Out of cash"
          value={z ? exactDate(z.date) : "—"}
          sub={
            left == null
              ? undefined
              : left <= 0
                ? `lapsed ${Math.abs(left).toFixed(1)} mo ago`
                : `${fmtMonths(left)} from today`
          }
          accent={left != null ? runwayBandColor(left) : undefined}
        />
      </div>

      <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
        {rows.length === 0
          ? "Add a cash observation to start tracking runway. Take the balance date from the deck, not the date it was sent."
          : "Runway counts from the date cash was measured. “From today” ages that report forward at the reported burn rate — it is an extrapolation, not a new report."}
      </p>

      {/* Things worth knowing before trusting the numbers above. Each is a
          legitimate state rather than an error, so these inform and never block. */}
      {(stale?.stale || mismatch || notBurning || proForma != null || movement) && (
        <div className="border border-amber-200 rounded-xl bg-amber-50/60 px-4 py-2.5 space-y-1">
          {stale?.stale && (
            <p className="text-xs text-amber-800">
              <span className="font-medium">Cash figure is {stale.months.toFixed(1)} months old</span> — measured{" "}
              {exactDate(last!.as_of)}. Anything over {STALE_MONTHS} months means two board cycles went unrecorded,
              so the runway above is an extrapolation, not a report.
            </p>
          )}
          {mismatch && !mismatchAcked && (
            <div className="text-xs text-amber-800">
              <p>
                <span className="font-medium">Company said {fmtMonths(mismatch.stated)}, cash ÷ burn gives{" "}
                {fmtMonths(mismatch.derived)}</span> — {mismatch.diff > 0 ? "the arithmetic is more generous" : "the arithmetic is shorter"}.
                The stated figure is used. Often legitimate — burn planned to step down or up — but worth reading the note.
              </p>
              {/* Clearing lives HERE rather than on the portfolio list, so the
                  gap is dismissed with its explanation on screen rather than
                  from a badge that says nothing about why it fired. */}
              {clearing ? (
                <div className="mt-2 flex items-start gap-2">
                  <input
                    autoFocus
                    value={ackNote}
                    onChange={(e) => setAckNote(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") clearFlag(); if (e.key === "Escape") setClearing(false) }}
                    placeholder="Why is this expected? e.g. burn ramps with the Gen 2 launch"
                    className="flex-1 px-2 py-1 text-xs bg-white border border-amber-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-300"
                  />
                  <button onClick={clearFlag} disabled={acking}
                    className="px-2.5 py-1 text-xs font-medium text-white rounded-lg disabled:opacity-40 shrink-0" style={{ backgroundColor: NAVY }}>
                    {acking ? "Clearing…" : "Clear flag"}
                  </button>
                  <button onClick={() => setClearing(false)} className="px-2 py-1 text-xs text-amber-800 hover:underline shrink-0">
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => { setAckNote(""); setClearing(true) }} className="mt-1 text-xs font-medium underline hover:no-underline">
                  Clear this flag
                </button>
              )}
              {/* Reported HERE, not at the foot of the tab: a failure shown far
                  from the button it belongs to reads as the button doing nothing. */}
              {ackError && <p className="mt-1.5 text-xs text-red-700 bg-red-50 px-2 py-1.5 rounded-lg">{ackError}</p>}
            </div>
          )}
          {mismatch && mismatchAcked && (
            <p className="text-xs text-amber-800/70">
              <span className="font-medium">Gap reviewed and cleared</span>
              {rwRow?.mismatch_acked_at ? ` ${exactDate(rwRow.mismatch_acked_at.slice(0, 10))}` : ""}
              {rwRow?.mismatch_ack_note ? ` — ${rwRow.mismatch_ack_note}` : ""}.{" "}
              It returns on its own if the gap grows by more than {Math.round(MISMATCH_ACK_DRIFT * 100)}% or changes direction.{" "}
              <button onClick={restoreFlag} disabled={acking} className="font-medium underline hover:no-underline disabled:opacity-40">
                Undo
              </button>
              {ackError && <span className="block mt-1.5 text-xs text-red-700 bg-red-50 px-2 py-1.5 rounded-lg">{ackError}</span>}
            </p>
          )}
          {/* The cross-check on burn, mirroring stated-vs-derived on runway.
              Every deck defines burn differently; the movement in the bank
              balance is the same quantity for every company. */}
          {/* Financing that merely OFFSETS burn leaves the balance drifting
              down, so cashRose stays false while the movement figure is badly
              flattered. Catch it by comparing against the reported burn. */}
          {movement && !movement.cashRose && understated && (
            <p className="text-xs text-amber-800">
              <span className="font-medium">
                Ignore the cash movement here — it implies only {fmtMoney(movement.perMonth)}/mo against a reported{" "}
                {fmtMoney(last?.monthly_burn)}/mo
              </span>
              . Cash fell far less than it was spent between {exactDate(movement.from.as_of)} and{" "}
              {exactDate(movement.to.as_of)}, so capital came in over that window. The reported burn is the reliable
              figure; the movement is not comparable to other companies.
            </p>
          )}
          {movement && !movement.cashRose && !understated && (
            <p className="text-xs text-amber-800">
              <span className="font-medium">Actual cash movement: {fmtMoney(movement.perMonth)}/mo</span>{" "}
              — {fmtMoney(movement.from.cash_on_hand)} on {exactDate(movement.from.as_of)} to{" "}
              {fmtMoney(movement.to.cash_on_hand)} on {exactDate(movement.to.as_of)} ({movement.months.toFixed(1)} mo).
              This is the figure comparable across the portfolio; the reported burn above is on the deck&apos;s own basis
              {last?.burn_basis ? ` (${last.burn_basis})` : ""}.
            </p>
          )}
          {movement?.cashRose && (
            <p className="text-xs text-amber-800">
              <span className="font-medium">Cash rose between the last two balances</span> —{" "}
              {fmtMoney(movement.from.cash_on_hand)} to {fmtMoney(movement.to.cash_on_hand)}, so money came in over that
              window and no burn rate can be read from the movement. Worth recording the financing in the notes.
            </p>
          )}
          {notBurning && (
            <p className="text-xs text-amber-800">
              <span className="font-medium">Reported burn is zero or below</span>, so no runway is computed. That&apos;s
              a company covering its costs, not a company out of money.
            </p>
          )}
          {proForma != null && (
            <p className="text-xs text-amber-800">
              <span className="font-medium">Pro-forma runway {fmtMonths(proForma)}</span> including{" "}
              {fmtMoney(last!.committed_funding)} committed but not yet funded. Excluded from the headline — a signed
              tranche isn&apos;t cash.
            </p>
          )}
        </div>
      )}

      {/* Observations over time */}
      <div className="border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Cash &amp; burn</span>
            <span className="text-xs text-slate-400">by observation date</span>
          </div>
          {!adding && !editingId && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add snapshot
            </button>
          )}
        </div>

        {adding && (
          <div className="border-t border-slate-100">
            <CashEditor
              companyId={companyId}
              existing={rows}
              onCancel={() => setAdding(false)}
              onDone={() => { setAdding(false); load() }}
            />
          </div>
        )}

        {rows.length > 0 && (
          <div className="border-t border-slate-100">
            <CashBars rows={rows} />
            <div className="divide-y divide-slate-50">
              {rows.map((row) =>
                editingId === row.id ? (
                  <div key={row.id}>
                    <CashEditor
                      companyId={companyId}
                      existing={rows}
                      initial={row}
                      onCancel={() => setEditingId(null)}
                      onDone={() => { setEditingId(null); load() }}
                    />
                  </div>
                ) : (
                  <CashRow
                    key={row.id}
                    row={row}
                    onEdit={() => { setEditingId(row.id); setAdding(false) }}
                    onDelete={() => handleDelete(row.id)}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {implied != null && (
        <p className="text-xs text-slate-400">
          Extrapolating {fmtMoney(last!.cash_on_hand)} at {fmtMoney(last!.monthly_burn)}/mo, implied cash today is{" "}
          <span style={{ color: runwayBandColor(left) }}>
            {implied > 0 ? fmtMoney(implied) : "nil"}
          </span>
          . Replace it with a reported balance as soon as one arrives.
        </p>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: accent ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}

// ─── one observation row ──────────────────────────────────────────────────────
function CashRow({ row, onEdit, onDelete }: { row: PortfolioCash; onEdit: () => void; onDelete: () => void }) {
  const r = runwayMonths(row)
  const derived = derivedRunwayMonths(row)
  const z = zeroCashDate(row)
  return (
    <div className="px-4 py-2.5 group">
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-600 shrink-0 w-[6rem]">
          {exactDate(row.as_of)}
        </span>
        <div className="flex items-baseline gap-1.5 w-32 shrink-0">
          <span className="text-xs text-slate-400">cash</span>
          <span className="font-medium tabular-nums" style={{ color: row.cash_on_hand != null ? NAVY : undefined }}>
            {row.cash_on_hand != null ? fmtMoney(row.cash_on_hand) : <span className="text-slate-300">not reported</span>}
          </span>
        </div>
        <div className="flex items-baseline gap-1.5 w-32 shrink-0">
          <span className="text-xs text-slate-400">burn</span>
          <span className="text-slate-600 tabular-nums">
            {row.monthly_burn == null
              ? <span className="text-slate-300">—</span>
              : Number(row.monthly_burn) <= 0
                ? "none"
                : `${fmtMoney(row.monthly_burn)}/mo`}
          </span>
        </div>
        <span className="flex-1 text-xs tabular-nums" style={{ color: runwayBandColor(r?.months) }}>
          {r ? (
            <span
              title={
                r.basis === "stated"
                  ? derived != null
                    ? `Company-stated. Cash ÷ burn gives ${fmtMonths(derived)}.`
                    : "Company-stated."
                  : "Derived: cash ÷ burn."
              }
            >
              {fmtMonths(r.months)}
              <span className="text-slate-400 ml-1">{r.basis === "stated" ? "stated" : "derived"}</span>
            </span>
          ) : ""}
        </span>
        {z && (
          <span className="text-xs tabular-nums shrink-0 text-slate-500" title="Date cash reaches zero from this observation">
            out {exactDate(z.date)}
          </span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
          <button onClick={onEdit} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {(row.source || row.source_detail || row.burn_basis || row.committed_funding != null || row.notes) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 pl-[6.75rem] text-xs text-slate-400">
          {row.source && <span>{row.source}{row.source_detail ? ` · ${row.source_detail}` : ""}</span>}
          {row.burn_basis && <span>{row.burn_basis}</span>}
          {row.committed_funding != null && <span>+{fmtMoney(row.committed_funding)} committed</span>}
          {row.notes && <span className="text-slate-500">{row.notes}</span>}
        </div>
      )}
    </div>
  )
}

// ─── cash balance over time ───────────────────────────────────────────────────
// Plot geometry in px. The axis labels, the gridlines and the bars all key off
// these two constants, so the three can't drift apart: the axis column is padded
// down by CAP_H (+ the 4px flex gap) to clear the runway caption above each bar,
// and every band is PLOT_H tall.
const CAP_H = 10
const PLOT_H = 80

/**
 * Round tick values for the cash axis, at or below `max`.
 *
 * `max` keeps its 8% headroom rather than being rounded up to the top tick, so
 * the bars stay tall and a series still reads as a depletion. That means the top
 * gridline sits below the top of the plot, which is the deliberate trade: a
 * rounded-up scale would squash a $10.5M series into 70% of the height.
 */
function cashTicks(max: number): number[] {
  // Aim for ~5 intervals, then snap the step onto a 1/2/2.5/5 ladder so the
  // labels read as money a person would say out loud.
  const target = max / 5
  const mag = Math.pow(10, Math.floor(Math.log10(target)))
  const n = target / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag

  const ticks: number[] = []
  for (let t = 0; t <= max; t += step) ticks.push(t)
  return ticks
}

/** Axis labels drop fmtMoney's trailing ".0" — "$10M" reads better than "$10.0M". */
function fmtAxisTick(n: number): string {
  return fmtMoney(n).replace(/\.0(?=[KMB]$)/, "")
}

// Oldest → newest left to right, so the depletion reads the way a chart should
// even though the list below it is newest-first. Each bar is coloured by that
// observation's OWN runway, so a series can visibly go from green to orange as
// the company burns down — that progression is the point of the chart.
function CashBars({ rows }: { rows: PortfolioCash[] }) {
  const pts = sortCash(rows).slice().reverse().filter((r) => r.cash_on_hand != null)
  if (pts.length < 2) return null

  // Headroom so the tallest bar isn't flush against the top edge.
  const max = Math.max(1, ...pts.map((r) => Number(r.cash_on_hand))) * 1.08
  const ticks = cashTicks(max)

  return (
    <div className="px-4 pt-3 pb-4 border-b border-slate-100">
      <div className="flex gap-2">
        {/* Y axis. Bar heights were previously readable only against each other —
            without a scale, a 13-month series looked identical whether it ran
            $40M to $8M or $4M to $800K. Ticks are round numbers below the top of
            the scale rather than a rounded-up max, so the bars keep their height. */}
        <div className="shrink-0 w-11" style={{ paddingTop: CAP_H + 4 }} aria-hidden>
          <div className="relative" style={{ height: PLOT_H }}>
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 text-[9px] leading-none tabular-nums text-slate-400"
                style={{ bottom: `${(t / max) * 100}%` }}
              >
                {fmtAxisTick(t)}
              </span>
            ))}
          </div>
        </div>

        <div className="relative flex-1 min-w-0">
          {/* Gridlines sit behind the bars and share the tick geometry exactly —
              same top offset, same height — so a bar can be read off the axis. */}
          <div className="pointer-events-none absolute inset-x-0" style={{ top: CAP_H + 4, height: PLOT_H }}>
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute inset-x-0 border-t border-slate-100"
                style={{ bottom: `${(t / max) * 100}%` }}
              />
            ))}
          </div>

          <div className="flex items-start gap-3 overflow-x-auto">
        {pts.map((row) => {
          const r = runwayMonths(row)
          const fill = runwayBandColor(r?.months)
          const tip = [
            exactDate(row.as_of),
            `Cash: ${fmtMoney(row.cash_on_hand)}`,
            row.monthly_burn != null
              ? Number(row.monthly_burn) <= 0 ? "Burn: none reported" : `Burn: ${fmtMoney(row.monthly_burn)}/mo`
              : "Burn: not reported",
            r ? `Runway: ${fmtMonths(r.months)} (${r.basis})` : null,
            row.source ?? null,
          ].filter(Boolean).join("\n")

          return (
            <div key={row.id} className="flex flex-col items-center gap-1 shrink-0 min-w-[3.5rem]">
              {/* The runway length in text as well as colour — colour alone can't
                  carry the verdict for protan viewers. */}
              <span
                className="text-[9px] leading-none tabular-nums"
                style={{ color: r ? fill : "transparent", height: CAP_H }}
              >
                {r ? fmtMonths(r.months) : "—"}
              </span>
              <div className="relative w-9" style={{ height: PLOT_H }} title={tip}>
                <div
                  className="absolute inset-x-0 bottom-0 rounded-t"
                  style={{ height: `${Math.max(2, (Number(row.cash_on_hand) / max) * 100)}%`, backgroundColor: fill }}
                />
              </div>
              <span className="text-[10px] text-slate-500 leading-none">
                {new Date(row.as_of + "T00:00:00").toLocaleDateString("en-US", { month: "short" })}
              </span>
              <span className="text-[9px] text-slate-400 leading-none h-2.5">
                {new Date(row.as_of + "T00:00:00").getFullYear()}
              </span>
            </div>
          )
        })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: GREEN }} /> {RUNWAY_BANDS.caution}+ mo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: NAVY }} /> {RUNWAY_BANDS.acute}–{RUNWAY_BANDS.caution} mo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: ORANGE }} /> {RUNWAY_BANDS.critical}–{RUNWAY_BANDS.acute} mo
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: RED }} /> under {RUNWAY_BANDS.critical} mo or lapsed
        </span>
        <span>Bar height is cash; colour is that date&apos;s runway.</span>
      </div>
    </div>
  )
}

// ─── observation editor ───────────────────────────────────────────────────────
function CashEditor({
  companyId, existing, initial, onDone, onCancel,
}: {
  companyId: string
  existing: PortfolioCash[]
  initial?: PortfolioCash
  onDone: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const isNew = !initial
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [f, setF] = useState({
    as_of: initial?.as_of ?? "",
    cash_on_hand: numToStr(initial?.cash_on_hand),
    monthly_burn: numToStr(initial?.monthly_burn),
    burn_basis: initial?.burn_basis ?? "Net burn",
    runway_months: numToStr(initial?.runway_months),
    out_of_cash_date: initial?.out_of_cash_date ?? "",
    committed_funding: numToStr(initial?.committed_funding),
    source: initial?.source ?? "Board deck",
    source_detail: initial?.source_detail ?? "",
    notes: initial?.notes ?? "",
  })
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  // ── the stated runway, as ONE claim entered in one of two units ──────────
  // `runway_months` and `out_of_cash_date` are the same statement — a deck
  // saying "cash into Q2 2027" and one saying "11 months" mean the same thing,
  // and statedRunwayMonths() already accepts either. Two boxes side by side
  // read as two separate facts, and nothing stopped both being filled with
  // contradictory values (months silently won). One control, one unit.
  //
  // Date is the default because it's what a deck usually gives and what the
  // table displays. Months is kept for the case that motivated the column:
  // Dimension Bio's "12+ months of runway", a duration with no date attached —
  // pinning that to a specific day would assert a precision nobody stated.
  const [statedUnit, setStatedUnit] = useState<"date" | "months">(
    initial?.runway_months != null ? "months" : "date",
  )

  // Live preview of what will be stored, so a $000s figure entered by mistake is
  // obvious before saving rather than after it reaches the portfolio page.
  const preview = (() => {
    const cash = parseNum(f.cash_on_hand)
    const burn = parseNum(f.monthly_burn)
    if (cash == null || burn == null || burn <= 0) return null
    return cash / burn
  })()

  async function save() {
    if (!f.as_of) { setError("Enter the date the cash balance was measured."); return }
    if (!f.cash_on_hand.trim() && !f.monthly_burn.trim()) {
      setError("Enter a cash balance or a monthly burn (or both)."); return
    }
    const numErr =
      numError("Cash on hand", f.cash_on_hand) ??
      numError("Monthly burn", f.monthly_burn) ??
      numError("Runway (months)", f.runway_months) ??
      numError("Committed funding", f.committed_funding)
    if (numErr) { setError(numErr); return }
    // UNIQUE (company_id, as_of) — catch it here so the message is readable
    // rather than a Postgres 23505.
    const clash = existing.find((r) => r.id !== initial?.id && r.as_of === f.as_of)
    if (clash) { setError(`An observation for ${exactDate(f.as_of)} already exists — edit that row instead.`); return }
    if (f.out_of_cash_date && f.out_of_cash_date < f.as_of) {
      setError("The out-of-cash date is before the balance date."); return
    }

    setSaving(true)
    setError("")
    // Stamp WHO, not just when. A Basking figure was changed by an unidentified
    // hand and only the timestamp survived — see supabase/migration_runway_audit.sql.
    const { data: auth } = await supabase.auth.getUser()
    const uid = auth?.user?.id ?? null
    const payload = {
      company_id: companyId,
      as_of: f.as_of,
      cash_on_hand: parseNum(f.cash_on_hand),
      monthly_burn: parseNum(f.monthly_burn),
      burn_basis: f.burn_basis || null,
      // Only the selected unit is persisted, and the other is explicitly nulled
      // rather than left alone — otherwise switching a saved row from months to a
      // date would leave the old months behind, and statedRunwayMonths() prefers
      // months, so the date you just typed would be silently ignored.
      runway_months: statedUnit === "months" ? parseNum(f.runway_months) : null,
      out_of_cash_date: statedUnit === "date" ? f.out_of_cash_date || null : null,
      committed_funding: parseNum(f.committed_funding),
      source: f.source || null,
      source_detail: f.source_detail || null,
      notes: f.notes || null,
      updated_at: new Date().toISOString(),
      updated_by: uid,
    }
    const { error: e } = isNew
      // created_by is set on insert only, so it always records the original author.
      ? await supabase.from("portfolio_cash").insert({ ...payload, created_by: uid })
      : await supabase.from("portfolio_cash").update(payload).eq("id", initial!.id)
    if (e) { setError(saveHint(e.message)); setSaving(false); return }
    setSaving(false)
    onDone()
  }

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-4 gap-3">
        <Field label="Balance date *">
          <input type="date" value={f.as_of} onChange={(e) => set("as_of", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Cash on hand">
          <input placeholder="$ e.g. 4.2M" value={f.cash_on_hand} onChange={(e) => set("cash_on_hand", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Monthly burn">
          <input placeholder="$ e.g. 450K" value={f.monthly_burn} onChange={(e) => set("monthly_burn", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Burn basis">
          <select value={f.burn_basis} onChange={(e) => set("burn_basis", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {BURN_BASES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          {/* Toggle sits next to its label, not pushed to the far edge of the
              two-column span — at that distance it reads as belonging to the
              field beside it. */}
          <div className="flex items-center gap-2 mb-1">
            <label className="block text-xs text-slate-500">Runway the company stated</label>
            {/* Switching unit clears the other column, so the two can never both
                hold a value and disagree. */}
            <select
              value={statedUnit}
              onChange={(e) => {
                const u = e.target.value as "date" | "months"
                setStatedUnit(u)
                setF((p) => ({ ...p, runway_months: "", out_of_cash_date: "" }))
              }}
              className="text-xs text-slate-500 bg-transparent border border-slate-200 rounded-md px-1.5 py-0.5"
            >
              <option value="date">as a date</option>
              <option value="months">as months</option>
            </select>
          </div>
          {statedUnit === "date" ? (
            <input
              type="date"
              value={f.out_of_cash_date}
              onChange={(e) => set("out_of_cash_date", e.target.value)}
              className={inputCls}
            />
          ) : (
            <input
              placeholder="blank if not stated"
              value={f.runway_months}
              onChange={(e) => set("runway_months", e.target.value)}
              className={inputCls}
            />
          )}
          <p className="text-[11px] text-slate-400 mt-1">
            {statedUnit === "date"
              ? "The out-of-cash date the deck gives. Blank if it doesn't state one."
              : "Counted from the balance date. For a deck that gives a duration, not a date."}
          </p>
        </div>
        <Field label="Committed, not yet funded">
          <input placeholder="$ blank if none" value={f.committed_funding} onChange={(e) => set("committed_funding", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Source">
          <select value={f.source} onChange={(e) => set("source", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {CASH_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Source detail">
          <input placeholder="deck name, slide number…" value={f.source_detail} onChange={(e) => set("source_detail", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <textarea
          rows={2}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={`${inputCls} resize-none`}
          placeholder="Why burn is set to change, financing in progress, one-off payments…"
        />
      </div>
      {preview != null && (
        <p className="text-xs text-slate-500">
          Cash ÷ burn = <span className="tabular-nums" style={{ color: runwayBandColor(preview) }}>{fmtMonths(preview)}</span>
          {(statedUnit === "months" ? f.runway_months.trim() : f.out_of_cash_date)
            ? " — compared against the stated figure once saved."
            : ". Enter dollars, not thousands."}
        </p>
      )}
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
          style={{ backgroundColor: NAVY }}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {isNew ? "Add snapshot" : "Save snapshot"}
        </button>
      </div>
    </div>
  )
}
