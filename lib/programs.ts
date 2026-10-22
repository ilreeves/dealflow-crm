import type { SupabaseClient } from '@supabase/supabase-js'
import type { Program } from '@/lib/types'

// Programs (company × intervention × indication × phase) and the market map
// built from them. Drugs and devices climb different regulatory ladders, so a
// program stores its PRECISE phase label from either ladder, and the map
// places both onto one set of shared columns. Keep the label lists in sync
// with the CHECK constraint in supabase/migration_programs.sql.

export const MODALITIES = [
  'Small molecule', 'Biologic', 'Nucleic acid', 'Cell & gene therapy', 'Device', 'Diagnostic', 'Digital health', 'Other',
] as const

export const THERAPEUTIC_AREAS = [
  'Cardiovascular', 'Neurology', 'Psychiatry', 'Oncology', 'Pulmonary & critical care',
  'Gastroenterology & hepatology', 'Urology & nephrology', "Women's health", 'Dermatology',
  'ENT & sleep', 'Immunology & inflammation', 'Metabolic & endocrine', 'Musculoskeletal & pain',
  'Infectious disease', 'Ophthalmology', 'Hematology', 'Other',
] as const

export const DRUG_PHASES = ['Preclinical', 'Phase 1', 'Phase 1/2', 'Phase 2', 'Phase 2/3', 'Phase 3', 'Filed', 'Approved'] as const
export const DEVICE_PHASES = ['Preclinical', 'First-in-human', 'Early feasibility', 'Pivotal', 'Submitted', 'Cleared / Approved', 'Marketed'] as const

/** Drug-ladder modalities; everything else (device, diagnostic, digital) uses the device ladder. */
export function isDrugModality(modality: string): boolean {
  return modality === 'Small molecule' || modality === 'Biologic' || modality === 'Nucleic acid' || modality === 'Cell & gene therapy'
}

export function phasesFor(modality: string): readonly string[] {
  return isDrugModality(modality) ? DRUG_PHASES : DEVICE_PHASES
}

// The map's shared columns. A Phase 1/2 sits with Phase 1 (it's where the
// first human data comes from); Phase 2/3 sits with Phase 3 (it's registrational).
export const MAP_COLUMNS = [
  { key: 'pre', label: 'Preclinical', hint: 'No human data yet' },
  { key: 'early', label: 'Early clinical', hint: 'Phase 1 · First-in-human' },
  { key: 'mid', label: 'Mid clinical', hint: 'Phase 2 · Early feasibility' },
  { key: 'late', label: 'Late clinical', hint: 'Phase 3 · Pivotal' },
  { key: 'review', label: 'Under review', hint: 'NDA/BLA filed · 510(k)/PMA submitted' },
  { key: 'market', label: 'Approved / marketed', hint: 'Approved · Cleared · Selling' },
] as const

const PHASE_COLUMN: Record<string, number> = {
  'Preclinical': 0,
  'Phase 1': 1, 'Phase 1/2': 1, 'First-in-human': 1,
  'Phase 2': 2, 'Early feasibility': 2,
  'Phase 2/3': 3, 'Phase 3': 3, 'Pivotal': 3,
  'Filed': 4, 'Submitted': 4,
  'Approved': 5, 'Cleared / Approved': 5, 'Marketed': 5,
}

/** Map column index for a phase label; an unrecognised label lands in Preclinical rather than vanishing. */
export function phaseColumn(phase: string): number {
  return PHASE_COLUMN[phase] ?? 0
}

export type ProgramOwner = 'portfolio' | 'pipeline' | 'passed' | 'external'

export const OWNER_LABELS: Record<ProgramOwner, string> = {
  portfolio: 'Portfolio',
  pipeline: 'Pipeline',
  passed: 'Passed',
  external: 'Competitors',
}

/** A program joined to who owns it — what the map and its filters work on. */
export interface MapProgram extends Program {
  owner: ProgramOwner
  companyLabel: string
  /** Deep link to the owning deal / company modal; null for external companies. */
  href: string | null
}

export interface OwnerLookups {
  portfolio: Map<string, { name: string; status: string | null }>
  deals: Map<string, { name: string; stage: string }>
}

/**
 * Resolve each program's owner. Returns null for rows that shouldn't be on the
 * map: a deal that has been Invested is represented by its portfolio company,
 * and a row whose parent we can't see (RLS, race with a delete) is dropped
 * rather than shown under a blank name.
 */
export function toMapProgram(p: Program, lookups: OwnerLookups): MapProgram | null {
  if (p.company_id) {
    const co = lookups.portfolio.get(p.company_id)
    if (!co) return null
    return { ...p, owner: 'portfolio', companyLabel: co.name, href: `/portfolio?open=${p.company_id}` }
  }
  if (p.deal_id) {
    const d = lookups.deals.get(p.deal_id)
    if (!d || d.stage === 'Invested') return null
    return { ...p, owner: d.stage === 'Passed' ? 'passed' : 'pipeline', companyLabel: d.name, href: `/?open=${p.deal_id}` }
  }
  const name = p.company_name?.trim()
  if (!name) return null
  return { ...p, owner: 'external', companyLabel: name, href: null }
}

export interface IndicationRow {
  indication: string
  /** Programs per map column, sorted Solas-first then by company. */
  cells: MapProgram[][]
  /** Solas (portfolio + pipeline) programs in this indication — drives sort and the "ours" badge. */
  oursCount: number
}

export interface AreaGroup {
  area: string
  rows: IndicationRow[]
  total: number
}

const OWNER_RANK: Record<ProgramOwner, number> = { portfolio: 0, pipeline: 1, passed: 2, external: 3 }

function indicationKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Group programs into therapeutic area → indication rows → phase cells.
 * Indications are matched case- and whitespace-insensitively so "Heart failure"
 * and "Heart Failure" share a row; the first spelling seen is displayed.
 * Areas follow THERAPEUTIC_AREAS order; within an area, indications where
 * Solas has a program come first, then by program count, then alphabetically.
 */
export function buildMap(programs: MapProgram[]): AreaGroup[] {
  const byArea = new Map<string, Map<string, IndicationRow>>()
  for (const p of programs) {
    const area = p.therapeutic_area || 'Other'
    if (!byArea.has(area)) byArea.set(area, new Map())
    const rows = byArea.get(area)!
    const key = indicationKey(p.indication)
    let row = rows.get(key)
    if (!row) {
      row = { indication: p.indication.trim(), cells: MAP_COLUMNS.map(() => []), oursCount: 0 }
      rows.set(key, row)
    }
    row.cells[phaseColumn(p.phase)].push(p)
    if (p.owner === 'portfolio' || p.owner === 'pipeline') row.oursCount++
  }

  const areaOrder = (a: string) => {
    const i = (THERAPEUTIC_AREAS as readonly string[]).indexOf(a)
    return i === -1 ? THERAPEUTIC_AREAS.length : i
  }
  const count = (r: IndicationRow) => r.cells.reduce((n, c) => n + c.length, 0)

  return Array.from(byArea.entries())
    .sort(([a], [b]) => areaOrder(a) - areaOrder(b) || a.localeCompare(b))
    .map(([area, rows]) => {
      const list = Array.from(rows.values())
      for (const r of list) {
        for (const cell of r.cells) {
          cell.sort((a, b) => OWNER_RANK[a.owner] - OWNER_RANK[b.owner] || a.companyLabel.localeCompare(b.companyLabel))
        }
      }
      list.sort((a, b) =>
        Number(b.oursCount > 0) - Number(a.oursCount > 0) ||
        count(b) - count(a) ||
        a.indication.localeCompare(b.indication))
      return { area, rows: list, total: list.reduce((n, r) => n + count(r), 0) }
    })
}

/** Distinct indication spellings already in use — offered as suggestions so new rows land on existing map rows. */
export function knownIndications(programs: Pick<Program, 'indication'>[]): string[] {
  const seen = new Map<string, string>()
  for (const p of programs) {
    const k = indicationKey(p.indication)
    if (k && !seen.has(k)) seen.set(k, p.indication.trim())
  }
  return Array.from(seen.values()).sort((a, b) => a.localeCompare(b))
}

/**
 * Copy a deal's programs onto the portfolio company it became. Best-effort:
 * the investment itself has already succeeded, so a failure here is reported
 * back for logging, never thrown. Skips the copy when the company already has
 * programs (an existing company the deal merged into) to avoid duplicates.
 */
export async function copyDealProgramsToCompany(
  supabase: SupabaseClient,
  dealId: string,
  companyId: string,
): Promise<string | null> {
  const [src, existing] = await Promise.all([
    supabase.from('programs').select('*').eq('deal_id', dealId),
    supabase.from('programs').select('id').eq('company_id', companyId).limit(1),
  ])
  if (src.error) return src.error.message
  if (existing.error) return existing.error.message
  if ((existing.data ?? []).length > 0 || (src.data ?? []).length === 0) return null
  const rows = (src.data as Program[]).map((p) => ({
    company_id: companyId,
    intervention: p.intervention,
    mechanism: p.mechanism,
    modality: p.modality,
    indication: p.indication,
    therapeutic_area: p.therapeutic_area,
    phase: p.phase,
    status: p.status,
    source: p.source,
    notes: p.notes,
    needs_review: p.needs_review,
  }))
  const { error } = await supabase.from('programs').insert(rows)
  return error ? error.message : null
}
