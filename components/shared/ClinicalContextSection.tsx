'use client'

import { useEffect, useState } from 'react'
import { FlaskConical, BookOpen, Loader2, RefreshCw, ExternalLink, Sparkles } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

interface Trial { nctId: string; title: string; status: string; phases: string[]; conditions: string[]; sponsor: string }
interface Pub { pmid: string; title: string; journal: string; year: string; firstAuthor: string; url: string }

interface Props {
  entityType: 'deal' | 'portfolio'
  entityId: string
  name: string
  drugNames?: string | null
  ctSponsorName?: string | null
}

// Colour the trial status roughly by how active it is.
function statusColor(status: string): string {
  const s = status.toUpperCase()
  if (s.includes('RECRUIT') || s === 'ACTIVE_NOT_RECRUITING' || s === 'ENROLLING_BY_INVITATION') return 'bg-green-100 text-green-700'
  if (s === 'COMPLETED') return 'bg-blue-100 text-blue-700'
  if (s.includes('TERMINATED') || s.includes('WITHDRAWN') || s.includes('SUSPENDED')) return 'bg-red-100 text-red-700'
  return 'bg-slate-100 text-slate-600'
}

function prettyPhase(phases: string[]): string {
  if (!phases.length) return ''
  return phases.map((p) => p.replace('PHASE', 'Phase ').replace('NA', 'N/A')).join('/')
}

export default function ClinicalContextSection({ entityType, entityId, name, drugNames, ctSponsorName }: Props) {
  const supabase = createClient()
  const [trials, setTrials] = useState<Trial[]>([])
  const [pubs, setPubs] = useState<Pub[]>([])
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')

  // Load any cached result on open (no external call).
  useEffect(() => {
    let active = true
    supabase.from('company_enrichment').select('trials,publications,fetched_at')
      .eq('entity_type', entityType).eq('entity_id', entityId).maybeSingle()
      .then(({ data }) => {
        if (!active) return
        if (data) {
          setTrials((data.trials as Trial[]) ?? [])
          setPubs((data.publications as Pub[]) ?? [])
          setFetchedAt(data.fetched_at as string)
        }
        setLoaded(true)
      })
    return () => { active = false }
  }, [entityType, entityId])

  async function run() {
    setRunning(true)
    setError('')
    try {
      const res = await fetch('/api/enrichment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, name, drugNames, sponsorName: ctSponsorName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Lookup failed')
      setTrials((json.trials as Trial[]) ?? [])
      setPubs((json.publications as Pub[]) ?? [])
      setFetchedAt(json.fetched_at as string)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setRunning(false)
    }
  }

  const hasResults = fetchedAt != null

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Clinical &amp; Scientific Context</p>
        {hasResults && (
          <button onClick={run} disabled={running} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition disabled:opacity-50">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Live from ClinicalTrials.gov (lead-sponsor trials) and PubMed (recent publications) for &ldquo;{name}&rdquo;.
      </p>

      {!loaded ? (
        <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : !hasResults ? (
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white rounded-lg transition disabled:opacity-50"
          style={{ backgroundColor: '#023a51' }}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Pull clinical &amp; scientific context
        </button>
      ) : (
        <div className="space-y-4">
          {/* Trials */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-slate-600">
              <FlaskConical className="w-3.5 h-3.5" style={{ color: '#5ba200' }} /> Clinical Trials ({trials.length})
            </div>
            {trials.length === 0 ? (
              <p className="text-xs text-slate-400">
                No trials found on ClinicalTrials.gov.
                {!drugNames && !ctSponsorName && ' If this company runs trials under a different sponsor name, add its drug/asset name or CT.gov sponsor name (Edit) to find them.'}
              </p>
            ) : (
              <div className="space-y-1.5">
                {trials.map((t) => (
                  <div key={t.nctId} className="border border-slate-100 rounded-lg px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer"
                         className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline flex-1">
                        {t.title}
                        <ExternalLink className="inline w-3 h-3 ml-1 text-slate-300" />
                      </a>
                      <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColor(t.status)}`}>
                        {t.status.replace(/_/g, ' ').toLowerCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 flex-wrap">
                      <span className="font-mono">{t.nctId}</span>
                      {prettyPhase(t.phases) && <span>· {prettyPhase(t.phases)}</span>}
                      {t.conditions.length > 0 && <span>· {t.conditions.join(', ')}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Publications */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-slate-600">
              <BookOpen className="w-3.5 h-3.5" style={{ color: '#e98925' }} /> Recent Publications ({pubs.length})
            </div>
            {pubs.length === 0 ? (
              <p className="text-xs text-slate-400">No recent PubMed publications found.</p>
            ) : (
              <div className="space-y-1.5">
                {pubs.map((p) => (
                  <div key={p.pmid} className="border border-slate-100 rounded-lg px-3 py-2">
                    <a href={p.url} target="_blank" rel="noopener noreferrer"
                       className="text-sm font-medium text-slate-700 hover:text-slate-900 hover:underline">
                      {p.title}
                      <ExternalLink className="inline w-3 h-3 ml-1 text-slate-300" />
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {[p.firstAuthor && `${p.firstAuthor} et al.`, p.journal, p.year].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {fetchedAt && <p className="text-xs text-slate-300">Last updated {formatDate(fetchedAt)}</p>}
        </div>
      )}

      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}
