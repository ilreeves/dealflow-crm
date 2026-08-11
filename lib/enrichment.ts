// Shapes returned by /api/enrichment (ClinicalTrials.gov + PubMed lookups),
// plus the presentation helpers shared by every component that renders them.

export interface Trial { nctId: string; title: string; status: string; phases: string[]; conditions: string[]; sponsor: string }
export interface Pub { pmid: string; title: string; journal: string; year: string; firstAuthor: string; url: string }

// Colour the trial status roughly by how active it is.
export function statusColor(status: string): string {
  const s = status.toUpperCase()
  if (s.includes('RECRUIT') || s === 'ACTIVE_NOT_RECRUITING' || s === 'ENROLLING_BY_INVITATION') return 'bg-green-100 text-green-700'
  if (s === 'COMPLETED') return 'bg-blue-100 text-blue-700'
  if (s.includes('TERMINATED') || s.includes('WITHDRAWN') || s.includes('SUSPENDED')) return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-600'
}

export function prettyPhase(phases: string[]): string {
  if (!phases.length) return ''
  return phases.map((p) => p.replace('PHASE', 'Phase ').replace('NA', 'N/A')).join('/')
}
