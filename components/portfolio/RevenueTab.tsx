"use client"

import { useState, useEffect, useCallback } from "react"
import { Plus, Trash2, Loader2, Pencil, LineChart } from "lucide-react"
import {
  PortfolioRevenue,
  REVENUE_PERIODS,
  REVENUE_PROJECTED_SOURCES,
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
} from "@/lib/revenue"
import Field from "@/components/shared/Field"

const NAVY = "#023a51", GREEN = "#5ba200", ORANGE = "#e98925"

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
  const last = latestActual(rows)
  const thisYear = new Date().getFullYear()
  const proj = annualProjection(rows, thisYear)
  const planParts = proj ? [] : plannedPeriods(rows, thisYear)
  // FY rows that contradict their own quarters. Both are legitimate and the FY
  // row wins by convention, so this only surfaces the conflict — it never edits.
  const mismatches = Array.from(new Set(rows.map((r) => r.fiscal_year)))
    .sort((a, b) => b - a)
    .flatMap((y) =>
      (["projected", "actual"] as const).map((f) => ({ year: y, field: f, m: annualMismatch(rows, y, f) })),
    )
    .filter((x) => x.m)
  const lastVar = last ? variance(last) : null
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
          label={`FY ${thisYear} projected`}
          value={proj ? fmtMoney(proj.value) : "—"}
          sub={
            proj
              ? proj.basis !== "FY"
                ? `sum of ${proj.basis}`
                : undefined
              : planParts.length
                ? `${planParts.join(" + ")} planned only`
                : undefined
          }
        />
        <Stat
          label="vs plan"
          value={lastVar ? fmtSignedPct(lastVar.pct) : "—"}
          sub={lastVar ? `${fmtMoney(Math.abs(lastVar.abs))} ${lastVar.abs >= 0 ? "above" : "below"}` : undefined}
          accent={lastVar ? varianceBandColor(lastVar.pct) : undefined}
        />
        <Stat
          label="YoY growth"
          value={lastYoy != null ? fmtSignedPct(lastYoy) : "—"}
          sub={last && lastYoy != null ? `${last.period_type} ${last.fiscal_year - 1} → ${last.fiscal_year}` : undefined}
          accent={lastYoy != null ? (lastYoy >= 0 ? GREEN : ORANGE) : undefined}
        />
      </div>
      <p className="text-xs text-slate-400 -mt-1.5 px-0.5">
        {rows.length === 0
          ? "Add a fiscal period to start tracking projected against actual revenue."
          : "Variance compares an actual to the projection for the same period. Periods with no actual reported yet are left blank rather than counted as a shortfall."}
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

        {mismatches.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 space-y-1 bg-amber-50/60">
            {mismatches.map(({ year, field, m }) => (
              <p key={`${year}-${field}`} className="text-xs text-amber-800">
                <span className="font-medium">FY {year} {field === "projected" ? "plan" : "actual"}</span>{" "}
                is {fmtMoney(m!.fy)} but the four quarters sum to {fmtMoney(m!.quarters)} —{" "}
                {fmtSignedPct(m!.pct)}. The FY row is used; worth confirming which is right.
              </p>
            ))}
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
  const v = variance(row)
  return (
    <div className="px-4 py-2.5 group">
      <div className="flex items-center gap-3 text-sm">
        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-600 shrink-0 w-[4.5rem]">
          {periodLabel(row)}
        </span>
        <div className="flex items-baseline gap-1.5 w-32 shrink-0">
          <span className="text-xs text-slate-400">plan</span>
          <span className="text-slate-600 tabular-nums">{fmtMoney(row.projected)}</span>
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
          <span className="text-xs tabular-nums shrink-0" style={{ color: yoy >= 0 ? GREEN : ORANGE }}>
            {fmtSignedPct(yoy)} YoY
          </span>
        )}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
          <button onClick={onEdit} className="p-1 text-slate-400 hover:text-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
          <button onClick={onDelete} className="p-1 text-slate-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
      </div>
      {(row.projected_source || row.actual_source || row.projected_as_of || row.notes) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 pl-[5.25rem] text-xs text-slate-400">
          {row.projected_source && (
            <span>
              plan: {row.projected_source}
              {row.projected_as_of ? ` (${exactDate(row.projected_as_of)})` : ""}
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
  projected: number | null
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
    projected: r.projected != null ? Number(r.projected) : null,
    actual: r.actual != null ? Number(r.actual) : null,
    basis: null,
  }))
}

function annualPoints(rows: PortfolioRevenue[]): ChartPoint[] {
  const years = Array.from(new Set(rows.map((r) => r.fiscal_year))).sort((a, b) => a - b)
  return years
    .map((y) => {
      const p = annualProjection(rows, y)
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
        actual: a?.value ?? null,
        basis: derived.length ? derived.join("\n") : null,
      }
    })
    .filter((pt) => pt.projected != null || pt.actual != null)
}

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
  const max = Math.max(1, ...pts.flatMap((p) => [p.projected ?? 0, p.actual ?? 0])) * 1.08

  return (
    <div className="px-4 pt-3 pb-4 border-b border-slate-100">
      <div className="flex items-center justify-end mb-1">{toggle}</div>
      <div className="flex items-end gap-3 h-32 overflow-x-auto">
        {pts.map((pt) => {
          // Null is NOT zero on either side. A plan that was never recorded draws
          // no tick, and a period not yet reported draws a hollow stub — neither
          // may render as a short bar, which reads as "≈0" instead of "absent".
          const { projected: p, actual: a } = pt
          const v = variance({ projected: p, actual: a })
          const fill = varianceBandColor(v?.pct)
          const tip = [
            mode === "quarterly" ? `${pt.label} ${pt.group || ""}`.trim() : `FY ${pt.label}`,
            `Plan: ${p != null ? fmtMoney(p) : "not recorded"}`,
            `Actual: ${a != null ? fmtMoney(a) : "not reported yet"}`,
            v?.pct != null ? `Variance: ${fmtSignedPct(v.pct)}` : null,
            pt.basis,
          ]
            .filter(Boolean)
            .join("\n")

          return (
            <div key={pt.key} className="flex flex-col items-center gap-1 shrink-0 min-w-[3.5rem]">
              {/* Signed variance, always shown alongside the fill. Green and orange
                  are indistinguishable to protan viewers, so the colour is never
                  the only thing saying whether a period beat or missed. */}
              <span
                className="text-[9px] leading-none tabular-nums h-2.5"
                style={{ color: v?.pct != null ? fill : "transparent" }}
              >
                {v?.pct != null ? fmtSignedPct(v.pct) : "—"}
              </span>

              <div className="relative w-9 h-20" title={tip}>
                {a != null ? (
                  <div
                    className="absolute inset-x-0 bottom-0 rounded-t"
                    style={{ height: `${Math.max(2, (a / max) * 100)}%`, backgroundColor: fill }}
                  />
                ) : (
                  <div className="absolute inset-x-0 bottom-0 h-4 rounded-t border border-dashed border-slate-300" />
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
      <div className="flex items-center gap-x-4 gap-y-1.5 mt-2 text-xs text-slate-400 flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: GREEN }} /> &gt;10% ahead
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: NAVY }} /> Within 10%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: ORANGE }} /> &gt;10% behind
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-[2.5px] rounded-full bg-slate-400" /> Plan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded border border-dashed border-slate-300" /> Not reported
        </span>
      </div>
    </div>
  )
}

// ─── period editor ────────────────────────────────────────────────────────────
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
    actual: numToStr(initial?.actual),
    projected_source: initial?.projected_source ?? "",
    projected_as_of: initial?.projected_as_of ?? "",
    actual_source: initial?.actual_source ?? "",
    notes: initial?.notes ?? "",
  })
  function set<K extends keyof typeof f>(k: K, v: (typeof f)[K]) { setF((p) => ({ ...p, [k]: v })) }

  async function save() {
    const year = parseInt(f.fiscal_year, 10)
    if (!year || year < 2000 || year > 2100) { setError("Enter a fiscal year between 2000 and 2100."); return }
    if (!f.projected.trim() && !f.actual.trim()) { setError("Enter a projected or an actual figure (or both)."); return }
    // Surface typos rather than letting them persist as null.
    const numErr = numError("Projected", f.projected) ?? numError("Actual", f.actual)
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
      actual: parseNum(f.actual),
      projected_source: f.projected_source || null,
      projected_as_of: f.projected_as_of || null,
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
        <Field label="Projected">
          <input placeholder="$ e.g. 4.5M" value={f.projected} onChange={(e) => set("projected", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Actual">
          <input placeholder="$ blank if not reported" value={f.actual} onChange={(e) => set("actual", e.target.value)} className={inputCls} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Projection source">
          <select value={f.projected_source} onChange={(e) => set("projected_source", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {REVENUE_PROJECTED_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Field label="Projection as of">
          <input type="date" value={f.projected_as_of} onChange={(e) => set("projected_as_of", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Actual source">
          <select value={f.actual_source} onChange={(e) => set("actual_source", e.target.value)} className={inputCls}>
            <option value="">—</option>
            {REVENUE_ACTUAL_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
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
