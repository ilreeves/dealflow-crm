"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { fmtMoney } from "@/lib/rounds"

export type SnapshotPoint = { date: string; invested: number; value: number }
export type FundSeries = { fund: string; points: SnapshotPoint[] }

function label(d: string): string {
  const dt = new Date(d + "T00:00:00")
  const m = dt.getMonth() + 1
  const y = dt.getFullYear()
  // Semi-annual marks land on Jun 30 / Dec 31 — H1/H2 reads cleaner than a date.
  // Any off-cycle (quarterly) mark falls back to a quarter label so two points
  // in the same half can't collide.
  if (m === 6) return `H1 ${y}`
  if (m === 12) return `H2 ${y}`
  return `Q${Math.ceil(m / 3)} ${y}`
}

const GREEN = "#5ba200", ORANGE = "#e98925", NAVY = "#023a51"

// Cost vs value at each semi-annual mark, per fund. Bars are scaled against the
// largest figure across every fund so the two charts stay visually comparable.
export default function ValuationHistory({ series, scaleMax, spvFunds }: {
  series: FundSeries[]
  scaleMax: number
  /** Vehicles to roll up — from Settings, so a new fund needs no code change. */
  spvFunds: string[]
}) {
  const [showSidecars, setShowSidecars] = useState(false)
  if (!series.length) return null

  // Sidecars are single-company vehicles with only one mark so far — charting each
  // separately is mostly noise, so they're combined into one series and the
  // individual vehicles sit behind a toggle.
  const isSpv = new Set(spvFunds)
  const core = series.filter((s) => !isSpv.has(s.fund))
  const sidecars = series.filter((s) => isSpv.has(s.fund))

  const byDate = new Map<string, { invested: number; value: number }>()
  for (const s of sidecars) {
    for (const p of s.points) {
      const e = byDate.get(p.date) ?? { invested: 0, value: 0 }
      e.invested += p.invested; e.value += p.value
      byDate.set(p.date, e)
    }
  }
  const combined: FundSeries | null = byDate.size
    ? {
        fund: `SPVs & Sidecars (${sidecars.length})`,
        points: Array.from(byDate.entries())
          .map(([date, v]) => ({ date, invested: v.invested, value: v.value }))
          .sort((a, b) => a.date.localeCompare(b.date)),
      }
    : null
  const shown = combined ? [...core, combined] : core

  return (
    <div>
      <h2 className="text-base font-bold text-slate-900">Valuation history</h2>
      <div className="h-0.5 w-12 mt-1 rounded-full mb-1" style={{ backgroundColor: GREEN }} />
      <p className="text-xs text-slate-400 mb-4">
        Invested cost vs unrealized value at each semi-annual valuation. Sourced from the audited fund valuation files.
      </p>

      <div className="flex items-center gap-4 mb-3 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: "#cbd5e1" }} /> Invested</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ backgroundColor: GREEN }} /> Value</span>
      </div>

      <div className="space-y-5">
        {shown.map(({ fund, points }) => (
          <div key={fund} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-baseline justify-between mb-3">
              <p className="text-sm font-semibold text-slate-800">{fund}</p>
              {points.length > 1 && (() => {
                const a = points[points.length - 2], b = points[points.length - 1]
                const d = b.value - a.value
                return (
                  <p className="text-xs" style={{ color: d >= 0 ? "#3b6d11" : "#993c1d" }}>
                    {d >= 0 ? "+" : "−"}{fmtMoney(Math.abs(d))} vs {label(a.date)}
                  </p>
                )
              })()}
            </div>

            <div className="flex items-end gap-6 overflow-x-auto pb-1">
              {points.map((p) => {
                const tvpi = p.invested > 0 ? p.value / p.invested : null
                const hInv = Math.max((p.invested / scaleMax) * 120, 2)
                const hVal = Math.max((p.value / scaleMax) * 120, 2)
                return (
                  <div key={p.date} className="flex flex-col items-center gap-1.5 shrink-0">
                    <div className="flex items-end gap-1" style={{ height: 120 }}>
                      <div className="w-7 rounded-t" style={{ height: hInv, backgroundColor: "#cbd5e1" }} title={`Invested ${fmtMoney(p.invested)}`} />
                      <div className="w-7 rounded-t" style={{ height: hVal, backgroundColor: p.value >= p.invested ? GREEN : ORANGE }} title={`Value ${fmtMoney(p.value)}`} />
                    </div>
                    <span className="text-[11px] font-medium text-slate-600">{label(p.date)}</span>
                    <span className="text-[11px] text-slate-400 tabular-nums">{fmtMoney(p.value)}</span>
                    {tvpi != null && (
                      <span className="text-[11px] font-semibold tabular-nums" style={{ color: tvpi >= 1 ? "#3b6d11" : NAVY }}>
                        {tvpi.toFixed(2)}× TVPI
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {sidecars.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowSidecars((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition"
          >
            {showSidecars ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {showSidecars ? "Hide" : "Show"} individual sidecars ({sidecars.length})
          </button>
          {showSidecars && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sidecars.map(({ fund, points }) => (
                <div key={fund} className="bg-white rounded-xl border border-slate-200 p-3">
                  <p className="text-[13px] font-semibold text-slate-800 mb-2">{fund}</p>
                  <div className="flex items-end gap-4 overflow-x-auto">
                    {points.map((p) => {
                      const tvpi = p.invested > 0 ? p.value / p.invested : null
                      return (
                        <div key={p.date} className="flex flex-col items-center gap-1 shrink-0">
                          <div className="flex items-end gap-1" style={{ height: 64 }}>
                            <div className="w-5 rounded-t" style={{ height: Math.max((p.invested / scaleMax) * 64, 2), backgroundColor: "#cbd5e1" }} title={`Invested ${fmtMoney(p.invested)}`} />
                            <div className="w-5 rounded-t" style={{ height: Math.max((p.value / scaleMax) * 64, 2), backgroundColor: p.value >= p.invested ? GREEN : ORANGE }} title={`Value ${fmtMoney(p.value)}`} />
                          </div>
                          <span className="text-[10px] text-slate-500">{label(p.date)}</span>
                          <span className="text-[10px] text-slate-400 tabular-nums">{fmtMoney(p.value)}</span>
                          {tvpi != null && (
                            <span className="text-[10px] font-semibold tabular-nums" style={{ color: tvpi >= 1 ? "#3b6d11" : NAVY }}>{tvpi.toFixed(2)}×</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
