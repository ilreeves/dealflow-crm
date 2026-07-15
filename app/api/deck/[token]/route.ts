import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExpired } from '@/lib/deck'

export const runtime = 'nodejs'

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

  const { data: deck } = await admin
    .from('company_decks')
    .select('entity_type,entity_id,company_name,label,storage_path,shared_at')
    .eq('token', token)
    .maybeSingle()
  if (!deck?.storage_path) {
    return NextResponse.json({ error: 'This deck link is no longer available.' }, { status: 404 })
  }
  if (isExpired(deck.shared_at)) {
    return NextResponse.json({ error: 'This deck link has expired. Please request a new one.' }, { status: 410 })
  }

  await admin.from('deck_views').insert({
    token,
    entity_type: deck.entity_type,
    entity_id: deck.entity_id,
    company_name: deck.company_name,
    viewer_name: name,
    viewer_email: email,
  })

  const { data, error } = await admin.storage
    .from('deal-files')
    .createSignedUrl(deck.storage_path, 60 * 60)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not load the deck. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, company: deck.company_name, label: deck.label })
}
