// Fail FAST on a missing Supabase config. The old "?? 'http://localhost'"
// fallbacks let a misconfigured deploy boot cleanly and render every page as
// confident empty states — indistinguishable from a genuinely empty database.
export function requireSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error(
      "Supabase is not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    )
  }
  return { url, anonKey }
}
