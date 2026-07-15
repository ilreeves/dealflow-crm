import { createClient } from '@supabase/supabase-js'

// Server-only client that bypasses RLS. NEVER import this into client components.
// Requires SUPABASE_SERVICE_ROLE_KEY (the sb_secret_... key) in the environment.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase admin client is not configured (missing SUPABASE_SERVICE_ROLE_KEY)')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
