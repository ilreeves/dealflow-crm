import { createClient } from '@/lib/supabase/server'
import { rowsOrThrow } from '@/lib/supabase/unwrap'
import { Program } from '@/lib/types'
import MarketMap from '@/components/market/MarketMap'

export default async function MarketMapPage() {
  const supabase = await createClient()
  const [programsRes, portfolioRes, dealsRes] = await Promise.all([
    supabase.from('programs').select('*'),
    supabase.from('portfolio_companies').select('id,name,status,sector').order('name'),
    supabase.from('deals').select('id,name,stage,sector').order('name'),
  ])

  return (
    <MarketMap
      initialPrograms={rowsOrThrow(programsRes, 'programs') as Program[]}
      portfolio={rowsOrThrow(portfolioRes, 'portfolio companies') as { id: string; name: string; status: string | null; sector: string | null }[]}
      deals={rowsOrThrow(dealsRes, 'deals') as { id: string; name: string; stage: string; sector: string | null }[]}
    />
  )
}
