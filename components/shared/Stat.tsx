import InfoTip from "@/components/shared/InfoTip"

// Stat card for the company-tab headline rows (Revenue, Runway tabs).
// The sub line truncates, so it carries itself as a hover title — the RunwayTab
// copy had this and the RevenueTab copy didn't; unified on the readable one.
// `tip` puts a methodology note behind a (?) next to the label.
export default function Stat({ label, value, sub, accent, tip }: { label: string; value: string; sub?: string; accent?: string; tip?: React.ReactNode }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2.5">
      <p className="text-xs text-slate-400 flex items-center gap-1">
        {label}
        {tip && <InfoTip label={`About ${label}`} size="xs">{tip}</InfoTip>}
      </p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: accent ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 truncate" title={sub}>{sub}</p>}
    </div>
  )
}
