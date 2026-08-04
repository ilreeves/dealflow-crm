import { fmtMoney } from "@/lib/rounds"
import { fmtSignedPct, varianceColor } from "@/lib/revenue"

// One company's revenue picture, pre-computed on the server. Kept flat on
// purpose — the annual roll-up rules (a partial year is never summed as if it
// were annual) live in lib/revenue.ts and run once, on the page.
export type CompanyRevenue = {
  name: string
  status: string | null
  /** Most recent period with a reported actual. */
  latestPeriod: string | null
  latestActual: number | null
  /** Plan for that same period, so the variance compares like with like. */
  latestProjected: number | null
  varianceAbs: number | null
  variancePct: number | null
  /** Annual projection for the current fiscal year, and how it was derived. */
  fyProjected: number | null
  fyProjectedBasis: string | null
  /** Last fully-reported year's actual, and the year it belongs to. */
  priorYearActual: number | null
  priorYear: number | null
  yoyPct: number | null
}

const NAVY = "#023a51", GREEN = "#5ba200"

// Portfolio-wide revenue. Individual companies carry their own periods on the
// Revenue tab; this is the one place the whole book is visible side by side.
export default function RevenueOverview({ companies, fiscalYear }: { companies: CompanyRevenue[]; fiscalYear: number }) {
  if (!companies.length) return null

  const fyPlanTotal = companies.reduce((s, c) => s + (c.fyProjected ?? 0), 0)
  const fyPlanCount = companies.filter((c) => c.fyProjected != null).length
  // Only companies whose prior year is FULLY reported contribute here, so the
  // total is a real annual figure rather than a mix of full and partial years.
  const priorTotal = companies.reduce((s, c) => s + (c.priorYearActual ?? 0), 0)
  const priorCount = companies.filter((c) => c.priorYearActual != null).length
  const priorYear = companies.find((c) => c.priorYear != null)?.priorYear ?? fiscalYear - 1

  const withVariance = companies.filter((c) => c.varianceAbs != null)
  const onPlan = withVariance.filter((c) => (c.varianceAbs as number) >= 0).length

  const sorted = [...companies].sort(
    (a, b) => (b.latestActual ?? -1) - (a.latestActual ?? -1) || (b.fyProjected ?? -1) - (a.fyProjected ?? -1) || a.name.localeCompare(b.name),
  )

  return (
    <div>
      <h2 className="text-base font-bold text-slate-900">Revenue</h2>
      <div className="h-0.5 w-12 mt-1 rounded-full mb-1" style={{ backgroundColor: GREEN }} />
      <p className="text-xs text-slate-400 mb-4">
        Projected against actual revenue across the portfolio. Each company&apos;s variance compares its latest reported
        period to the plan for that same period. Annual figures use a company&apos;s FY row, or its sub-periods only when
        the year is fully reported.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Tile label="Companies tracking" value={String(companies.length)} sub="with revenue recorded" />
        <Tile
          label={`FY ${fiscalYear} plan`}
          value={fmtMoney(fyPlanTotal)}
          sub={`${fyPlanCount} ${fyPlanCount === 1 ? "company" : "companies"}`}
        />
        <Tile
          label={`FY ${priorYear} actual`}
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

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Company</Th>
                <Th>Latest period</Th>
                <Th right>Actual</Th>
                <Th right>Plan</Th>
                <Th right>Variance</Th>
                <Th right>YoY</Th>
                <Th right>FY {fiscalYear} plan</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => (
                <tr key={c.name} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                    {c.name}
                    {c.status && c.status !== "Active" && (
                      <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-400">{c.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{c.latestPeriod ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: c.latestActual != null ? NAVY : undefined }}>
                    {c.latestActual != null ? fmtMoney(c.latestActual) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{fmtMoney(c.latestProjected)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: varianceColor(c.varianceAbs) }}>
                    {c.varianceAbs != null ? fmtSignedPct(c.variancePct) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: c.yoyPct != null ? (c.yoyPct >= 0 ? GREEN : "#e98925") : undefined }}>
                    {c.yoyPct != null ? fmtSignedPct(c.yoyPct) : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">
                    {c.fyProjected != null ? (
                      <span title={c.fyProjectedBasis ?? undefined}>{fmtMoney(c.fyProjected)}</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-2">
        A blank actual means the period hasn&apos;t been reported yet, not a shortfall. Totals only add companies whose
        figures cover the same basis — a company with a partial year is excluded from the annual actual rather than
        counted short.
      </p>
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
