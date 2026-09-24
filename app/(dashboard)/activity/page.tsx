import { createClient } from '@/lib/supabase/server'
import { rowsOrThrow } from '@/lib/supabase/unwrap'
import { DealActivity, CatalystActivity } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { ArrowRight, Plus, CalendarDays, Trash2, Pencil, CheckCircle2, Clock } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

// This page renders on a UTC server — without an explicit zone, anything logged
// after 8pm Eastern was grouped (and dated) under the following day.
const TZ = 'America/New_York'

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (secs < 60) return 'just now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return formatDate(dateStr, TZ)
}

function groupByDate<T extends { created_at: string }>(items: T[]): [string, T[]][] {
  const groups: Record<string, T[]> = {}
  for (const a of items) {
    const key = new Date(a.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: TZ })
    if (!groups[key]) groups[key] = []
    groups[key].push(a)
  }
  return Object.entries(groups)
}

// One readable line from an activity row's action + details. Display only — the
// stored rows are untouched. The feed used to print `action — details`, which
// read as "stage changed — Sourced → Science Committee" and, where the action
// was already implied, as a line that opened on a stray dash.
//   · "Stage changed" is implied by the arrow, so only the transition shows.
//   · "Stage: Sourced" (logged on Deal added) drops its label → "Deal added · Sourced".
//   · Any leading dash a caller baked into `details` is stripped.
function describe(action: string, details: string | null): string {
  const d = (details ?? '').replace(/^[\s\u2014\u2013-]+/, '').replace(/^Stage:\s*/, '').trim()
  if (!d) return action
  if (action === 'Stage changed') return d
  return `${action} \u00b7 ${d}`
}

function catalystIcon(action: string) {
  if (action === 'Catalyst added') return { bg: 'bg-green-100', icon: <Plus className="w-3.5 h-3.5 text-green-600" /> }
  if (action === 'Catalyst deleted') return { bg: 'bg-red-100', icon: <Trash2 className="w-3.5 h-3.5 text-red-500" /> }
  if (action === 'Resolved') return { bg: 'bg-green-100', icon: <CheckCircle2 className="w-3.5 h-3.5 text-green-600" /> }
  if (action.startsWith('Rescheduled')) return { bg: 'bg-orange-100', icon: <Clock className="w-3.5 h-3.5 text-orange-600" /> }
  if (action === 'Title edited' || action === 'Note updated') return { bg: 'bg-slate-100', icon: <Pencil className="w-3.5 h-3.5 text-slate-500" /> }
  return { bg: 'bg-blue-100', icon: <ArrowRight className="w-3.5 h-3.5 text-blue-600" /> }
}

export default async function ActivityPage() {
  const supabase = await createClient()
  const [dealRes, catalystRes] = await Promise.all([
    supabase.from('deal_activity').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('catalyst_activity').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  const dealActivities = rowsOrThrow(dealRes, 'deal activity') as DealActivity[]
  const catalystActivities = rowsOrThrow(catalystRes, 'catalyst activity') as CatalystActivity[]

  return (
    // Phones (max-md): not h-full, so the page grows to its content and <main>
    // is the one scroller — both feeds stack at natural height instead of each
    // being a small nested scroll box. md+ keeps the fixed-height column with
    // each feed scrolling independently.
    <div className="flex flex-col h-full max-md:h-auto">
      <PageHeader title="Activity" subtitle="Recent changes across deals and catalysts" />

      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 md:px-6 py-6">

        {/* Deal activity column */}
        <div className="flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 shrink-0 flex items-center gap-2">
            <ArrowRight className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Pipeline</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {dealActivities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No activity yet — changes appear here as deals move through the pipeline.</p>
            ) : (
              groupByDate(dealActivities).map(([date, items]) => (
                <div key={date} className="mb-6">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{date}</p>
                  <div className="space-y-2">
                    {items.map((a) => (
                      <div key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                        <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                          a.action === 'Deal added' ? 'bg-green-100' : 'bg-blue-100'
                        }`}>
                          {a.action === 'Deal added'
                            ? <Plus className="w-3 h-3 text-green-600" />
                            : <ArrowRight className="w-3 h-3 text-blue-600" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          {/* Same shape as the catalyst column: who/what on top, what
                              happened beneath, then who and when. */}
                          <p className="text-sm font-semibold text-slate-800">{a.deal_name}</p>
                          <p className="text-sm text-slate-500">{describe(a.action, a.details)}</p>
                          <div className="flex items-center gap-1.5 mt-0.5 text-xs">
                            {a.actor_name && <span className="text-slate-400">{a.actor_name}</span>}
                            {a.actor_name && <span className="text-slate-300">&middot;</span>}
                            <span className="text-slate-300">{timeAgo(a.created_at)}</span>
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

        {/* Catalyst activity column */}
        <div className="flex flex-col min-h-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100 shrink-0 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-semibold text-slate-700">Catalysts</p>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {catalystActivities.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-12">No catalyst activity yet — additions, reschedules, and status changes appear here.</p>
            ) : (
              groupByDate(catalystActivities).map(([date, items]) => (
                <div key={date} className="mb-6">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">{date}</p>
                  <div className="space-y-2">
                    {items.map((a) => {
                      const { bg, icon } = catalystIcon(a.action)
                      return (
                        <div key={a.id} className="flex items-start gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                          <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${bg}`}>
                            {icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold text-slate-800">{a.company_name}</span>
                              <span className="text-sm text-slate-600 truncate">{a.catalyst_title}</span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5 text-xs">
                              <span className="text-slate-500">{describe(a.action, a.details)}</span>
                              <span className="text-slate-300">&middot;</span>
                              <span className="text-slate-300">{timeAgo(a.created_at)}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
