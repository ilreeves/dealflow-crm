import { createClient } from '@/lib/supabase/server'
import { PortfolioCompany } from '@/lib/types'
import PortfolioBoard from '@/components/portfolio/PortfolioBoard'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('portfolio_companies')
    .select('*')
    .order('name')

  return <PortfolioBoard initialCompanies={(data as PortfolioCompany[]) ?? []} />
}
