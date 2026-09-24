import { Suspense } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExpired } from '@/lib/deck'
import { logError } from '@/lib/log'
import DeckGate from './DeckGate'

// No `export const runtime`: Node is already the default, and declaring it
// made Vercel split this route into its own function — which idled cold
// (2–3s first hits for outside investors) while the main app stayed warm.
export const dynamic = 'force-dynamic'

type Lookup = { company: string | null; label: string | null; expired: boolean }

async function lookup(token: string): Promise<Lookup> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    // Without this log, a missing SUPABASE_SERVICE_ROLE_KEY makes every share
    // link render "unavailable" with zero signal anywhere.
    console.error('deck lookup unavailable:', e instanceof Error ? e.message : e)
    return { company: null, label: null, expired: false }
  }
  const { data, error } = await admin
    .from('company_decks')
    .select('company_name,label,storage_path,shared_at')
    .eq('token', token)
    .maybeSingle()
  if (error) logError('deck/page', `lookup failed: ${error.message}`, admin)
  if (!data?.storage_path) return { company: null, label: null, expired: false }
  return { company: data.company_name as string, label: data.label as string, expired: isExpired(data.shared_at as string | null) }
}

// The page streams: the frame and a loading card go out immediately, and the
// gate fills in when the lookup returns. Investors opening a link see the
// page at once instead of a blank tab while the database answers.
export default async function DeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <Suspense fallback={<DeckLoading />}>
      <DeckContent token={token} />
    </Suspense>
  )
}

async function DeckContent({ token }: { token: string }) {
  const { company, label, expired } = await lookup(token)
  return <DeckGate token={token} company={company} label={label} expired={expired} />
}

// Same card as DeckGate's Shell, so the swap to the real gate doesn't jump.
function DeckLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-6" aria-busy="true">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5ba200' }}>Solas BioVentures</p>
        <div className="mt-3 space-y-2.5 animate-pulse">
          <div className="h-5 w-2/3 rounded bg-slate-100" />
          <div className="h-3.5 w-full rounded bg-slate-100" />
          <div className="h-9 w-full rounded-lg bg-slate-100 mt-4" />
          <div className="h-9 w-full rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  )
}
