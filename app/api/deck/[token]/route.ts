import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type DeckRow = { id: string; name: string; non_con_deck_path: string | null }

async function resolveToken(admin: ReturnType<typeof createAdminClient>, token: string) {
  const deal = await admin
    .from('deals')
    .select('id,name,non_con_deck_path')
    .eq('non_con_deck_token', token)
    .maybeSingle()
  if (deal.data) return { entityType: 'deal', row: deal.data as DeckRow }

  const pc = await admin
    .from('portfolio_companies')
    .select('id,name,non_con_deck_path')
    .eq('non_con_deck_token', token)
    .maybeSingle()
  if (pc.data) return { entityType: 'portfolio', row: pc.data as DeckRow }

  return null
}

// Records the viewer and returns a fresh short-lived signed URL to the deck.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let body: { name?: string; email?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim()
  if (!name || !email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Deck sharing is not configured on the server.' }, { status: 500 })
  }

  const resolved = await resolveToken(admin, token)
  if (!resolved || !resolved.row.non_con_deck_path) {
    return NextResponse.json({ error: 'This deck link is no longer available.' }, { status: 404 })
  }

  await admin.from('deck_views').insert({
    token,
    entity_type: resolved.entityType,
    entity_id: resolved.row.id,
    company_name: resolved.row.name,
    viewer_name: name,
    viewer_email: email,
  })

  const { data, error } = await admin.storage
    .from('deal-files')
    .createSignedUrl(resolved.row.non_con_deck_path, 60 * 60)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not load the deck. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, company: resolved.row.name })
}
