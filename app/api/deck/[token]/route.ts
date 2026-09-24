import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isExpired } from '@/lib/deck'
import { logError } from '@/lib/log'

// No `export const runtime`: Node is already the default, and declaring it
// made Vercel split this route into its own function — which idled cold
// (2–3s first hits for outside investors) while the main app stayed warm.

// This endpoint is deliberately unauthenticated (outside investors open these
// links) and it both writes rows and mints signed URLs via the service-role
// client — so it gets its own throttle. In-memory is enough here: it protects
// against link-flooding, not a distributed adversary, and this is a
// single-tenant app with a handful of live links at a time.
const RATE_WINDOW_MS = 10 * 60 * 1000
const RATE_MAX_PER_TOKEN_IP = 30 // per token+IP per window
// Checked first: a token+IP key alone is bypassed by rotating (guessed) tokens.
// Looser than the per-token cap so a shared office NAT opening a few decks —
// plus a Download click each — isn't throttled.
const RATE_MAX_PER_IP = 90
// Hard ceiling on tracked keys. Pruning only drops fully-expired keys, which
// can't keep up with a flood of fresh ones inside one window — so past the cap
// the least-recently-hit key is evicted (Map iteration order = insertion
// order, and every hit re-inserts its key at the end).
const RATE_MAX_KEYS = 5000
const hits = new Map<string, number[]>()

function rateLimited(key: string, max: number): boolean {
  const now = Date.now()
  const windowStart = now - RATE_WINDOW_MS
  const stamps = (hits.get(key) ?? []).filter((t) => t > windowStart)
  hits.delete(key)
  if (stamps.length >= max) {
    hits.set(key, stamps)
    return true
  }
  stamps.push(now)
  hits.set(key, stamps)
  if (hits.size > RATE_MAX_KEYS) {
    for (const [k, v] of hits) {
      if (!v.some((t) => t > windowStart)) hits.delete(k)
    }
    // Still over (everything is live): evict oldest-first.
    for (const k of hits.keys()) {
      if (hits.size <= RATE_MAX_KEYS) break
      hits.delete(k)
    }
  }
  return false
}

// Viewer fields land in deck_views and the digest email; an unbounded string
// from an unauthenticated form has no business there.
const MAX_FIELD_LEN = 200

// A repeat open by the same viewer within this window is a page refresh, not a
// new view — recording it would inflate the tracker the gate exists to feed.
const VIEW_DEDUPE_MS = 30 * 60 * 1000

// Records the viewer and returns a fresh short-lived signed URL to the deck.
// `download: true` (DeckGate's Download button) signs the URL as an attachment
// named after the original file. It re-posts the same name/email, so the view
// dedupe below keeps it from counting as a second view.
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let body: { name?: unknown; email?: unknown; download?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const name = (typeof body?.name === 'string' ? body.name : '').trim().slice(0, MAX_FIELD_LEN)
  const email = (typeof body?.email === 'string' ? body.email : '').trim().toLowerCase()
  // Reject rather than truncate an over-long email — a clipped address would
  // be recorded as a real (wrong) viewer.
  if (!name || !email || email.length > MAX_FIELD_LEN || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'Please enter your name and a valid email.' }, { status: 400 })
  }
  const download = body?.download === true

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (rateLimited(`ip:${ip}`, RATE_MAX_PER_IP) || rateLimited(`${token}:${ip}`, RATE_MAX_PER_TOKEN_IP)) {
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
    .select('entity_type,entity_id,company_name,label,storage_path,file_name,shared_at')
    .eq('token', token)
    .maybeSingle()
  if (lookupErr) {
    // A transient DB error must not masquerade as a dead link.
    logError('api/deck', `lookup failed: ${lookupErr.message}`, admin)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 503 })
  }
  if (!deck?.storage_path) {
    return NextResponse.json({ error: 'This deck link is no longer available.' }, { status: 404 })
  }
  if (isExpired(deck.shared_at)) {
    return NextResponse.json({ error: 'This deck link has expired. Please request a new one.' }, { status: 410 })
  }

  // The parent check, the view-dedupe read and the URL signing are independent
  // of each other, so they run together (one round-trip instead of three).
  // Nothing is returned or recorded until the parent check has passed.
  //
  // company_decks.entity_id is polymorphic (no FK), so a deleted deal/company
  // doesn't cascade here — without the parent check its link keeps serving
  // until the TTL lapses. "Unshared" must mean unshared.
  //
  // Short TTL on the URL: DeckGate fetches it on demand (and again on
  // Download), so it only needs to outlive one page load — and a revoked link
  // stops working in minutes, not an hour.
  const parentTable = deck.entity_type === 'deal' ? 'deals' : 'portfolio_companies'
  const dedupeStart = new Date(Date.now() - VIEW_DEDUPE_MS).toISOString()
  const [parentRes, dedupeRes, signRes] = await Promise.all([
    admin.from(parentTable).select('id').eq('id', deck.entity_id).maybeSingle(),
    admin
      .from('deck_views')
      .select('id')
      .eq('token', token)
      .eq('viewer_email', email)
      .gte('viewed_at', dedupeStart)
      .limit(1),
    admin.storage
      .from('deal-files')
      .createSignedUrl(deck.storage_path, 60 * 10, download ? { download: (deck.file_name as string | null) || true } : undefined),
  ])

  if (parentRes.error) {
    logError('api/deck', `parent lookup failed: ${parentRes.error.message}`, admin)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 503 })
  }
  if (!parentRes.data) {
    return NextResponse.json({ error: 'This deck link is no longer available.' }, { status: 404 })
  }

  const { data, error } = signRes
  if (error || !data?.signedUrl) {
    // Checked before recording the view: a viewer who never got the deck
    // shouldn't show up in the tracker.
    return NextResponse.json({ error: 'Could not load the deck. Please try again.' }, { status: 500 })
  }

  // View tracking is the point of the gate — a lost row must at least be visible
  // in the server logs, though it shouldn't block the viewer. The insert is the
  // one step that has to wait, on the dedupe read.
  const { data: recent, error: dedupeErr } = dedupeRes
  if (dedupeErr) logError('api/deck', `view dedupe check failed: ${dedupeErr.message}`, admin)
  if (!recent?.length) {
    const { error: viewErr } = await admin.from('deck_views').insert({
      token,
      entity_type: deck.entity_type,
      entity_id: deck.entity_id,
      company_name: deck.company_name,
      viewer_name: name,
      viewer_email: email,
    })
    if (viewErr) logError('api/deck', `deck_views insert failed (view LOST) for ${deck.company_name}: ${viewErr.message}`, admin)
  }

  return NextResponse.json({ url: data.signedUrl, company: deck.company_name, label: deck.label })
}
