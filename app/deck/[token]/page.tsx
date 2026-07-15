import { createAdminClient } from '@/lib/supabase/admin'
import DeckGate from './DeckGate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function lookup(token: string): Promise<string | null> {
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return null
  }
  const deal = await admin.from('deals').select('name,non_con_deck_path').eq('non_con_deck_token', token).maybeSingle()
  if (deal.data?.non_con_deck_path) return deal.data.name as string
  const pc = await admin.from('portfolio_companies').select('name,non_con_deck_path').eq('non_con_deck_token', token).maybeSingle()
  if (pc.data?.non_con_deck_path) return pc.data.name as string
  return null
}

export default async function DeckPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const company = await lookup(token)
  return <DeckGate token={token} company={company} />
}
