import { createClient } from '@/lib/supabase/server'
import { PortfolioCompany } from '@/lib/types'
import PortfolioBoard from '@/components/portfolio/PortfolioBoard'

export default async function PortfolioPage() {
  const supabase = await createClient()
  const [{ data }, { data: funds }] = await Promise.all([
    supabase.from('portfolio_companies').select('*').order('name'),
    supabase.from('list_options').select('value,sort_order').eq('list_key', 'fund').order('sort_order'),
  ])
  const fundOrder = ((funds as { value: string }[]) ?? []).map((f) => f.value)

  return <PortfolioBoard initialCompanies={(data as PortfolioCompany[]) ?? []} fundOrder={fundOrder} />
}
