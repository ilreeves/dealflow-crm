"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, Loader2, Pencil, LineChart } from "lucide-react"
import {
  PortfolioRevenue,
  REVENUE_PERIODS,
  REVENUE_PROJECTED_SOURCES,
  REVENUE_REVISED_SOURCES,
  REVENUE_ACTUAL_SOURCES,
} from "@/lib/types"
import { createClient } from "@/lib/supabase/client"
import { parseNum, numToStr, numError, fmtMoney, saveHint, exactDate, inputCls } from "@/lib/rounds"
import {
  periodLabel,
  periodEnd,
  variance,
  varianceBandColor,
  QUARTER_TYPES,
  annualProjection,
  annualActual,
  fmtSignedPct,
  yoyGrowth,
  latestActual,
  plannedPeriods,
  annualMismatch,
  sortRows,
  planValue,
  isRevised,
  axisTicks,
  VARIANCE_BAND_PCT,
  SEVERE_MISS_PCT,
} from "@/lib/revenue"
import Field from "@/components/shared/Field"

const NAVY = "#023a51"  // variance colours come from varianceBandColor

// Revenue, projected against actual, one row per fiscal period. Rows are held
// newest-first throughout — the stat cards and the YoY lookup both rely on that
// order, so re-sort after every mutation rather than appending.
export default function RevenueTab({ companyId }: { companyId: string }) {
  const supabase = createClient()
  const [rows, setRows] = useState<PortfolioRevenue[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error: e } = await supabase
      .from("portfolio_revenue")
      .select("*")
      .eq("company_id", companyId)
      .order("period_end", { ascending: false, nullsFirst: false })
    if (e) setError(saveHint(e.message))
    // period_end alone leaves FY-vs-Q4 (and H1-vs-Q2) ties, so re-sort locally.
    setRows(sortRows((data as PortfolioRevenue[]) ?? []))
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  useEffect(() => {
    load()
  }, [load])

  async function handleDelete(id: string) {
    const { error: e } = await supabase.from("portfolio_revenue").delete().eq("id", id)
    if (e) { setError("Couldn't delete that period: " + e.message); return }
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (editingId === id) setEditingId(null)
  }

  // ── headline figures ──
  // This tab reports the plan now in force, so everything below is on the REVISED
  // basis (restatement where one exists, original otherwise). The original is
  // carried alongside rather than dropped — /analytics scores reliability on it,
  // and a target that moved is worth seeing move.
  const last = latestActual(rows)
  const thisYear = new Date().getFullYear()
  const proj = annualProjection(rows, thisYear, "revised")
  const projOriginal = annualProjection(rows, thisYear, "original")
  const planParts = proj ? [] : plannedPeriods(rows, thisYear, "revised")
  // FY rows that contradict their own quarters. Both are legitimate and the FY
  // row wins by convention, so this only surfaces the conflict — it never edits.
  // Each basis reconciles only against itself; an original is never compared
  // with a restatement.
  const mismatches = Array.from(new Set(rows.map((r) => r.fiscal_year)))
    .sort((a, b) => b - a)
    .flatMap((y) =>
      (["projected", "revised_projected", "actual"] as const).map((f) => ({
        year: y,
        field: f,
        m: annualMismatch(rows, y, f),
      })),
    )
    .filter((x) => x.m)
  // Reported periods with no plan on EITHER basis. These drop out of variance
  // silently, so the company reads fine while the quarters go unmeasured —
  // Vesalio's 2025 was three of four. Flagged here rather than as a column on the
  // Revenue page: it's a note about one company, not something to scan a table for.
  const unplanned = rows.filter((r) => r.actual != null && planValue(r, "revised") == null)
  const lastVar = last ? variance(last, "revised") : null
  const lastVarOriginal = last && isRevised(last) ? variance(last, "original") : null
  const lastYoy = last ? yoyGrowth(rows, last) : null

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-2.5">
        <Stat
          label="Latest actual"
          value={fmtMoney(last?.actual)}
          sub={last ? periodLabel(last) : undefined}
        />
        <Stat
          label={`FY ${thisYear} plan`}
          value={proj ? fmtMoney(proj.value) : "—"}
          sub={
            proj
              ? [
                  proj.basis !== "FY" ? `sum of ${proj.basis}` : null,
                  // Only when the restatement actually moved the number.
                  proj.revised && projOriginal?.value !== proj.value
                    ? `revised · orig ${projOriginal ? fmtMoney(projOriginal.value) : "incomplete"}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              : planParts.length
                ? `${planParts.join(" + ")} planned only`
                : undefined
          }
        />
        <Stat
          label="vs plan"
          value={lastVar ? fmtSignedPct(lastVar.pct) : "—"}
          sub={
            lastVar
              ? lastVarOriginal
                ? `${fmtSignedPct(lastVarOriginal.pct)} vs original plan`
                : `${fmtMoney(Math.abs(lastVar.abs))} ${lastVar.abs >= 0 ? "above" : "below"}`
              : undefined
          }
          accent={lastVar ? varianceBandColor(lastVar.pct) : undefined}
        />
        <Stat
          label="YoY growth"
          value={lastYoy != null ? fmtSignedPct(lastYoy) : "—"}
          sub={last && lastYoy != null ? `${last.period_type} ${last.fiscal_year - 1} → ${last.fiscal_year}` : undefined}
          accent={lastYoy != null ? varianceBandColor(lastYoy) : undefined}
        />
      </div>
      <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
        {rows.length === 0
          ? "Add a fiscal period to start tracking plan against actual revenue."
          : "Variance compares an actual to the plan for the same period — the revised plan where one was entered, the original otherwise. Both are kept, and the original is what Analytics scores projection reliability against. Periods with no actual reported yet are left blank rather than counted as a shortfall."}
      </p>

      {/* Projected vs actual by period */}
      <div className="border border-slate-200 rounded-xl bg-white">
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <LineChart className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-600">Revenue by period</span>
            <span className="text-xs text-slate-400">projected vs actual</span>
          </div>
          {!adding && !editingId && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 transition"
            >
              <Plus className="w-3.5 h-3.5" /> Add period
            </button>
          )}
        </div>

        {adding && (
          <div className="border-t border-slate-100">
            <RevenueEditor
              companyId={companyId}
              existing={rows}
              onCancel={() => setAdding(false)}
              onDone={() => { setAdding(false); load() }}
            />
          </div>
        )}

        {(mismatches.length > 0 || unplanned.length > 0) && (
          <div className="border-t border-slate-100 px-4 py-2 space-y-1 bg-amber-50/60">
            {mismatches.map(({ year, field, m }) => (
              <p key={`${year}-${field}`} className="text-xs text-amber-800">
                <span className="font-medium">
                  FY {year}{" "}
                  {field === "projected" ? "original plan" : field === "revised_projected" ? "revised plan" : "actual"}
                </span>{" "}
                is {fmtMoney(m!.fy)} but the four quarters sum to {fmtMoney(m!.quarters)} —{" "}
                {fmtSignedPct(m!.pct)}. The FY row is used; worth confirming which is right.
              </p>
            ))}
            {unplanned.length > 0 && (
              <p className="text-xs text-amber-800">
                <span className="font-medium">
                  {unplanned.length} reported period{unplanned.length === 1 ? "" : "s"} with no plan
                </span>{" "}
                — {unplanned.map((r) => periodLabel(r)).join(", ")} — so {unplanned.length === 1 ? "it doesn't" : "they don't"}{" "}
                appear in any variance figure.
              </p>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="border-t border-slate-100">
            <RevenueBars rows={rows} />
            <div className="divide-y divide-slate-50">
              {rows.map((r) =>
                editingId === r.id ? (
                  <div key={r.id}>
                    <RevenueEditor
                      companyId={companyId}
                      existing={rows}
                      initial={r}
                      onCancel={() => setEditingId(null)}
                      onDone={() => { setEditingId(null); load() }}
                    />
                  </div>
                ) : (
                  <RevenueRow
                    key={r.id}
                    row={r}
                    yoy={yoyGrowth(rows, r)}
                    onEdit={() => { setEditingId(r.id); setAdding(false) }}
                    onDelete={() => handleDelete(r.id)}
                  />
                ),
              )}
            </div>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
    </div>
  )
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: accent ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

// ─── one period row ───────────────────────────────────────────────────────────
function RevenueRow({
  row, yoy, onEdit, onDelete,
}: {
  row: PortfolioRevenue
  yoy: number | null
  onEdit: () => void
  onDelete: () => void
}) {
  const v = variance(row, "revised")
  const revised = isRevised(row)
  return (
    <div className="px-4 py-2.5 group">
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-600 shrink-0 w-[4.5rem]">
          {periodLabel(row)}
        </span>
        {/* The plan in force, with the original kept beside it when the target
            moved. Struck through rather than hidden: a restatement is a fact about
            the period, and replacing the number outright would erase it. */}
        <div className="flex items-baseline gap-1.5 w-32 shrink-0">
          <span className="text-xs text-slate-400">{revised ? "rev plan" : "plan"}</span>
          <span className="text-slate-600 tabular-nums">{fmtMoney(planValue(row, "revised"))}</span>
        </div>
        <div className="flex items-baseline gap-1.5 w-24 shrink-0">
          {revised && row.projected != null && (
            <span className="text-xs text-slate-400 tabular-nums line-through" title="Original plan">
              {fmtMoney(row.projected)}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5 w-32 shrink-0">
          <span className="text-xs text-slate-400">actual</span>
          <span className="font-medium tabular-nums" style={{ color: row.actual != null ? NAVY : undefined }}>
            {row.actual != null ? fmtMoney(row.actual) : <span className="text-slate-300">not reported</span>}
          </span>
        </div>
        <span className="flex-1 text-xs tabular-nums" style={{ color: varianceBandColor(v?.pct) }}>
          {v ? `${fmtSignedPct(v.pct)} vs plan` : ""}
        </span>
        {yoy != null && (
          <span className="text-xs tabular-nums shrink-0" style={{ color: varianceBandColor(yoy) }}>
            {fmtSignedPct(yoy)} YoY
          </span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
          <button onClick={onEdit} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {(row.projected_source || row.revised_source || row.actual_source || row.projected_as_of || row.notes) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 pl-[5.25rem] text-xs text-slate-400">
          {row.projected_source && (
            <span>
              plan: {row.projected_source}
              {row.projected_as_of ? ` (${exactDate(row.projected_as_of)})` : ""}
            </span>
          )}
          {row.revised_source && (
            <span>
              revised: {row.revised_source}
              {row.revised_as_of ? ` (${exactDate(row.revised_as_of)})` : ""}
            </span>
          )}
          {row.actual_source && <span>actual: {row.actual_source}</span>}
          {row.notes && <span className="text-slate-500">{row.notes}</span>}
        </div>
      )}
    </div>
  )
}

// ─── target bars: actual as the bar, plan as a tick ───────────────────────────
// ONE CADENCE AT A TIME, chosen by the toggle. Mixing them is what made the old
// chart misleading: an FY bar sat beside the four quarters that compose it, so
// the tallest bar was a sum of its own neighbours. The toggle keeps the annual
// view — which is where a 2023→2026 trajectory actually reads — without ever
// putting two cadences on one axis. Half-year rows are drawn in neither view.
//
// Oldest → newest left to right, so the trend reads the way a chart should even
// though the list below it is newest-first.
type ChartPoint = {
  key: string
  label: string
  /** Year caption under a quarter; blank when it repeats the one to its left. */
  group: string
  /** The plan in force — revised where one exists. This is what the bar is scored against. */
  projected: number | null
  /** The original plan, drawn as a second, fainter tick when the target moved. */
  original: number | null
  actual: number | null
  /** Tooltip detail when a figure was derived rather than entered as an FY row. */
  basis: string | null
}

function quarterPoints(rows: PortfolioRevenue[]): ChartPoint[] {
  const chron = rows.filter((r) => QUARTER_TYPES.has(r.period_type)).slice().reverse()
  return chron.map((r, i) => ({
    key: r.id,
    label: r.period_type,
    group: i === 0 || chron[i - 1].fiscal_year !== r.fiscal_year ? String(r.fiscal_year) : "",
    projected: planValue(r, "revised"),
    original: isRevised(r) ? planValue(r, "original") : null,
    actual: r.actual != null ? Number(r.actual) : null,
    basis: null,
  }))
}

function annualPoints(rows: PortfolioRevenue[]): ChartPoint[] {
  const years = Array.from(new Set(rows.map((r) => r.fiscal_year))).sort((a, b) => a - b)
  return years
    .map((y) => {
      const p = annualProjection(rows, y, "revised")
      const orig = annualProjection(rows, y, "original")
      const a = annualActual(rows, y)
      const derived = [
        p && p.basis !== "FY" ? `plan summed from ${p.basis}` : null,
        a && a.basis !== "FY" ? `actual summed from ${a.basis}` : null,
      ].filter(Boolean)
      return {
        key: `fy-${y}`,
        label: String(y),
        group: "",
        projected: p?.value ?? null,
        // Only when the restatement moved the annual figure — an identical
        // second tick would just look like a rendering fault.
        original: p?.revised && orig && orig.value !== p.value ? orig.value : null,
        actual: a?.value ?? null,
        basis: derived.length ? derived.join("\n") : null,
      }
    })
    .filter((pt) => pt.projected != null || pt.actual != null)
}

// Chart geometry, in rem. The plot band is h-20; above it sits the variance
// readout (h-2.5) and a gap-1. The Y axis and its gridlines have to skip exactly
// that much to line up with the bars, so the three are defined together — change
// one without the others and the axis silently drifts off the bars.
const PLOT_BAND_REM = 5
const PLOT_TOP_OFFSET_REM = 0.625 + 0.25

function RevenueBars({ rows }: { rows: PortfolioRevenue[] }) {
  const [mode, setMode] = useState<"quarterly" | "annual">("quarterly")
  const quarterly = quarterPoints(rows)
  const annual = annualPoints(rows)
  const pts = mode === "quarterly" ? quarterly : annual

  const toggle = (
    <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 shrink-0">
      {(["quarterly", "annual"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setMode(m)}
          aria-pressed={mode === m}
          className={`px-2 py-0.5 text-[11px] rounded-md capitalize transition ${
            mode === m ? "bg-white text-slate-700 shadow-sm font-medium" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )

  if (!pts.length) {
    return (
      <div className="px-4 pt-3 pb-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <p className="text-xs text-slate-400">
          {mode === "quarterly"
            ? "No quarterly periods recorded yet."
            : "No complete year yet — an annual bar needs an FY row, or all four quarters."}
        </p>
        {toggle}
      </div>
    )
  }

  // Headroom so the tallest plan tick never sits flush against the top edge.
  const max = Math.max(1, ...pts.flatMap((p) => [p.projected ?? 0, p.original ?? 0, p.actual ?? 0])) * 1.08

  const ticks = axisTicks(max)

  // Fit the whole series without scrolling: columns share the available width
  // rather than claiming a fixed 3.5rem. The bar caps at its original 36px, so
  // a 6-quarter company looks exactly as it did; only Francis (20 quarters) and
  // Eirsystems (16) actually compress.
  //
  // ⚠️ HISTORY IS DELIBERATELY NOT WINDOWED HERE, unlike the runway chart.
  // Isaiah, 2026-08-11: "I do think having historical data (previous years) is
  // good to see here." Runway is a question about what happens next, so a
  // two-year-old balance costs a column and settles nothing; revenue is a
  // trajectory, and the 2023 → 2026 shape IS the finding.
  //
  // Quarter labels ("Q1") are narrow enough to survive compression. The signed
  // variance caption ("+10.3%", ~30px) is not: at 20 quarters the column is
  // ~27px, so any two adjacent captions overlap. Thinning to every other column
  // does NOT fix it — reported periods cluster at the start of a series, so
  // Francis put -28.6% and -57.9% side by side anyway.
  //
  // So when dense, show only the most recently SCORED period. That is the read
  // someone is actually looking for, every other variance is stated exactly in
  // the table below, and it matches what the runway chart does with its runway
  // caption for the same reason.
  const dense = pts.length > 14
  const lastScored = pts
    .map((pt) => variance({ projected: pt.projected, actual: pt.actual })?.pct != null)
    .lastIndexOf(true)
  const shownVariance = (i: number) => !dense || i === lastScored

  return (
    <div className="px-4 pt-3 pb-4 border-b border-slate-100">
      <div className="flex items-center justify-end mb-1">{toggle}</div>
      <div className="flex gap-1.5">
        {/* Y axis. Mirrors a bar column's row structure — spacer, plot band,
            caption, caption — so the ticks align with the bars by construction
            rather than by a hand-tuned offset. */}
        <div className="flex flex-col gap-1 shrink-0 w-12" aria-hidden="true">
          <span className="h-2.5" />
          <div className="relative h-20">
            {ticks.map((t) => (
              <span
                key={t}
                className="absolute right-0 translate-y-1/2 text-[9px] leading-none tabular-nums text-slate-400"
                style={{ bottom: `${(t / max) * 100}%` }}
              >
                {fmtMoney(t)}
              </span>
            ))}
          </div>
          <span className="text-[10px] leading-none">&nbsp;</span>
          <span className="h-2.5" />
        </div>

        <div className="relative flex-1 min-w-0">
          {/* Gridlines share the plot band's geometry exactly — same top offset,
              same height — so a bar can be read off the axis. (They used to be
              anchored against scrolling content; the bars no longer scroll.) */}
          <div
            className="absolute inset-x-0 pointer-events-none"
            style={{ top: `${PLOT_TOP_OFFSET_REM}rem`, height: `${PLOT_BAND_REM}rem` }}
          >
            {ticks.map((t) => (
              <div
                key={t}
                className={`absolute inset-x-0 border-t ${t === 0 ? "border-slate-200" : "border-slate-100"}`}
                style={{ bottom: `${(t / max) * 100}%` }}
              />
            ))}
          </div>

          <div className="relative flex items-end gap-1.5">
        {pts.map((pt, i) => {
          // Null is NOT zero on either side. A plan that was never recorded draws
          // no tick, and a period not yet reported draws a hollow stub — neither
          // may render as a short bar, which reads as "≈0" instead of "absent".
          const { projected: p, original: orig, actual: a } = pt
          const v = variance({ projected: p, actual: a })
          const fill = varianceBandColor(v?.pct)
          const tip = [
            mode === "quarterly" ? `${pt.label} ${pt.group || ""}`.trim() : `FY ${pt.label}`,
            `Plan${orig != null ? " (revised)" : ""}: ${p != null ? fmtMoney(p) : "not recorded"}`,
            orig != null ? `Original plan: ${fmtMoney(orig)}` : null,
            `Actual: ${a != null ? fmtMoney(a) : "not reported yet"}`,
            v?.pct != null ? `Variance: ${fmtSignedPct(v.pct)}` : null,
            pt.basis,
          ]
            .filter(Boolean)
            .join("\n")

          return (
            <div key={pt.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
              {/* Signed variance, always shown alongside the fill. Green and orange
                  are indistinguishable to protan viewers, so the colour is never
                  the only thing saying whether a period beat or missed. */}
              <span
                className="text-[9px] leading-none tabular-nums h-2.5 whitespace-nowrap"
                style={{ color: v?.pct != null && shownVariance(i) ? fill : "transparent" }}
              >
                {v?.pct != null && shownVariance(i) ? fmtSignedPct(v.pct) : "—"}
              </span>

              <div className="relative w-full max-w-9 h-20" title={tip}>
                {a != null ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t"
                    style={{ height: `${Math.max(2, (a / max) * 100)}%`, backgroundColor: fill }}
                  />
                ) : (
                  <div className="absolute inset-x-0 bottom-0 h-4 rounded-t border border-dashed border-slate-300" />
                )}
                {/* Original tick first, so the plan actually in force draws over it
                    if the two nearly coincide. */}
                {orig != null && (
                  <div
                    className="absolute -inset-x-1 border-t border-dashed border-slate-300"
                    style={{ bottom: `${(orig / max) * 100}%` }}
                  />
                )}
                {p != null && (
                  <div
                    className="absolute -inset-x-1 h-[2.5px] rounded-full bg-slate-400"
                    style={{ bottom: `calc(${(p / max) * 100}% - 1.25px)` }}
                  />
                )}
              </div>

              <span className="text-[10px] text-slate-500 leading-none">{pt.label}</span>
              <span className="text-[9px] text-slate-400 leading-none h-2.5">{pt.group}</span>
            </div>
          )
        })}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-400 flex-wrap">
        {/* Swatches are produced by varianceBandColor itself rather than local
            hexes, so this legend cannot drift from the rule it documents. */}
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: varianceBandColor(VARIANCE_BAND_PCT + 1) }} /> &gt;{VARIANCE_BAND_PCT}% ahead
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: varianceBandColor(0) }} /> Within {VARIANCE_BAND_PCT}%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: varianceBandColor(-VARIANCE_BAND_PCT - 1) }} /> &gt;{VARIANCE_BAND_PCT}% behind
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: varianceBandColor(-SEVERE_MISS_PCT - 1) }} /> &gt;{SEVERE_MISS_PCT}% behind
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-[2.5px] rounded-full bg-slate-400" /> Plan in force
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 border-t border-dashed border-slate-300" /> Original plan, where revised
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded border border-dashed border-slate-300" /> Not reported
        </span>
      </div>
    </div>
  )
}

// ─── period editor ────────────────────────────────────────────────────────────
/** A stored value that isn't in the current option list still gets an option, so
 *  editing an old row can't quietly blank its source. */
function withCurrent(list: readonly string[], current: string): string[] {
  return current && !list.includes(current) ? [...list, current] : [...list]
}

function RevenueEditor({
  companyId, existing, initial, onDone, onCancel,
}: {
  companyId: string
  existing: PortfolioRevenue[]
  initial?: PortfolioRevenue
  onDone: () => void
  onCancel: () => void
}) {
  const supabase = createClient()
  const isNew = !initial
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [f, setF] = useState({
    period_type: initial?.period_type ?? "FY",
    fiscal_year: String(initial?.fiscal_year ?? new Date().getFullYear()),
    projected: numToStr(initial?.projected),
    revised_projected: numToStr(initial?.revised_projected),
    actual: numToStr(initial?.actual),
    projected_source: initial?.projected_source ?? "",
    projected_as_of: initial?.projected_as_of ?? "",
    revised_source: initial?.revised_source ?? "",
    revised_as_of: initial?.revised_as_of ?? "",
    actual_source: initial?.actual_source ?? "",
    notes: initial?.notes ?? "",
  })
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  async function save() {
    const year = parseInt(f.fiscal_year, 10)
    if (!year || year < 2000 || year > 2100) { setError("Enter a fiscal year between 2000 and 2100."); return }
    if (!f.projected.trim() && !f.revised_projected.trim() && !f.actual.trim()) {
      setError("Enter an original plan, a revised plan, or an actual figure.")
      return
    }
    // Surface typos rather than letting them persist as null.
    const numErr =
      numError("Original plan", f.projected) ??
      numError("Revised plan", f.revised_projected) ??
      numError("Actual", f.actual)
    if (numErr) { setError(numErr); return }
    // The table has a UNIQUE (company, period_type, fiscal_year); catch the clash
    // here so the user gets a readable message instead of a Postgres 23505.
    const clash = existing.find(
      (r) => r.id !== initial?.id && r.period_type === f.period_type && r.fiscal_year === year,
    )
    if (clash) { setError(`${f.period_type} ${year} already exists — edit that row instead.`); return }

    setSaving(true)
    setError("")
    const payload = {
      company_id: companyId,
      period_type: f.period_type,
      fiscal_year: year,
      period_end: periodEnd(f.period_type, year),
      projected: parseNum(f.projected),
      revised_projected: parseNum(f.revised_projected),
      actual: parseNum(f.actual),
      projected_source: f.projected_source || null,
      projected_as_of: f.projected_as_of || null,
      revised_source: f.revised_source || null,
      revised_as_of: f.revised_as_of || null,
      actual_source: f.actual_source || null,
      notes: f.notes || null,
      updated_at: new Date().toISOString(),
    }
    const { error: e } = isNew
      ? await supabase.from("portfolio_revenue").insert(payload)
      : await supabase.from("portfolio_revenue").update(payload).eq("id", initial!.id)
    if (e) { setError(saveHint(e.message)); setSaving(false); return }
    setSaving(false)
    onDone()
  }

  return (
    <div className="p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-4 gap-3">
        <Field label="Period *">
          <select value={f.period_type} onChange={(e) => set("period_type", e.target.value)} className={inputCls}>
            {REVENUE_PERIODS.map((p) => <option key={p} value={p}>{p === "FY" ? "FY (full year)" : p}</option>)}
          </select>
        </Field>
        <Field label="Fiscal year *">
          <input type="number" min={2000} max={2100} value={f.fiscal_year} onChange={(e) => set("fiscal_year", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Original plan">
          <input placeholder="$ e.g. 4.5M" value={f.projected} onChange={(e) => set("projected", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Actual">
          <input placeholder="$ blank if not reported" value={f.actual} onChange={(e) => set("actual", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Original plan source">
          {/* An unrecognised stored value is kept as an option so a row written
              before this list changed doesn't silently lose its source on save. */}
          <select value={f.projected_source} onChange={(e) => set("projected_source", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {withCurrent(REVENUE_PROJECTED_SOURCES, f.projected_source).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Original plan as of">
          <input type="date" value={f.projected_as_of} onChange={(e) => set("projected_as_of", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Actual source">
          <select value={f.actual_source} onChange={(e) => set("actual_source", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {withCurrent(REVENUE_ACTUAL_SOURCES, f.actual_source).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>

      {/* The restatement. Deliberately its own block rather than a second column
          next to "Original plan" — filling it in is a decision about the period,
          not a correction of the number to its left, and the original must survive
          it. Leave blank while the original still stands. */}
      <div className="grid grid-cols-3 gap-3 pt-1 border-t border-slate-200">
        <Field label="Revised plan">
          <input
            placeholder="$ blank if unchanged"
            value={f.revised_projected}
            onChange={(e) => set("revised_projected", e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Revised plan source">
          <select value={f.revised_source} onChange={(e) => set("revised_source", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {withCurrent(REVENUE_REVISED_SOURCES, f.revised_source).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Revised as of">
          <input type="date" value={f.revised_as_of} onChange={(e) => set("revised_as_of", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div>
        <label className="block text-xs text-slate-500 mb-1">Notes</label>
        <textarea
          rows={2}
          value={f.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={`${inputCls} resize-none`}
          placeholder="What drove the variance, revenue mix, one-offs…"
        />
      </div>
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
          style={{ backgroundColor: NAVY }}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {isNew ? "Add period" : "Save period"}
        </button>
      </div>
    </div>
  )
}
