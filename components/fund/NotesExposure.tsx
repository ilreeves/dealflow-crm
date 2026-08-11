import { fmtMoney, exactDate } from "@/lib/rounds"

export type NotePosition = {
  company: string
  fund: string
  note: string
  rate: number | null
  maturity: string | null
  principal: number
  accrued: number
  value: number
  status: string | null
}

const GREEN = "#5ba200", ORANGE = "#e98925", NAVY = "#023a51"

// Convertible-note exposure across the funds. Notes previously only surfaced on
// an individual company's page, so there was no way to see total principal out,
// interest accrued, or what's approaching maturity in one place.
export default function NotesExposure({ notes }: { notes: NotePosition[] }) {
  if (!notes.length) return null

  const principal = notes.reduce((s, n) => s + n.principal, 0)
  const accrued = notes.reduce((s, n) => s + n.accrued, 0)
  const value = notes.reduce((s, n) => s + n.value, 0)
  // Principal-weighted average coupon
  const rated = notes.filter((n) => n.rate != null && n.principal > 0)
  const wRate = rated.length
    ? rated.reduce((s, n) => s + (n.rate as number) * n.principal, 0) / rated.reduce((s, n) => s + n.principal, 0)
    : null
  const showMaturity = notes.some((n) => n.maturity)

  const byFund = new Map<string, NotePosition[]>()
  for (const n of notes) {
    if (!byFund.has(n.fund)) byFund.set(n.fund, [])
    byFund.get(n.fund)!.push(n)
  }

  return (
    <div>
      <h2 className="text-base font-bold text-slate-900">Convertible notes</h2>
      <div className="h-0.5 w-12 mt-1 rounded-full mb-1" style={{ backgroundColor: ORANGE }} />
      <p className="text-xs text-slate-400 mb-4">
        Principal outstanding and interest accrued across the funds. Accrued interest is unrealised until the note converts or is repaid.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Tile label="Principal out" value={fmtMoney(principal)} />
        <Tile label="Accrued interest" value={fmtMoney(accrued)} color="#3b6d11" />
        <Tile label="Carrying value" value={fmtMoney(value)} />
        <Tile label="Avg coupon" value={wRate != null ? `${wRate.toFixed(1)}%` : "—"} />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Company</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Note</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Rate</th>
                {showMaturity && <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Matures</th>}
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Principal</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Accrued</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Value</th>
              </tr>
            </thead>
            {Array.from(byFund.entries()).map(([fund, rows]) => {
              const fp = rows.reduce((s, n) => s + n.principal, 0)
              const fa = rows.reduce((s, n) => s + n.accrued, 0)
              const fv = rows.reduce((s, n) => s + n.value, 0)
              return (
                <tbody key={fund}>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <td colSpan={showMaturity ? 7 : 6} className="px-4 py-1.5 text-xs font-semibold text-slate-500">
                      {fund}
                      <span className="font-normal text-slate-400"> · {rows.length} note{rows.length === 1 ? "" : "s"}</span>
                    </td>
                  </tr>
                  {rows.map((n, i) => (
                    <tr key={`${n.company}-${n.note}-${i}`} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-700 whitespace-nowrap">{n.company}</td>
                      <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{n.note}</td>
                      <td className="px-4 py-2.5 text-right text-slate-500 tabular-nums">{n.rate != null ? `${n.rate}%` : "—"}</td>
                      {showMaturity && <td className="px-4 py-2.5 text-right text-slate-500 whitespace-nowrap">{n.maturity ? exactDate(n.maturity) : "—"}</td>}
                      <td className="px-4 py-2.5 text-right text-slate-600 tabular-nums">{fmtMoney(n.principal)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: n.accrued > 0 ? "#3b6d11" : undefined }}>{n.accrued > 0 ? fmtMoney(n.accrued) : "—"}</td>
                      <td className="px-4 py-2.5 text-right font-medium tabular-nums" style={{ color: NAVY }}>{fmtMoney(n.value)}</td>
                    </tr>
                  ))}
                  <tr className="border-b border-slate-100">
                    <td colSpan={showMaturity ? 4 : 3} className="px-4 py-2 text-xs text-slate-400">{fund} subtotal</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold text-slate-600 tabular-nums">{fmtMoney(fp)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: "#3b6d11" }}>{fmtMoney(fa)}</td>
                    <td className="px-4 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: NAVY }}>{fmtMoney(fv)}</td>
                  </tr>
                </tbody>
              )
            })}
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400 mt-2">
        Accrued interest is <span style={{ color: GREEN }}>{fmtMoney(accrued)}</span> on {fmtMoney(principal)} of principal
        {wRate != null ? ` at a ${wRate.toFixed(1)}% weighted coupon` : ""}
        {principal > 0 ? ` — ${((value / principal - 1) * 100).toFixed(1)}% above cost.` : "."}
      </p>
    </div>
  )
}

function Tile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5" style={{ color: color ?? "#0f172a" }}>{value}</p>
    </div>
  )
}
