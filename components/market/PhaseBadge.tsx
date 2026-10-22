import { phaseColumn } from '@/lib/programs'

// Phase pill, shaded by how far along the shared ladder it sits (lighter =
// earlier), so a drug's "Phase 3" and a device's "Pivotal" read as peers.
const SHADES = [
  'bg-slate-100 text-slate-600',
  'bg-sky-50 text-sky-700',
  'bg-sky-100 text-sky-800',
  'bg-teal-100 text-teal-800',
  'bg-emerald-100 text-emerald-800',
  'bg-lime-100 text-lime-800',
]

export default function PhaseBadge({ phase }: { phase: string }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${SHADES[phaseColumn(phase)]}`}>
      {phase}
    </span>
  )
}
