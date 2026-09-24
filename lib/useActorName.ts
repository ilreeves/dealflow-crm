import { useEffect, useState } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// The display name stamped onto notes and activity rows. Four components used
// to run their own auth.getUser() round-trip + profiles query (some on every
// note submit, one with eq('id', undefined) when signed out) — the name
// doesn't change within a session, so resolve it once and share.
//
// The user id rides along for the same reason: save paths used to call
// auth.getUser() (a network round-trip to the Auth server, not a local read)
// before every write just to stamp author_id. Login does a full page reload,
// so this module-level cache resets per session and can't leak across users.
export interface Actor {
  id: string
  name: string | null
}

let cached: Promise<Actor | null> | null = null

export function getActor(supabase: SupabaseClient): Promise<Actor | null> {
  if (!cached) {
    cached = (async () => {
      // getUser() reports a network failure via `error` rather than throwing —
      // rethrow so it hits the no-cache path below instead of pinning a null
      // author_id on every write for the rest of the session.
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error) throw error
      if (!user) return null
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
      return { id: user.id, name: data?.full_name || user.email || null }
    })().catch(() => {
      // Don't cache a transient failure as a permanent null.
      cached = null
      return null
    })
  }
  return cached
}

export async function getActorName(supabase: SupabaseClient): Promise<string | null> {
  return (await getActor(supabase))?.name ?? null
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
