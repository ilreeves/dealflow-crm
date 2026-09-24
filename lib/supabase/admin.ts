import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Server-only client that bypasses RLS. NEVER import this into client components.
// Requires SUPABASE_SERVICE_ROLE_KEY (the sb_secret_... key) in the environment.
//
// One per server instance, not per request: it carries no user session
// (persistSession off), so sharing it is safe, and building a fresh client on
// every public deck hit added its setup cost to what outside investors wait on.
let client: SupabaseClient | null = null

export function createAdminClient(): SupabaseClient {
  if (client) return client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin client is not configured (missing SUPABASE_SERVICE_ROLE_KEY)')
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}
