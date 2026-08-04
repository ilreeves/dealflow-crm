"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, X, Loader2, ChevronRight, RotateCcw } from "lucide-react"
import { PortfolioCompany } from "@/lib/types"
import { CompanyRevenue, fmtSignedPct, varianceColor } from "@/lib/revenue"
import { fmtMoney } from "@/lib/rounds"
import { createClient } from "@/lib/supabase/client"
import PortfolioCompanyDetail from "@/components/portfolio/PortfolioCompanyDetail"

const NAVY = "#023a51", GREEN = "#5ba200", ORANGE = "#e98925"

// Revenue across the portfolio. Tracking is opt-in — most of the book is
// pre-revenue, so a company only appears here (and only gets a Revenue tab on
// its own page) once it's added to this roster.
export default function RevenueView({
  initial, companies, fiscalYear,
}: {
  initial: CompanyRevenue[]
  companies: PortfolioCompany[]
  fiscalYear: number
}) {
  const router = useRouter()
  const supabase = createClient()
  const [rows, setRows] = useState(initial)
  const [openId, setOpenId] = useState<string | null>(null)
  const [comps, setComps] = useState(companies)
  const [adding, setAdding] = useState(false)
  const [pick, setPick] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmRemove, setConfirmRemove] = useState<CompanyRevenue | null>(null)

  const listed = new Set(rows.map((r) => r.id))
  const addable = comps.filter((c) => !listed.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))

  async function setTracked(id: string, tracked: boolean) {
    setBusy(true)
    setError("")
    const { error: e } = await supabase.from("portfolio_companies").update({ track_revenue: tracked }).eq("id", id)
    if (e) {
      setError(
        /track_revenue|column|schema cache/i.test(e.message)
          ? "The revenue-tracking migration hasn't been run yet. Run supabase/migration_revenue_tracking.sql in Supabase, then reload. (" + e.message + ")"
          : "Couldn't update tracking: " + e.message,
      )
      setBusy(false)
      return false
    }
    setComps((prev) => prev.map((c) => (c.id === id ? { ...c, track_revenue: tracked } : c)))
    setBusy(false)
    return true
  }

  async function handleAdd() {
    if (!pick) return
    const company = comps.find((c) => c.id === pick)
    if (!company) return
    if (!(await setTracked(pick, true))) return
    setRows((prev) => [
      ...prev,
      {
        id: company.id, name: company.name, status: company.status, tracked: true, periodCount: 0,
        latestPeriod: null, latestActual: null, latestProjected: null, varianceAbs: null,
        variancePct: null, fyProjected: null, fyProjectedBasis: null, priorYearActual: null, yoyPct: null,
        // A freshly added company has no periods yet; router.refresh() fills these
        // in from the server once a plan or actual is entered.
        planYear: fiscalYear, pctOfPlan: null, pctOfPlanBasis: null,
      },
    ])
    setPick("")
    setAdding(false)
    router.refresh()
  }

  async function handleRetrack(row: CompanyRevenue) {
    if (!(await setTracked(row.id, true))) return
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, tracked: true } : r)))
    router.refresh()
  }

  async function handleRemove(row: CompanyRevenue) {
    if (!(await setTracked(row.id, false))) return
    // A company with figures recorded stays listed, flagged untracked — dropping
    // it would leave its data with nowhere to be seen. One with nothing recorded
    // just leaves the roster.
    setRows((prev) =>
      row.periodCount > 0
        ? prev.map((r) => (r.id === row.id ? { ...r, tracked: false } : r))
        : prev.filter((r) => r.id !== row.id),
    )
    setConfirmRemove(null)
    router.refresh()
  }

  // Header year for the annual-plan columns. Each row carries its own planYear
  // (most recent year with both a plan and a reported period); the header shows
  // the furthest-along one, and any row still on an earlier year is tagged.
  const planYear = rows.reduce((y, r) => Math.max(y, r.planYear), fiscalYear)

  const tracked = rows.filter((r) => r.tracked)
  const fyPlanTotal = tracked.reduce((s, c) => s + (c.fyProjected ?? 0), 0)
  const fyPlanCount = tracked.filter((c) => c.fyProjected != null).length
  // Only companies whose prior year is FULLY reported contribute, so the total is
  // a real annual figure rather than a mix of full and partial years.
  const priorTotal = tracked.reduce((s, c) => s + (c.priorYearActual ?? 0), 0)
  const priorCount = tracked.filter((c) => c.priorYearActual != null).length
  const withVariance = tracked.filter((c) => c.varianceAbs != null)
  const onPlan = withVariance.filter((c) => (c.varianceAbs as number) >= 0).length

  const openCompany = openId ? comps.find((c) => c.id === openId) : null

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Revenue</h1>
        <p className="text-sm text-slate-500">
          Projected against actual revenue for the revenue-generating portfolio · FY {fiscalYear}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl space-y-6">
          {/* Tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <Tile label="Companies tracked" value={String(tracked.length)} sub={`of ${comps.length} portfolio companies`} />
            <Tile label={`FY ${planYear} plan`} value={fmtMoney(fyPlanTotal)} sub={`${fyPlanCount} with a plan set`} />
            <Tile
              label={`FY ${fiscalYear - 1} actual`}
              value={priorCount ? fmtMoney(priorTotal) : "—"}
              color="#3b6d11"
              sub={priorCount ? `${priorCount} fully reported` : "no complete year yet"}
            />
            <Tile
              label="At or above plan"
              value={withVariance.length ? `${onPlan} / ${withVariance.length}` : "—"}
              sub={withVariance.length ? "latest reported period" : "no actual vs plan yet"}
            />
          </div>

          {/* Roster + figures */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <div>
                <p className="text-sm font-medium text-slate-700">Tracked companies</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Adding a company here gives it a Revenue tab on its own page, where the periods are entered.
                </p>
              </div>
              {!adding && (
                <button
                  onClick={() => setAdding(true)}
                  disabled={!addable.length}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:text-slate-900 hover:border-slate-300 disabled:opacity-40 transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add company
                </button>
              )}
            </div>

            {adding && (
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <select
                  value={pick}
                  onChange={(e) => setPick(e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="">Select a portfolio company…</option>
                  {addable.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.status && c.status !== "Active" ? ` (${c.status})` : ""}</option>
                  ))}
                </select>
                <button
                  onClick={handleAdd}
                  disabled={!pick || busy}
                  className="flex items-center gap-1.5 px-3 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
                  style={{ backgroundColor: NAVY }}
                >
                  {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Add
                </button>
                <button onClick={() => { setAdding(false); setPick("") }} className="px-3 py-2 text-sm text-slate-600 hover:text-slate-900 transition">
                  Cancel
                </button>
              </div>
            )}

            {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-2.5">{error}</p>}

            {rows.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <p className="text-sm text-slate-500">No companies tracked for revenue yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                  Add the ones that are generating revenue — the rest of the portfolio stays uncluttered.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[840px]">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <Th>Company</Th>
                      <Th>Latest period</Th>
                      <Th right>Actual</Th>
                      <Th right>Plan</Th>
                      <Th right>Variance</Th>
                      <Th right>YoY</Th>
                      <Th right>FY {planYear} plan</Th>
                      <Th right>% of plan</Th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setOpenId(c.id)}
                        className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer group"
                      >
                        <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                          {c.name}
                          {c.status && c.status !== "Active" && (
                            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">{c.status}</span>
                          )}
                          {!c.tracked && (
                            <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: "#faece7", color: "#993c1d" }}>
                              not tracked · {c.periodCount} period{c.periodCount === 1 ? "" : "s"} kept
                            </span>
                          )}
                          <ChevronRight className="inline w-3.5 h-3.5 ml-1.5 text-slate-300 opacity-0 group-hover:opacity-100 transition" />
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">
                          {c.latestPeriod ?? <span className="text-slate-300">nothing entered yet</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: c.latestActual != null ? NAVY : undefined }}>
                          {c.latestActual != null ? fmtMoney(c.latestActual) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fmtMoney(c.latestProjected)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: varianceColor(c.varianceAbs) }}>
                          {c.varianceAbs != null ? fmtSignedPct(c.variancePct) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: c.yoyPct != null ? (c.yoyPct >= 0 ? GREEN : ORANGE) : undefined }}>
                          {c.yoyPct != null ? fmtSignedPct(c.yoyPct) : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                          {c.fyProjected != null ? (
                            <span title={c.fyProjectedBasis ?? undefined}>{fmtMoney(c.fyProjected)}</span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        {/* How much of the annual plan is banked so far. Kept
                            deliberately neutral in colour: 41% through H1 is not
                            inherently good or bad, and every plan here is
                            back-loaded, so a pace-based colour would mislead. */}
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                          {c.pctOfPlan != null ? (
                            <span title={c.pctOfPlanBasis ?? undefined}>
                              {c.pctOfPlan.toFixed(1)}%
                              {c.planYear !== planYear && (
                                <span className="text-slate-300 ml-1">’{String(c.planYear).slice(2)}</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-2 py-2.5">
                          {c.tracked ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Confirm only when there's data to explain the fate of.
                                if (c.periodCount > 0) setConfirmRemove(c)
                                else handleRemove(c)
                              }}
                              title="Remove from revenue tracking"
                              className="p-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            // An untracked row stays listed, so the picker can't
                            // re-add it — this is the only way back.
                            <button
                              onClick={(e) => { e.stopPropagation(); handleRetrack(c) }}
                              title="Track revenue again"
                              className="p-1 text-slate-300 hover:text-slate-700 transition"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Click a company to open it and enter periods. A blank actual means the period hasn&apos;t been reported yet,
            not a shortfall. Annual totals only include companies whose year is fully reported, so a partial year is
            never counted as if it were a full one.
          </p>
        </div>
      </div>

      {openCompany && (
        <PortfolioCompanyDetail
          company={openCompany}
          initialTab="revenue"
          onClose={() => { setOpenId(null); router.refresh() }}
          onUpdated={(u) => setComps((prev) => prev.map((c) => (c.id === u.id ? u : c)))}
          onDeleted={(id) => {
            setComps((prev) => prev.filter((c) => c.id !== id))
            setRows((prev) => prev.filter((r) => r.id !== id))
            setOpenId(null)
          }}
        />
      )}

      {confirmRemove && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-base font-semibold text-slate-900 mb-2">Stop tracking revenue?</h3>
            <p className="text-sm text-slate-500 mb-6">
              <strong>{confirmRemove.name}</strong> has {confirmRemove.periodCount} period
              {confirmRemove.periodCount === 1 ? "" : "s"} recorded. Nothing is deleted — the figures stay, the company
              keeps a row here marked untracked, and its Revenue tab is hidden until you add it back.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmRemove(null)} className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition">
                Cancel
              </button>
              <button
                onClick={() => handleRemove(confirmRemove)}
                disabled={busy}
                className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 transition"
                style={{ backgroundColor: NAVY }}
              >
                Stop tracking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`${right ? "text-right" : "text-left"} px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap`}>
      {children}
    </th>
  )
}

function Tile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: color ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
