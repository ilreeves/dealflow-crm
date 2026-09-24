import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Public, key-free APIs. Both are called server-side (no CORS), best-effort:
// a failure in one source never blocks the other. Fetchers return null (not [])
// on timeout / non-2xx so an outage is distinguishable from "genuinely no
// results" — otherwise a CT.gov blip would overwrite good cached enrichment
// with empty arrays and a fresh fetched_at that makes it look current.
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

async function ctQuery(param: string, pageSize = 8): Promise<Trial[] | null> {
  const res = await timedFetch(`${CT_BASE}?${param}&pageSize=${pageSize}&fields=${CT_FIELDS}`)
  if (!res || !res.ok) return null
  const json = await res.json().catch(() => null)
  if (!json) return null
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
// null if ANY query failed: a partial merge (sponsor trials but not the drug
// ones) would silently drop rows from the cache, so treat it as a failed source.
async function fetchTrials(sponsor: string, drugs: string[]): Promise<Trial[] | null> {
  const queries: string[] = []
  if (sponsor) queries.push(`query.spons=${encodeURIComponent(sponsor)}`)
  for (const d of drugs) queries.push(`query.intr=${encodeURIComponent(d)}`)
  // Arrow wrapper, not .map(ctQuery): map passes the array index as the 2nd
  // arg, which would land in pageSize (sponsor query → pageSize=0, …).
  const results = await Promise.all(queries.map((q) => ctQuery(q)))
  if (results.some((r) => r === null)) return null
  const byId = new Map<string, Trial>()
  for (const list of results) for (const t of list ?? []) if (!byId.has(t.nctId)) byId.set(t.nctId, t)
  return Array.from(byId.values()).slice(0, 12)
}

// PubMed E-utilities — recent publications by authors affiliated with the
// company. Scoping to [Affiliation] (vs an all-fields match) is critical:
// a bare company name matches incidental mentions and common words (e.g.
// "Arrivo" also being an Italian word), returning irrelevant papers.
async function fetchPubs(name: string): Promise<Pub[] | null> {
  const term = encodeURIComponent(`"${name}"[Affiliation]`)
  const r1 = await timedFetch(`${EUTILS}/esearch.fcgi?db=pubmed&term=${term}&retmax=6&sort=date&retmode=json&tool=solas-crm`)
  if (!r1 || !r1.ok) return null
  const j1 = await r1.json().catch(() => null)
  if (!j1) return null
  const ids: string[] = j1?.esearchresult?.idlist ?? []
  if (!ids.length) return [] // a real "no publications" answer, not a failure
  const r2 = await timedFetch(`${EUTILS}/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json&tool=solas-crm`)
  if (!r2 || !r2.ok) return null
  const j2 = await r2.json().catch(() => null)
  if (!j2) return null
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
    if (trials === null && publications === null) {
      return NextResponse.json({ error: 'ClinicalTrials.gov and PubMed are both unreachable — try again shortly' }, { status: 502 })
    }
    return NextResponse.json({ trials: trials ?? [], publications: publications ?? [], warning: failedWarning(trials, publications, 'are missing') })
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

  const [fresh, prev] = await Promise.all([
    Promise.all([fetchTrials(sponsor, drugs), fetchPubs(name)]),
    supabase.from('company_enrichment').select('trials, publications')
      .eq('entity_type', entityType).eq('entity_id', entityId).maybeSingle(),
  ])
  const [freshTrials, freshPubs] = fresh
  // Total outage: leave the cache (and its fetched_at) exactly as it was.
  if (freshTrials === null && freshPubs === null) {
    return NextResponse.json({ error: 'ClinicalTrials.gov and PubMed are both unreachable — cached results kept; try again shortly' }, { status: 502 })
  }
  // One source down: keep its previously cached value rather than blanking it.
  // If the cache read itself failed we can't merge safely, so don't write.
  if (prev.error && (freshTrials === null || freshPubs === null)) {
    return NextResponse.json({ error: `Couldn't read cached results to merge: ${prev.error.message}` }, { status: 500 })
  }
  const trials = freshTrials ?? ((prev.data?.trials as Trial[] | undefined) ?? [])
  const publications = freshPubs ?? ((prev.data?.publications as Pub[] | undefined) ?? [])
  const fetched_at = new Date().toISOString()

  const { error } = await supabase.from('company_enrichment').upsert(
    { entity_type: entityType, entity_id: entityId, query_name: name, trials, publications, fetched_at },
    { onConflict: 'entity_type,entity_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ trials, publications, fetched_at, warning: failedWarning(freshTrials, freshPubs, 'shown are from the last successful pull') })
}

// Only called when at least one source succeeded (both-failed returns 502).
function failedWarning(trials: Trial[] | null, pubs: Pub[] | null, what: string): string | undefined {
  if (trials === null) return `ClinicalTrials.gov was unreachable — trials ${what}.`
  if (pubs === null) return `PubMed was unreachable — publications ${what}.`
  return undefined
}
