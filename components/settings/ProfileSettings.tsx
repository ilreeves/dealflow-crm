'use client'

import { useState, useEffect } from 'react'
import { Loader2, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function ProfileSettings() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [userId, setUserId] = useState('')
  const [name, setName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      setEmail(user.email ?? '')
      setUserId(user.id)
      const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
      setName(data?.full_name ?? '')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveName() {
    setSavingName(true); setNameSaved(false)
    await supabase.from('profiles').update({ full_name: name.trim() || null }).eq('id', userId)
    setSavingName(false); setNameSaved(true)
    setTimeout(() => setNameSaved(false), 2000)
  }

  async function savePassword() {
    setPwMsg('')
    if (pw.length < 6) { setPwMsg('Password must be at least 6 characters.'); return }
    if (pw !== pw2) { setPwMsg('Passwords do not match.'); return }
    setSavingPw(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setSavingPw(false)
    if (error) setPwMsg(error.message)
    else { setPwMsg('Password updated.'); setPw(''); setPw2('') }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold text-slate-900">Your Profile</h2>
        <p className="text-xs text-slate-500 mt-0.5">{email}</p>
      </div>
      <div className="px-5 py-4 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Display name</label>
          <div className="flex items-center gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <button onClick={saveName} disabled={savingName} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-50 transition">
              {savingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : nameSaved ? <Check className="w-3.5 h-3.5" /> : null}
              {nameSaved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>
        <div className="pt-3 border-t border-slate-100">
          <label className="block text-xs font-medium text-slate-600 mb-1">Change password</label>
          <div className="grid grid-cols-2 gap-2">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
            <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirm"
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900" />
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={savePassword} disabled={savingPw || !pw} className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition">
              {savingPw && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Update password
            </button>
            {pwMsg && <span className={`text-xs ${pwMsg.includes('updated') ? 'text-green-600' : 'text-red-600'}`}>{pwMsg}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
