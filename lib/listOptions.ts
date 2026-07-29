import { createClient } from '@/lib/supabase/client'

// `spv_fund` lists the vehicles that get rolled up under "SPVs & Sidecars" on
// Fund Performance. Anything in `fund` but NOT in `spv_fund` is treated as a
// commingled fund and shown top-level — so adding e.g. Fund IV needs only the
// one entry in the Funds list, no code change.
export const LIST_KEYS = ['series', 'clinical_stage', 'fund', 'spv_fund'] as const
export type ListKey = typeof LIST_KEYS[number]

// Fallbacks used if the list_options table is empty or unavailable.
export const FALLBACK_LISTS: Record<ListKey, string[]> = {
  series: ['Pre-Seed', 'Seed', 'Convertible Note/SAFE', 'A', 'B', 'C', 'D+', 'Crossover', 'Public'],
  clinical_stage: ['Preclinical', 'Pre-IND', 'Phase I', 'Phase II', 'Phase III', 'Pre-IDE', 'FIH', 'Pivotal', '510(k)', 'PMA', 'Approved / Marketed'],
  fund: ['Fund I', 'Fund II', 'EHF', 'Solas/Sower', 'SPV'],
  spv_fund: [
    'Arrivo B Sidecar', 'Basking Holdings', 'Cryosa Sidecar', 'Francis Sidecar',
    'Intershunt Sidecar', 'Stimdia Sidecar', 'Tvardi Sidecar', 'Vesalio Sidecar',
  ],
}

export async function fetchListOptions(): Promise<Record<ListKey, string[]>> {
  const supabase = createClient()
  const { data } = await supabase.from('list_options').select('list_key,value,sort_order').order('sort_order')
  const out: Record<ListKey, string[]> = { series: [], clinical_stage: [], fund: [], spv_fund: [] }
  for (const row of (data ?? []) as { list_key: ListKey; value: string }[]) {
    if (out[row.list_key]) out[row.list_key].push(row.value)
  }
  for (const k of LIST_KEYS) if (!out[k].length) out[k] = FALLBACK_LISTS[k]
  return out
}
