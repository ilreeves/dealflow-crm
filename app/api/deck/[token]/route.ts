import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExpired } from '@/lib/deck'

export const runtime = 'nodejs'

// This endpoint is deliberately unauthenticated (outside investors open these
// links) and it both writes rows and mints signed URLs via the service-role
// client — so it gets its own throttle. In-memory is enough here: it protects
// against link-flooding, not a distributed adversary, and this is a
// single-tenant app with a handful of live links at a time.
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX_REQUESTS = 30 // per token+IP per window
const hits = new Map<string, number[]>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const windowStart = now - RATE_WINDOW_MS
  const stamps = (hits.get(key) ?? []).filter((t) => t > windowStart)
  if (stamps.length >= RATE_MAX_REQUESTS) {
    hits.set(key, stamps)
    return true
  }
  stamps.push(now)
  hits.set(key, stamps)
  // Opportunistic pruning so an attacker rotating keys can't grow the map.
  if (hits.size > 1000) {
    for (const [k, v] of hits) {
      if (!v.some((t) => t > windowStart)) hits.delete(k)
    }
  }
  return false
}

// A repeat open by the same viewer within this window is a page refresh, not a
// new view — recording it would inflate the tracker the gate exists to feed.
const VIEW_DEDUPE_MS = 30 * 60 * 1000

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
  const email = (body.email ?? '').trim().toLowerCase()
  if (!name || !email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(`${token}:${ip}`)) {
    return NextResponse.json({ error: 'Too many requests. Please try again in a few minutes.' }, { status: 429 })
  }

  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch {
    return NextResponse.json({ error: 'Deck sharing is not configured on the server.' }, { status: 500 })
  }

  const { data: deck, error: lookupErr } = await admin
    .from('company_decks')
    .select('entity_type,entity_id,company_name,label,storage_path,shared_at')
    .eq('token', token)
    .maybeSingle()
  if (lookupErr) {
    // A transient DB error must not masquerade as a dead link.
    console.error('deck lookup failed:', lookupErr.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 503 })
  }
  if (!deck?.storage_path) {
    return NextResponse.json({ error: 'This deck link is no longer available.' }, { status: 404 })
  }
  if (isExpired(deck.shared_at)) {
    return NextResponse.json({ error: 'This deck link has expired. Please request a new one.' }, { status: 410 })
  }

  // company_decks.entity_id is polymorphic (no FK), so a deleted deal/company
  // doesn't cascade here — without this check its link keeps serving until the
  // TTL lapses. "Unshared" must mean unshared.
  const parentTable = deck.entity_type === 'deal' ? 'deals' : 'portfolio_companies'
  const { data: parent, error: parentErr } = await admin
    .from(parentTable)
    .select('id')
    .eq('id', deck.entity_id)
    .maybeSingle()
  if (parentErr) {
    console.error('deck parent lookup failed:', parentErr.message)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 503 })
  }
  if (!parent) {
    return NextResponse.json({ error: 'This deck link is no longer available.' }, { status: 404 })
  }

  // View tracking is the point of the gate — a lost row must at least be visible
  // in the server logs, though it shouldn't block the viewer.
  const dedupeStart = new Date(Date.now() - VIEW_DEDUPE_MS).toISOString()
  const { data: recent, error: dedupeErr } = await admin
    .from('deck_views')
    .select('id')
    .eq('token', token)
    .eq('viewer_email', email)
    .gte('viewed_at', dedupeStart)
    .limit(1)
  if (dedupeErr) console.error('deck_views dedupe check failed:', dedupeErr.message)
  if (!recent?.length) {
    const { error: viewErr } = await admin.from('deck_views').insert({
      token,
      entity_type: deck.entity_type,
      entity_id: deck.entity_id,
      company_name: deck.company_name,
      viewer_name: name,
      viewer_email: email,
    })
    if (viewErr) console.error('deck_views insert failed:', viewErr.message)
  }

  // Short TTL: DeckGate fetches the URL on demand, so this only needs to
  // outlive one page load — and a revoked link stops working in minutes,
  // not an hour.
  const { data, error } = await admin.storage
    .from('deal-files')
    .createSignedUrl(deck.storage_path, 60 * 10)
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: 'Could not load the deck. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl, company: deck.company_name, label: deck.label })
}
