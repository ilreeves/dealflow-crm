'use client'

import { useState, useSyncExternalStore } from 'react'
import { Loader2, Download, FileText } from 'lucide-react'

interface Props {
  token: string
  company: string | null
  label: string | null
  expired: boolean
}

const LS_KEY = 'solas-deck-viewer'

// The last viewer's name/email, so a returning visitor doesn't retype them. This page
// is server-rendered and localStorage only exists in the browser, so it is read as an
// external store: the server snapshot is empty and React fills the saved values in
// right after hydration. Cached because getSnapshot has to return a stable reference.
type SavedViewer = { name?: string; email?: string }

const NO_SAVED_VIEWER: SavedViewer = {}
let savedViewerCache: SavedViewer | null = null

function readSavedViewer(): SavedViewer {
  if (!savedViewerCache) {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LS_KEY) || '{}')
      savedViewerCache = parsed && typeof parsed === 'object' ? (parsed as SavedViewer) : NO_SAVED_VIEWER
    } catch {
      savedViewerCache = NO_SAVED_VIEWER
    }
  }
  return savedViewerCache
}

// Nothing else writes the key, so there is no change to subscribe to.
function subscribeToSavedViewer() {
  return () => {}
}

function serverSavedViewer() {
  return NO_SAVED_VIEWER
}

export default function DeckGate({ token, company, label, expired }: Props) {
  // "Series B" -> "Series B", generic "Deck" -> "Non-Confidential"
  const deckLabel = label && label.toLowerCase() !== 'deck' ? label : 'Non-Confidential'
  const saved = useSyncExternalStore(subscribeToSavedViewer, readSavedViewer, serverSavedViewer)
  // null means "untouched" — fall back to whatever was saved. Clearing a field to ''
  // is a real edit and must not be overwritten by the saved value.
  const [nameInput, setNameInput] = useState<string | null>(null)
  const [emailInput, setEmailInput] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [deckUrl, setDeckUrl] = useState<string | null>(null)

  const name = nameInput ?? saved.name ?? ''
  const email = emailInput ?? saved.email ?? ''

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
      const viewer = { name: name.trim(), email: email.trim() }
      savedViewerCache = viewer
      try { localStorage.setItem(LS_KEY, JSON.stringify(viewer)) } catch { /* ignore */ }
      setDeckUrl(data.url as string)
    } catch {
      setError('Network error. Please try again.')
    }
    setSubmitting(false)
  }

  // Unknown token
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

  // Link past its 4-week window
  if (expired) {
    return (
      <Shell>
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#5ba200' }}>Solas BioVentures</p>
          <h1 className="text-lg font-semibold text-slate-900 mt-1">Link expired</h1>
          <p className="text-sm text-slate-500 mt-2">This link to the {company} deck has expired. Please reach out to your contact at Solas BioVentures for a fresh link.</p>
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
            <p className="text-sm font-medium text-white truncate">{company} — {deckLabel} Deck</p>
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
        <p className="text-sm text-slate-500 mt-1">Enter your details to view the {deckLabel.toLowerCase()} deck.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Name</label>
          <input
            value={name}
            onChange={(e) => setNameInput(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmailInput(e.target.value)}
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
