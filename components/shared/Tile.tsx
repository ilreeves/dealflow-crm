import InfoTip from "@/components/shared/InfoTip"

// Stat tile for the page-level dashboards (Revenue, Runway).
// `tip` puts a methodology note behind a (?) next to the label.
export default function Tile({ label, value, sub, color, tip }: { label: string; value: string; sub?: string; color?: string; tip?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className="text-xs text-slate-400 flex items-center gap-1">
        {label}
        {tip && <InfoTip label={`About ${label}`} size="xs">{tip}</InfoTip>}
      </p>
      <p className="text-xl font-semibold mt-0.5 tabular-nums" style={{ color: color ?? "#0f172a" }}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}
