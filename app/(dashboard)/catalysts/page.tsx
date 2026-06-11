import { createClient } from '@/lib/supabase/server'
import { Catalyst } from '@/lib/types'
import CatalystCalendar from '@/components/catalysts/CatalystCalendar'

export default async function CatalystsPage() {
  const supabase = await createClient()

  const [{ data: catalysts }, { data: deals }, { data: portfolio }] = await Promise.all([
    supabase.from('catalysts').select('*').order('catalyst_date', { ascending: true }),
    supabase.from('deals').select('name').neq('stage', 'Passed'),
    supabase.from('portfolio_companies').select('name'),
  ])

  const companyNames = Array.from(new Set([
    ...((deals as { name: string }[]) ?? []).map((d) => d.name),
    ...((portfolio as { name: string }[]) ?? []).map((p) => p.name),
  ])).sort()

  return (
    <CatalystCalendar
      initialCatalysts={(catalysts as Catalyst[]) ?? []}
      companyNames={companyNames}
    />
  )
}
