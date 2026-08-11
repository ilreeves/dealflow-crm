// Table header cell shared by the Revenue and Runway rosters.
export default function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`${right ? "text-right" : "text-left"} px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide whitespace-nowrap`}>
      {children}
    </th>
  )
}
