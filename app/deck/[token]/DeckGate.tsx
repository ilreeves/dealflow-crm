'use client'

import { useEffect, useState } from 'react'
import { Loader2, Download, FileText } from 'lucide-react'

interface Props {
  token: string
  company: string | null
}

const LS_KEY = 'solas-deck-viewer'

export default function DeckGate({ token, company }: Props) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deckUrl, setDeckUrl] = useState<string | null>(null)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      if (saved.name) setName(saved.name)
      if (saved.email) setEmail(saved.email)
    } catch { /* ignore */ }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !email.trim()) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch(`/api/deck/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Something went wrong.')
        setSubmitting(false)
        return
      }
      try { localStorage.setItem(LS_KEY, JSON.stringify({ name: name.trim(), email: email.trim() })) } catch { /* ignore */ }
      setDeckUrl(data.url as string)
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  // Unknown / expired token
  if (!company) {
    return (
      <Shell>
        <div className="text-center">
          <h1 className="text-lg font-semibold text-slate-900">Deck unavailable</h1>
          <p className="text-sm text-slate-500 mt-2">This link is no longer active. Please reach out to your contact at Solas BioVentures for an up-to-date link.</p>
        </div>
      </Shell>
    )
  }

  // Deck unlocked — show it inline
  if (deckUrl) {
    return (
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#1c2b31' }}>
        <div className="flex items-center justify-between px-5 py-3 shrink-0" style={{ backgroundColor: '#023a51' }}>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-4 h-4 text-white shrink-0" style={{ color: '#5ba200' }} />
            <p className="text-sm font-medium text-white truncate">{company} — Non-Confidential Deck</p>
          </div>
          <a
            href={deckUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex items-center gap-1.5 text-xs text-white border border-white/25 hover:bg-white/10 rounded-lg px-2.5 py-1.5 transition shrink-0"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </a>
        </div>
        <iframe src={deckUrl} title={`${company} deck`} className="flex-1 w-full border-0" />
      </div>
    )
  }

  // Gate form
  return (
    <Shell>
      <div className="text-center mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5ba200' }}>Solas BioVentures</p>
        <h1 className="text-lg font-semibold text-slate-900 mt-1">{company}</h1>
        <p className="text-sm text-slate-500 mt-1">Enter your details to view the non-confidential deck.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <button
          type="submit"
          disabled={submitting || !name.trim() || !email.trim()}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
          style={{ backgroundColor: '#023a51' }}
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          View Deck
        </button>
      </form>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-slate-100 p-6">
        {children}
      </div>
    </div>
  )
}
