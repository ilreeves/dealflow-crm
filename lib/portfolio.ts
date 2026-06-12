import { SupabaseClient } from '@supabase/supabase-js'
import { Deal } from './types'

// When a deal reaches Invested, mirror it into portfolio_companies (skip if one
// with the same name already exists).
export async function addDealToPortfolio(supabase: SupabaseClient, deal: Deal) {
  const { data: existing } = await supabase
    .from('portfolio_companies')
    .select('id')
    .ilike('name', deal.name)
    .limit(1)

  if (existing && existing.length > 0) return

  await supabase.from('portfolio_companies').insert({
    name: deal.name,
    sector: deal.sector,
    category: deal.category,
    series: deal.series,
    clinical_stage: deal.clinical_stage,
    website: deal.website,
    contact_email: deal.contact_email,
    description: deal.description,
    current_valuation: deal.current_valuation,
    current_fundraise: deal.current_fundraise,
    city: deal.city,
    state: deal.state,
    country: deal.country,
  })
}
