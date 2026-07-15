import { createAdminClient } from '@/lib/supabase/admin'
import { isExpired } from '@/lib/deck'
import DeckGate from './DeckGate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Lookup = { company: string | null; expired: boolean }

async function lookup(token: string): Promise<Lookup> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return { company: null, expired: false }
  }
  const deal = await admin.from('deals').select('name,non_con_deck_path,non_con_deck_shared_at').eq('non_con_deck_token', token).maybeSingle()
  const pc = deal.data?.non_con_deck_path
    ? null
    : await admin.from('portfolio_companies').select('name,non_con_deck_path,non_con_deck_shared_at').eq('non_con_deck_token', token).maybeSingle()
  const row = deal.data?.non_con_deck_path ? deal.data : pc?.data?.non_con_deck_path ? pc.data : null
  if (!row) return { company: null, expired: false }
  return { company: row.name as string, expired: isExpired(row.non_con_deck_shared_at as string | null) }
}

export default async function DeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { company, expired } = await lookup(token)
  return <DeckGate token={token} company={company} expired={expired} />
}
