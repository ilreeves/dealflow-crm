import { SupabaseClient } from '@supabase/supabase-js'
import { Deal } from './types'

// When a deal reaches Invested, mirror it into portfolio_companies (skip if one
// with the same name already exists). Returns the failed step's error, if any,
// so callers can surface it — a silent miss here means an invested company
// never shows up on the portfolio board.
export async function addDealToPortfolio(supabase: SupabaseClient, deal: Deal) {
  // Escape LIKE wildcards: a name like "Acme_Bio" must not match "AcmeXBio".
  const namePattern = deal.name.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data: existing, error: lookupError } = await supabase
    .from('portfolio_companies')
    .select('id')
    .ilike('name', namePattern)
    .limit(1)

  // A failed lookup must not be read as "no match" — that inserts a duplicate.
  if (lookupError) return { error: lookupError }
  if (existing && existing.length > 0) return { error: null }

  const { error } = await supabase.from('portfolio_companies').insert({
    name: deal.name,
    sector: deal.sector,
    category: deal.category,
    sharepoint_link: deal.sharepoint_link,
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
    // Carry the curated clinical-trial identifiers across — re-keying these by
    // hand after investing is exactly the kind of loss nobody notices.
    indication: deal.indication,
    drug_names: deal.drug_names,
    ct_sponsor_name: deal.ct_sponsor_name,
  })
  return { error }
}
