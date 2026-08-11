// Stat card for the company-tab headline rows (Revenue, Runway tabs).
// The sub line truncates, so it carries itself as a hover title — the RunwayTab
// copy had this and the RevenueTab copy didn't; unified on the readable one.
export default function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: accent ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}
