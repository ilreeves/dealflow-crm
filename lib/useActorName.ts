import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// The display name stamped onto notes and activity rows. Four components used
// to run their own auth.getUser() round-trip + profiles query (some on every
// note submit, one with eq('id', undefined) when signed out) — the name
// doesn't change within a session, so resolve it once and share.
let cached: Promise<string | null> | null = null

export function getActorName(supabase: SupabaseClient): Promise<string | null> {
  if (!cached) {
    cached = (async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      return data?.full_name || user.email || null
    })().catch(() => {
      // Don't cache a transient failure as a permanent null.
      cached = null
      return null
    })
  }
  return cached
}

export function useActorName(): string | null {
  const supabase = createClient()
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    getActorName(supabase).then((n) => { if (active) setName(n) })
    return () => { active = false }
  }, [supabase])
  return name
}
