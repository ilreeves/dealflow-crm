'use client'

import { useState, useEffect } from 'react'
import { Loader2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

interface Member {
  id: string
  full_name: string | null
  // Mirrored from auth.users by supabase/migration_profile_identity.sql.
  // Absent until that migration runs — the list then falls back to names only.
  email?: string | null
  joined_at?: string | null
  last_sign_in_at?: string | null
}

// Postgres "undefined column" / PostgREST "column not in schema cache": the
// identity migration hasn't been run yet. Anything else is a real failure.
function isMissingColumn(err: { code?: string; message: string }): boolean {
  return err.code === '42703' || err.code === 'PGRST204' || /column .* does not exist/i.test(err.message)
}

export default function TeamMembers() {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [meId, setMeId] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [identityMissing, setIdentityMissing] = useState(false)

  useEffect(() => {
    let active = true
    // Only the id is needed for the "(you)" tag — getClaims() reads it from the
    // locally-verified JWT instead of getUser()'s Auth-server round-trip.
    supabase.auth.getClaims().then(({ data }) => { if (active) setMeId(data?.claims?.sub ?? '') })
    ;(async () => {
      let res = await supabase.from('profiles').select('id,full_name,email,joined_at,last_sign_in_at')
      if (res.error && isMissingColumn(res.error)) {
        if (active) setIdentityMissing(true)
        res = await supabase.from('profiles').select('id,full_name')
      }
      if (!active) return
      // Named people first, then by email, so the accounts nobody recognises
      // collect at the bottom where they're easy to review.
      const rows = ((res.data as Member[]) ?? []).sort((a, b) =>
        Number(!a.full_name) - Number(!b.full_name) ||
        (a.full_name ?? a.email ?? '').localeCompare(b.full_name ?? b.email ?? ''))
      setMembers(rows)
      setLoadError(res.error ? res.error.message : '')
      setLoading(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Team Members</h2>
        {/* Neither a failed nor an unfinished load is "0 people with access". */}
        {!loadError && !loading && <p className="text-xs text-slate-500 mt-0.5">{members.length} {members.length === 1 ? 'person' : 'people'} with access</p>}
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : loadError ? (
        <p className="px-5 py-6 text-sm text-red-600">Couldn&apos;t load team members: {loadError}</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.id} className="flex items-start sm:items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-700 truncate">
                    {m.full_name || m.email || <span className="text-slate-400">Unnamed user</span>}
                    {m.id === meId && <span className="text-xs text-slate-400 ml-1.5">(you)</span>}
                  </p>
                  {m.full_name && m.email && <p className="text-xs text-slate-400 truncate">{m.email}</p>}
                </div>
                {/* On phones the dates drop under the name instead of squeezing
                    the email down to "belitz@solasbi…". */}
                {(m.joined_at || m.last_sign_in_at !== undefined) && (
                  <div className="mt-0.5 sm:mt-0 sm:text-right shrink-0 flex gap-2 sm:block">
                    {m.joined_at && <p className="text-xs text-slate-500">Joined {formatDate(m.joined_at)}</p>}
                    <p className="text-[11px] text-slate-400">
                      {m.last_sign_in_at ? `Last sign-in ${formatDate(m.last_sign_in_at)}` : 'Never signed in'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-400">
          {identityMissing
            ? <>Run <code className="text-slate-500">supabase/migration_profile_identity.sql</code> to show each account&apos;s email and last sign-in. </>
            : null}
          Members are added and removed in the Supabase Auth dashboard (Authentication → Users).
        </p>
      </div>
    </div>
  )
}
