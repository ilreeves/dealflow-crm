// Sticky first column for the wide tables that scroll sideways on phones
// (Revenue, Runway, the pipeline table): the company name stays pinned while
// the figures scroll under it. Phones only (max-md) — from md up these tables
// render exactly as before. The inset shadow is the hairline divider on its
// right edge; the background must match the row, so body cells also take the
// row's hover colour via `group-hover` (their <tr> carries `group`).
export const STICKY_COL =
  "max-md:sticky max-md:left-0 max-md:z-10 max-md:shadow-[inset_-1px_0_0_#e2e8f0]"
export const STICKY_TD = `${STICKY_COL} max-md:bg-white max-md:group-hover:bg-slate-50`

// Table header cell shared by the Revenue and Runway rosters.
export default function Th({ children, right, sticky }: { children: React.ReactNode; right?: boolean; sticky?: boolean }) {
  return (
    <th className={`${right ? "text-right" : "text-left"} px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap ${sticky ? `${STICKY_COL} max-md:bg-white` : ""}`}>
      {children}
    </th>
  )
}
