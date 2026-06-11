import { createClient } from '@/lib/supabase/server'
import { DealActivity } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { ArrowRight, Plus } from 'lucide-react'

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr)
}

export default async function ActivityPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('deal_activity')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  const activities = (data as DealActivity[]) ?? []

  // Group by date
  const groups: Record<string, DealActivity[]> = {}
  for (const a of activities) {
    const key = new Date(a.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 bg-white border-b border-slate-200 shrink-0">
        <h1 className="text-lg font-semibold text-slate-900">Activity</h1>
        <p className="text-sm text-slate-500">Recent changes across all deals</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl">
        {activities.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">No activity yet — changes will appear here as deals move through the pipeline.</p>
        ) : (
          Object.entries(groups).map(([date, items]) => (
            <div key={date} className="mb-8">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{date}</p>
              <div className="space-y-2">
                {items.map((a) => (
                  <div key={a.id} className="flex items-start gap-3 bg-white rounded-xl border border-slate-100 px-4 py-3">
                    <div className={`mt-0.5 w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                      a.action === 'Deal added' ? 'bg-green-100' : 'bg-blue-100'
                    }`}>
                      {a.action === 'Deal added'
                        ? <Plus className="w-3.5 h-3.5 text-green-600" />
                        : <ArrowRight className="w-3.5 h-3.5 text-blue-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{a.deal_name}</span>
                        <span className="text-sm text-slate-500">{a.action.toLowerCase()}</span>
                        {a.details && <span className="text-sm text-slate-400">&mdash; {a.details}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.actor_name && <span className="text-xs text-slate-400">{a.actor_name}</span>}
                        <span className="text-xs text-slate-300">{timeAgo(a.created_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
