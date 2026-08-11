import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public, key-free APIs. Both are called server-side (no CORS), best-effort:
// a failure in one source never blocks the other.
const CT_BASE = 'https://clinicaltrials.gov/api/v2/studies'
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

async function timedFetch(url: string, ms = 10000): Promise<Response | null> {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal })
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

type Trial = { nctId: string; title: string; status: string; phases: string[]; conditions: string[]; sponsor: string }
type Pub = { pmid: string; title: string; journal: string; year: string; firstAuthor: string; url: string }

const CT_FIELDS = [
  'protocolSection.identificationModule.nctId',
  'protocolSection.identificationModule.briefTitle',
  'protocolSection.statusModule.overallStatus',
  'protocolSection.designModule.phases',
  'protocolSection.conditionsModule.conditions',
  'protocolSection.sponsorCollaboratorsModule.leadSponsor',
].join(',')

async function ctQuery(param: string, pageSize = 8): Promise<Trial[]> {
  const res = await timedFetch(`${CT_BASE}?${param}&pageSize=${pageSize}&fields=${CT_FIELDS}`)
  if (!res || !res.ok) return []
  const json = await res.json().catch(() => null)
  const studies: unknown[] = Array.isArray(json?.studies) ? json.studies : []
  return studies
    .map((s) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const p = (s as any)?.protocolSection ?? {}
      return {
        nctId: p.identificationModule?.nctId ?? '',
        title: p.identificationModule?.briefTitle ?? '',
        status: p.statusModule?.overallStatus ?? '',
        phases: Array.isArray(p.designModule?.phases) ? p.designModule.phases : [],
        conditions: Array.isArray(p.conditionsModule?.conditions) ? p.conditionsModule.conditions.slice(0, 4) : [],
        sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? '',
      }
    })
    .filter((t) => t.nctId)
}

// ClinicalTrials.gov v2 — trials by sponsor AND by each drug/asset name
// (interventions), merged & de-duped. The intervention search is what finds a
// company's trials when they're registered under a different sponsor name.
async function fetchTrials(sponsor: string, drugs: string[]): Promise<Trial[]> {
  const queries: string[] = []
  if (sponsor) queries.push(`query.spons=${encodeURIComponent(sponsor)}`)
  for (const d of drugs) queries.push(`query.intr=${encodeURIComponent(d)}`)
  const results = await Promise.all(queries.map(ctQuery))
  const byId = new Map<string, Trial>()
  for (const list of results) for (const t of list) if (!byId.has(t.nctId)) byId.set(t.nctId, t)
  return Array.from(byId.values()).slice(0, 12)
}

// PubMed E-utilities — recent publications by authors affiliated with the
// company. Scoping to [Affiliation] (vs an all-fields match) is critical:
// a bare company name matches incidental mentions and common words (e.g.
// "Arrivo" also being an Italian word), returning irrelevant papers.
async function fetchPubs(name: string): Promise<Pub[]> {
  const term = encodeURIComponent(`"${name}"[Affiliation]`)
  const r1 = await timedFetch(`${EUTILS}/esearch.fcgi?db=pubmed&term=${term}&retmax=6&sort=date&retmode=json&tool=solas-crm`)
  if (!r1 || !r1.ok) return []
  const j1 = await r1.json().catch(() => null)
  const ids: string[] = j1?.esearchresult?.idlist ?? []
  if (!ids.length) return []
  const r2 = await timedFetch(`${EUTILS}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=solas-crm`)
  if (!r2 || !r2.ok) return []
  const j2 = await r2.json().catch(() => null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = j2?.result ?? {}
  const uids: string[] = Array.isArray(result.uids) ? result.uids : ids
  return uids
    .map((id) => {
      const rec = result[id] ?? {}
      return {
        pmid: id,
        title: rec.title ?? '',
        journal: rec.fulljournalname ?? rec.source ?? '',
        year: String(rec.pubdate ?? '').split(' ')[0] ?? '',
        firstAuthor: rec.authors?.[0]?.name ?? '',
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      }
    })
    .filter((p) => p.title)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''

  // Lookup mode: recent trials + publications for a named company, WITHOUT
  // caching — used for on-demand "updates" on a curated competitor.
  if (body?.lookup === true) {
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    const [trials, publications] = await Promise.all([fetchTrials(name, []), fetchPubs(name)])
    return NextResponse.json({ trials, publications })
  }

  const entityType = body?.entityType
  const entityId = body?.entityId
  if ((entityType !== 'deal' && entityType !== 'portfolio') || !entityId || !name) {
    return NextResponse.json({ error: 'entityType, entityId and name are required' }, { status: 400 })
  }

  // Curated overrides: exact CT.gov sponsor name (falls back to company name)
  // and comma-separated drug/asset names searched as trial interventions.
  const sponsor = (typeof body?.sponsorName === 'string' && body.sponsorName.trim()) || name
  // Each drug name fans out into its own CT.gov request (each with a 10s
  // timeout) — cap the list so a long free-text entry can't turn one request
  // into hundreds of concurrent outbound fetches.
  const drugs = (typeof body?.drugNames === 'string' ? body.drugNames : '')
    .split(',').map((d: string) => d.trim()).filter(Boolean).slice(0, 8)

  const [trials, publications] = await Promise.all([fetchTrials(sponsor, drugs), fetchPubs(name)])
  const fetched_at = new Date().toISOString()

  const { error } = await supabase.from('company_enrichment').upsert(
    { entity_type: entityType, entity_id: entityId, query_name: name, trials, publications, fetched_at },
    { onConflict: 'entity_type,entity_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ trials, publications, fetched_at })
}
