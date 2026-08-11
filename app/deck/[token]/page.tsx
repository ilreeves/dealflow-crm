import { createAdminClient } from '@/lib/supabase/admin'
import { isExpired } from '@/lib/deck'
import DeckGate from './DeckGate'

export const runtime = 'nodejs'
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
  if (error) console.error('deck lookup failed:', error.message)
  if (!data?.storage_path) return { company: null, label: null, expired: false }
  return { company: data.company_name as string, label: data.label as string, expired: isExpired(data.shared_at as string | null) }
}

export default async function DeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { company, label, expired } = await lookup(token)
  return <DeckGate token={token} company={company} label={label} expired={expired} />
}
