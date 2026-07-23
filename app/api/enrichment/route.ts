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

// ClinicalTrials.gov v2 — trials where the company is the lead sponsor.
async function fetchTrials(name: string): Promise<Trial[]> {
  const fields = [
    'protocolSection.identificationModule.nctId',
    'protocolSection.identificationModule.briefTitle',
    'protocolSection.statusModule.overallStatus',
    'protocolSection.designModule.phases',
    'protocolSection.conditionsModule.conditions',
    'protocolSection.sponsorCollaboratorsModule.leadSponsor',
  ].join(',')
  const url = `${CT_BASE}?query.spons=${encodeURIComponent(name)}&pageSize=8&fields=${fields}`
  const res = await timedFetch(url)
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
  const entityType = body?.entityType
  const entityId = body?.entityId
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if ((entityType !== 'deal' && entityType !== 'portfolio') || !entityId || !name) {
    return NextResponse.json({ error: 'entityType, entityId and name are required' }, { status: 400 })
  }

  const [trials, publications] = await Promise.all([fetchTrials(name), fetchPubs(name)])
  const fetched_at = new Date().toISOString()

  const { error } = await supabase.from('company_enrichment').upsert(
    { entity_type: entityType, entity_id: entityId, query_name: name, trials, publications, fetched_at },
    { onConflict: 'entity_type,entity_id' }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ trials, publications, fetched_at })
}
