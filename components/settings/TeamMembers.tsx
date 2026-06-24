'use client'

import { useState, useEffect } from 'react'
import { Loader2, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Member { id: string; full_name: string | null }

export default function TeamMembers() {
  const supabase = createClient()
  const [members, setMembers] = useState<Member[]>([])
  const [meId, setMeId] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setMeId(user?.id ?? ''))
    supabase.from('profiles').select('id,full_name').order('full_name')
      .then(({ data }) => { setMembers((data as Member[]) ?? []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Team Members</h2>
        <p className="text-xs text-slate-500 mt-0.5">{members.length} {members.length === 1 ? 'person' : 'people'} with access</p>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="divide-y divide-slate-100">
          {members.map((m) => (
            <div key={m.id} className="flex items-center gap-3 px-5 py-3">
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <span className="text-sm text-slate-700">{m.full_name || <span className="text-slate-400">Unnamed user</span>}</span>
              {m.id === meId && <span className="text-xs text-slate-400">(you)</span>}
            </div>
          ))}
        </div>
      )}
      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
        <p className="text-xs text-slate-400">New members are added from the Supabase Auth dashboard. They appear here once they set a display name.</p>
      </div>
    </div>
  )
}
