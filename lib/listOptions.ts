import { createClient } from '@/lib/supabase/client'

// `spv_fund` lists the vehicles that get rolled up under "SPVs & Sidecars" on
// Fund Performance. Anything in `fund` but NOT in `spv_fund` is treated as a
// commingled fund and shown top-level — so adding e.g. Fund IV needs only the
// one entry in the Funds list, no code change.
export const LIST_KEYS = ['series', 'clinical_stage', 'fund', 'spv_fund'] as const
export type ListKey = typeof LIST_KEYS[number]

// Sector options for the deal and portfolio-company forms — the ABMS specialty
// list (with the ABIM subspecialties expanded), not a DB-backed list.
export const ABMS_SPECIALTIES = [
  'Allergy & Immunology',
  'Anesthesiology',
  'Colon & Rectal Surgery',
  'Dermatology',
  'Emergency Medicine',
  'Family Medicine',
  'Internal Medicine (General)',
  // ABIM subspecialties
  'IM - Advanced Heart Failure & Transplant Cardiology',
  'IM - Cardiovascular Disease',
  'IM - Clinical Cardiac Electrophysiology',
  'IM - Critical Care Medicine',
  'IM - Endocrinology, Diabetes & Metabolism',
  'IM - Gastroenterology',
  'IM - Geriatric Medicine',
  'IM - Hematology',
  'IM - Infectious Disease',
  'IM - Interventional Cardiology',
  'IM - Medical Oncology',
  'IM - Nephrology',
  'IM - Pulmonary Disease',
  'IM - Rheumatology',
  'IM - Sleep Medicine',
  'Medical Genetics and Genomics',
  'Neurological Surgery',
  'Nuclear Medicine',
  'Obstetrics & Gynecology',
  'Ophthalmology',
  'Orthopaedic Surgery',
  'Otolaryngology - Head and Neck Surgery',
  'Pathology',
  'Pediatrics',
  'Physical Medicine & Rehabilitation',
  'Plastic Surgery',
  'Preventive Medicine',
  'Psychiatry & Neurology',
  'Radiology',
  'Surgery',
  'Thoracic Surgery',
  'Urology',
]

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
  for (const row of (data ?? []) as { list_key: ListKey; value: string | null }[]) {
    // The DB doesn't guarantee a non-null value; a null here would surface as
    // a blank <option> in every dropdown that consumes these lists.
    if (row.value != null && out[row.list_key]) out[row.list_key].push(row.value)
  }
  for (const k of LIST_KEYS) if (!out[k].length) out[k] = FALLBACK_LISTS[k]
  return out
}
