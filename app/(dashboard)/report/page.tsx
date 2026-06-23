import { createClient } from '@/lib/supabase/server'
import { Deal, PortfolioCompany, Catalyst } from '@/lib/types'
import ReportView from '@/components/report/ReportView'

export default async function ReportPage() {
  const supabase = await createClient()
  const [{ data: deals }, { data: portfolio }, { data: catalysts }, { data: legacy }] = await Promise.all([
    supabase.from('deals').select('*'),
    supabase.from('portfolio_companies').select('*').order('name'),
    supabase.from('catalysts').select('*').order('catalyst_date'),
    supabase.from('legacy_companies').select('company_name'),
  ])

  return (
    <ReportView
      deals={(deals as Deal[]) ?? []}
      portfolio={(portfolio as PortfolioCompany[]) ?? []}
      catalysts={(catalysts as Catalyst[]) ?? []}
      legacy={((legacy as { company_name: string }[]) ?? []).map((l) => l.company_name)}
    />
  )
}
