"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight, AlertTriangle, Clock } from "lucide-react"

export type CompanyInFund = { name: string; invested: number; value: number | null; ownership: number }
export type FundRow = { fund: string; invested: number; value: number; moic: number | null; companies: CompanyInFund[] }
export type TopPosition = { name: string; fund: string; ownership: number; invested: number; value: number | null; moic: number | null }
export type RiskFlag = { kind: "overdue" | "maturing"; company: string; text: string }
export type Totals = { invested: number; value: number; moic: number | null; gain: number }

const FUND_COLORS = ["#023a51", "#5ba200", "#e98925", "#7f77dd", "#1d9e75", "#94a3b8"]

function fmtMoney(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  const x = Number(n)
  const abs = Math.abs(x)
  if (abs >= 1e9) return `${x < 0 ? "-" : ""}$${(Math.abs(x) / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${x < 0 ? "-" : ""}$${(Math.abs(x) / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${x < 0 ? "-" : ""}$${(Math.abs(x) / 1e3).toFixed(0)}K`
  return `$${x.toLocaleString()}`
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return "—"
  return `${Number(n).toFixed(1)}%`
}
function fmtMoic(n: number | null | undefined): string {
  return n == null ? "—" : `${Number(n).toFixed(2)}×`
}
function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("")
}

export default function FundPerformanceView({
  totals, funds, top, flags, asOf,
}: {
  totals: Totals
  funds: FundRow[]
  top: TopPosition[]
  flags: RiskFlag[]
  asOf: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const empty = totals.invested === 0 && funds.length === 0

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Fund Performance</h1>
        <p className="text-sm text-slate-500">Invested capital, current value, and ownership across funds{asOf ? ` · as of ${asOf}` : ""}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        {empty ? (
          <div className="max-w-md mx-auto text-center py-16">
            <p className="text-sm text-slate-500">No positions recorded yet.</p>
            <p className="text-xs text-slate-400 mt-1">Add rounds and Solas positions on a portfolio company&apos;s Ownership tab, and they&apos;ll roll up here.</p>
          </div>
        ) : (
          <div className="max-w-4xl space-y-8">
            {/* Headline */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total invested" value={fmtMoney(totals.invested)} />
              <StatCard label="Current value" value={fmtMoney(totals.value)} color="#3b6d11" />
              <StatCard label="Portfolio MOIC" value={fmtMoic(totals.moic)} />
              <StatCard label="Unrealized gain" value={`${totals.gain >= 0 ? "+" : ""}${fmtMoney(totals.gain)}`} color={totals.gain >= 0 ? "#3b6d11" : "#993c1d"} />
            </div>

            {/* By fund */}
            <div>
              <h2 className="text-base font-bold text-slate-900">By fund</h2>
              <div className="h-0.5 w-12 mt-1 rounded-full mb-4" style={{ backgroundColor: "#5ba200" }} />
              <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                {funds.map((f, i) => {
                  const color = FUND_COLORS[i % FUND_COLORS.length]
                  const isOpen = open === f.fund
                  return (
                    <div key={f.fund}>
                      <button onClick={() => setOpen(isOpen ? null : f.fund)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 transition">
                        <span className="text-slate-300">{isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}</span>
                        <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: color }} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">{f.fund}</span>
                            <span className="text-xs text-slate-400">{f.companies.length} {f.companies.length === 1 ? "company" : "companies"}</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm">
                            <span className="text-slate-400">{fmtMoney(f.invested)} → </span>
                            <span className="font-medium" style={{ color: "#3b6d11" }}>{fmtMoney(f.value)}</span>
                          </div>
                          <MoicPill moic={f.moic} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 pl-12 space-y-1.5">
                          {f.companies.map((c) => (
                            <div key={c.name} className="flex items-center gap-2 text-[13px] text-slate-600">
                              <span className="flex-1 min-w-0 truncate">{c.name} <span className="text-slate-400">· {fmtPct(c.ownership)}</span></span>
                              <span className="text-slate-400">{fmtMoney(c.invested)} → </span>
                              <span style={{ color: c.value != null && c.value >= c.invested ? "#3b6d11" : "#64748b" }}>{fmtMoney(c.value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top positions */}
            {top.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-slate-900">Top positions</h2>
                <div className="h-0.5 w-12 mt-1 rounded-full mb-4" style={{ backgroundColor: "#5ba200" }} />
                <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
                  {top.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3 px-4 py-3">
                      <span className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] text-white shrink-0" style={{ backgroundColor: FUND_COLORS[i % FUND_COLORS.length] }}>{initials(p.name)}</span>
                      <span className="flex-1 min-w-0 truncate text-sm text-slate-800">{p.name} <span className="text-xs text-slate-400">· {p.fund} · {fmtPct(p.ownership)}</span></span>
                      <span className="text-sm text-slate-400 shrink-0">{fmtMoney(p.invested)} → </span>
                      <span className="text-sm shrink-0" style={{ color: p.value != null && p.value >= p.invested ? "#3b6d11" : "#64748b" }}>{fmtMoney(p.value)}</span>
                      <MoicPill moic={p.moic} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Risk flags */}
            {flags.length > 0 && (
              <div>
                <h2 className="text-base font-bold text-slate-900">Risk flags</h2>
                <div className="h-0.5 w-12 mt-1 rounded-full mb-4" style={{ backgroundColor: "#e98925" }} />
                <div className="space-y-2">
                  {flags.map((fl, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-sm px-3.5 py-2.5 rounded-lg" style={{ backgroundColor: "#faece7", color: "#712b13" }}>
                      {fl.kind === "overdue" ? <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> : <Clock className="w-4 h-4 mt-0.5 shrink-0" />}
                      <span><span className="font-medium">{fl.company}</span> — {fl.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-semibold" style={{ color: color ?? "#0f172a" }}>{value}</p>
    </div>
  )
}

function MoicPill({ moic }: { moic: number | null }) {
  if (moic == null) return <span className="inline-block text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-400">—</span>
  const good = moic >= 1
  return (
    <span className="inline-block text-[11px] px-2 py-0.5 rounded-md ml-1" style={{ backgroundColor: good ? "#eaf3de" : "#faece7", color: good ? "#3b6d11" : "#993c1d" }}>
      {moic.toFixed(2)}×
    </span>
  )
}
