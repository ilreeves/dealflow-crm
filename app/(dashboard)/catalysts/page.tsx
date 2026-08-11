import { createClient } from '@/lib/supabase/server'
import { rowsOrThrow } from '@/lib/supabase/unwrap'
import { Catalyst } from '@/lib/types'
import CatalystCalendar from '@/components/catalysts/CatalystCalendar'

// The reminder windows below are computed from the request-time clock; static
// rendering would freeze them at build time. cookies() currently forces
// dynamic rendering implicitly — make the requirement explicit.
export const dynamic = 'force-dynamic'

export default async function CatalystsPage() {
  const supabase = await createClient()

  const [catalystsRes, dealsRes, portfolioRes, legacyRes, dismissedRes] = await Promise.all([
    supabase.from('catalysts').select('*').order('catalyst_date', { ascending: true }),
    supabase.from('deals').select('name').neq('stage', 'Passed'),
    supabase.from('portfolio_companies').select('id,name'),
    supabase.from('legacy_companies').select('company_name'),
    supabase.from('dismissed_reminders').select('signature'),
  ])

  const portfolioCompanies = rowsOrThrow(portfolioRes, 'portfolio companies') as { id: string; name: string }[]
  // Lets the calendar's add form stamp company_id (the rename-proof link)
  // when the chosen name is a portfolio company; deal names map to nothing.
  const portfolioIdByName: Record<string, string> = {}
  for (const p of portfolioCompanies) portfolioIdByName[p.name] = p.id

  const companyNames = Array.from(new Set([
    ...(rowsOrThrow(dealsRes, 'deals') as { name: string }[]).map((d) => d.name),
    ...portfolioCompanies.map((p) => p.name),
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
      initialCatalysts={rowsOrThrow(catalystsRes, 'catalysts') as Catalyst[]}
      companyNames={companyNames}
      initialLegacy={(rowsOrThrow(legacyRes, 'legacy companies') as { company_name: string }[]).map((l) => l.company_name)}
      initialDismissed={(rowsOrThrow(dismissedRes, 'dismissed reminders') as { signature: string }[]).map((d) => d.signature)}
      portfolioIdByName={portfolioIdByName}
    />
  )
}
