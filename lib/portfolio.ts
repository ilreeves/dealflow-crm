import { SupabaseClient } from '@supabase/supabase-js'
import { Deal } from './types'

// ── Valuation resolution ─────────────────────────────────────────────────────
// ONE definition of "what is this company worth right now" and "what is this
// position worth", shared by Fund Performance and the company Ownership tab.
// These were implemented twice, independently — any divergence made the two
// surfaces disagree about the same position.

export type LatestValuation = { value: number; date: string; source: string }

/** Effective current valuation = most recent by date among round post-moneys and manual marks. */
export function latestValuation(
  rounds: { round_name?: string | null; date: string | null; post_money: number | null }[],
  marks: { as_of_date: string | null; valuation: number | null; basis?: string | null }[],
): LatestValuation | null {
  const candidates: LatestValuation[] = []
  for (const r of rounds) {
    if (r.post_money != null) {
      candidates.push({ value: Number(r.post_money), date: r.date ?? '', source: `${r.round_name ?? 'round'} post-money` })
    }
  }
  for (const m of marks) {
    if (m.valuation != null) {
      candidates.push({ value: Number(m.valuation), date: m.as_of_date ?? '', source: m.basis || 'mark' })
    }
  }
  candidates.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  return candidates[0] ?? null
}

/** Position value = the most recent of (its own fair-value mark) and (ownership × latest company valuation). */
export function positionValue(
  p: { fair_value: number | null; fair_value_date: string | null; ownership_pct: number | null },
  latest: LatestValuation | null,
): number | null {
  const cands: { v: number; d: string }[] = []
  if (p.fair_value != null) cands.push({ v: Number(p.fair_value), d: p.fair_value_date || '' })
  if (latest != null && p.ownership_pct != null) {
    cands.push({ v: (Number(p.ownership_pct) / 100) * latest.value, d: latest.date || '' })
  }
  if (!cands.length) return null
  cands.sort((a, b) => (b.d || '').localeCompare(a.d || ''))
  return cands[0].v
}

// When a deal reaches Invested, mirror it into portfolio_companies (skip if one
// with the same name already exists). Returns the failed step's error, if any,
// so callers can surface it — a silent miss here means an invested company
// never shows up on the portfolio board.
//
// Only `id` and `name` are trusted from the caller: the pipeline board holds
// slim rows (BOARD_COLUMNS), so the full record is refetched here rather than
// mirroring whatever subset the caller happened to have loaded.
export async function addDealToPortfolio(supabase: SupabaseClient, dealRef: Pick<Deal, 'id' | 'name'>) {
  // Escape LIKE wildcards: a name like "Acme_Bio" must not match "AcmeXBio".
  const namePattern = dealRef.name.replace(/[\\%_]/g, (c) => `\\${c}`)
  const { data: existing, error: lookupError } = await supabase
    .from('portfolio_companies')
    .select('id')
    .ilike('name', namePattern)
    .limit(1)

  // A failed lookup must not be read as "no match" — that inserts a duplicate.
  if (lookupError) return { error: lookupError }
  if (existing && existing.length > 0) return { error: null }

  const { data: full, error: fetchError } = await supabase
    .from('deals')
    .select('*')
    .eq('id', dealRef.id)
    .maybeSingle()
  if (fetchError) return { error: fetchError }
  if (!full) return { error: { message: 'deal no longer exists' } }
  const deal = full as Deal

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
