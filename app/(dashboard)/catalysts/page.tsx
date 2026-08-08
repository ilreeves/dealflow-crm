import { createClient } from '@/lib/supabase/server'
import { Catalyst } from '@/lib/types'
import CatalystCalendar from '@/components/catalysts/CatalystCalendar'

export default async function CatalystsPage() {
  const supabase = await createClient()

  const [{ data: catalysts }, { data: deals }, { data: portfolio }, { data: legacy }, { data: dismissed }] = await Promise.all([
    supabase.from('catalysts').select('*').order('catalyst_date', { ascending: true }),
    supabase.from('deals').select('name').neq('stage', 'Passed'),
    supabase.from('portfolio_companies').select('name'),
    supabase.from('legacy_companies').select('company_name'),
    supabase.from('dismissed_reminders').select('signature'),
  ])

  const companyNames = Array.from(new Set([
    ...((deals as { name: string }[]) ?? []).map((d) => d.name),
    ...((portfolio as { name: string }[]) ?? []).map((p) => p.name),
  ])).sort()

  // The reminder bar's overdue / due-soon windows are measured from today. The clock
  // is read HERE rather than in the calendar itself: this is an async server component
  // that renders once per request and never hydrates, and createClient() reads cookies,
  // which keeps the route server-rendered on demand. Reading it inside the client
  // component instead would make the server and client renders disagree across midnight.
  //
  // ⚠️ If this route were ever made statically rendered, `today` would freeze at build
  // time and every catalyst would drift toward "overdue" silently. Keep it dynamic.
  const today = new Date().toISOString().slice(0, 10)

  return (
    <CatalystCalendar
      today={today}
      initialCatalysts={(catalysts as Catalyst[]) ?? []}
      companyNames={companyNames}
      initialLegacy={((legacy as { company_name: string }[]) ?? []).map((l) => l.company_name)}
      initialDismissed={((dismissed as { signature: string }[]) ?? []).map((d) => d.signature)}
    />
  )
}
