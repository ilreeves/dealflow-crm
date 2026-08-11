import { createClient } from '@/lib/supabase/server'
import { PortfolioCompany } from '@/lib/types'
import PortfolioBoard from '@/components/portfolio/PortfolioBoard'
import { rowsOrThrow } from '@/lib/supabase/unwrap'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const [companiesRes, fundsRes] = await Promise.all([
    supabase.from('portfolio_companies').select('*').order('name'),
    supabase.from('list_options').select('value,sort_order').eq('list_key', 'fund').order('sort_order'),
  ])
  const companies = rowsOrThrow(companiesRes, 'portfolio companies') as PortfolioCompany[]
  const fundOrder = (rowsOrThrow(fundsRes, 'fund list') as { value: string }[]).map((f) => f.value)

  return <PortfolioBoard initialCompanies={companies} fundOrder={fundOrder} />
}
