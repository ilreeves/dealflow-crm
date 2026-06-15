export default function DashboardLoading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header skeleton — matches every tab's top bar */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <div className="h-5 w-40 bg-slate-200 rounded" />
        <div className="h-3 w-56 bg-slate-100 rounded mt-2" />
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-hidden p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="h-3 w-20 bg-slate-100 rounded mb-3" />
              <div className="h-8 w-16 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-100 h-14" />
          ))}
        </div>
      </div>
    </div>
  )
}
