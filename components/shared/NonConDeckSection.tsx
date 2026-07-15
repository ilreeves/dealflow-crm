'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Download, Trash2, Eye, Loader2, RefreshCw, Mail, Users, ChevronDown, ChevronRight } from 'lucide-react'
import { DealFile, DeckView } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { isExpired, DECK_LINK_TTL_MS } from '@/lib/deck'
import PdfViewer from '@/components/deals/PdfViewer'

interface Props {
  table: 'deals' | 'portfolio_companies'
  id: string
  entityName: string
  path: string | null
  name: string | null
  token: string | null
  sharedAt: string | null
  onChange?: (path: string | null, name: string | null) => void
  // Builds the draft; receives the trackable /deck/<token> share link (null if unavailable)
  buildEmail?: (deckUrl: string | null) => { subject: string; body: string }
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company'
}

export default function NonConDeckSection({ table, id, entityName, path, name, token, sharedAt, onChange, buildEmail }: Props) {
  const supabase = createClient()
  const [deckPath, setDeckPath] = useState(path)
  const [deckName, setDeckName] = useState(name)
  const [deckToken, setDeckToken] = useState(token)
  const [deckSharedAt, setDeckSharedAt] = useState(sharedAt)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [viewing, setViewing] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [views, setViews] = useState<DeckView[]>([])
  const [showViews, setShowViews] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  const isPdf = !!deckName && deckName.toLowerCase().endsWith('.pdf')

  // Load the view log whenever there's a live share token
  useEffect(() => {
    if (!deckToken) { setViews([]); return }
    supabase.from('deck_views').select('*').eq('token', deckToken)
      .order('viewed_at', { ascending: false })
      .then(({ data }) => setViews((data as DeckView[]) ?? []))
  }, [deckToken])

  async function upload(file: File) {
    setUploading(true)
    setError('')
    const prefix = table === 'deals' ? id : `portfolio/${id}`
    const storagePath = `${prefix}/noncon-deck/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('deal-files').upload(storagePath, file)
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`)
      setUploading(false)
      return
    }
    // Keep any existing share token (links already sent keep pointing at the new file)
    const previous = deckPath
    await supabase.from(table).update({ non_con_deck_path: storagePath, non_con_deck_name: file.name }).eq('id', id)
    if (previous) await supabase.storage.from('deal-files').remove([previous])
    setDeckPath(storagePath)
    setDeckName(file.name)
    onChange?.(storagePath, file.name)
    setUploading(false)
  }

  async function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) await upload(f)
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleDownload() {
    if (!deckPath) return
    const { data } = await supabase.storage.from('deal-files').createSignedUrl(deckPath, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = deckName ?? 'deck'
      a.click()
    }
  }

  async function handleRemove() {
    const previous = deckPath
    await supabase.from(table).update({ non_con_deck_path: null, non_con_deck_name: null, non_con_deck_token: null, non_con_deck_shared_at: null }).eq('id', id)
    if (previous) await supabase.storage.from('deal-files').remove([previous])
    setDeckPath(null)
    setDeckName(null)
    setDeckToken(null)
    setDeckSharedAt(null)
    onChange?.(null, null)
  }

  // Picks a readable, unique slug like "aurenar-non-confidential-deck"
  async function makeToken(): Promise<string> {
    const base = `${slugify(entityName)}-non-confidential-deck`
    const [d, p] = await Promise.all([
      supabase.from('deals').select('id,non_con_deck_token').ilike('non_con_deck_token', `${base}%`),
      supabase.from('portfolio_companies').select('id,non_con_deck_token').ilike('non_con_deck_token', `${base}%`),
    ])
    const taken = new Set<string>()
    for (const r of [...(d.data ?? []), ...(p.data ?? [])] as { id: string; non_con_deck_token: string | null }[]) {
      if (r.non_con_deck_token && r.id !== id) taken.add(r.non_con_deck_token)
    }
    if (!taken.has(base)) return base
    let n = 2
    while (taken.has(`${base}-${n}`)) n++
    return `${base}-${n}`
  }

  // Opens a pre-drafted email with the trackable deck link, (re)starting the 4-week window
  async function handleEmail() {
    if (!deckPath || !buildEmail) return
    setEmailing(true)
    const t = deckToken ?? (await makeToken())
    const now = new Date().toISOString()
    await supabase.from(table).update({ non_con_deck_token: t, non_con_deck_shared_at: now }).eq('id', id)
    setDeckToken(t)
    setDeckSharedAt(now)
    const shareUrl = `${window.location.origin}/deck/${t}`
    const { subject, body } = buildEmail(shareUrl)
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setEmailing(false)
  }

  const deckFile = deckPath && deckName
    ? ({ id: 'noncon-deck', name: deckName, storage_path: deckPath, size: null, mime_type: null, deal_id: '', uploaded_by: null, created_at: '' } as unknown as DealFile)
    : null

  const linkExpired = isExpired(deckSharedAt)
  const expiryDate = deckSharedAt ? formatDate(new Date(new Date(deckSharedAt).getTime() + DECK_LINK_TTL_MS).toISOString()) : null

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Non-Confidential Deck</p>
      <p className="text-xs text-slate-400 mb-2">Shareable deck — safe to send to prospective investors. Recipients enter their name and email before viewing; links expire 4 weeks after they&apos;re sent.</p>

      {deckPath && deckName ? (
        <>
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-200 bg-white group">
            <FileText className="w-4 h-4 shrink-0" style={isPdf ? { color: '#e98925' } : { color: '#94a3b8' }} />
            <div className="flex-1 min-w-0">
              {isPdf ? (
                <button onClick={() => setViewing(true)} className="text-sm font-medium text-slate-700 truncate block text-left hover:text-slate-900 hover:underline" title="View deck">
                  {deckName}
                </button>
              ) : (
                <p className="text-sm font-medium text-slate-700 truncate">{deckName}</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {buildEmail && (
                <button onClick={handleEmail} disabled={emailing} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-50" title="Draft investor email with deck link">
                  {emailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
                </button>
              )}
              {isPdf && (
                <button onClick={() => setViewing(true)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="View deck">
                  <Eye className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={handleDownload} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="Download">
                <Download className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => inputRef.current?.click()} disabled={uploading} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-50" title="Replace deck">
                {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              </button>
              <button onClick={handleRemove} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Remove deck">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Share-link status */}
          {deckSharedAt && (
            <p className={`text-xs mt-1.5 ${linkExpired ? 'text-orange-600' : 'text-slate-400'}`}>
              {linkExpired ? 'Share link expired — click the mail icon to send a fresh 4-week link.' : `Share link active until ${expiryDate}.`}
            </p>
          )}

          {/* Viewer tracker */}
          <button
            onClick={() => setShowViews((v) => !v)}
            className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 hover:text-slate-700 transition"
          >
            {showViews ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <Users className="w-3.5 h-3.5" />
            {views.length === 0 ? 'No views yet' : `Viewed ${views.length} ${views.length === 1 ? 'time' : 'times'}`}
          </button>
          {showViews && views.length > 0 && (
            <div className="mt-2 border border-slate-100 rounded-lg divide-y divide-slate-50 overflow-hidden">
              {views.map((v) => (
                <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-700 truncate">{v.viewer_name}</p>
                    {v.viewer_email && (
                      <a href={`mailto:${v.viewer_email}`} className="text-xs text-blue-600 hover:underline truncate block">{v.viewer_email}</a>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{formatDate(v.viewed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition group ${isDragging ? 'border-slate-500 bg-slate-100' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'}`}
        >
          <Upload className="w-5 h-5 text-slate-400 group-hover:text-slate-600 mx-auto mb-1.5 transition" />
          <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">Click to upload</span> or drag and drop</p>
          {uploading && (
            <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
            </div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" className="hidden" onChange={handleInput} />
      {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mt-2">{error}</p>}

      {viewing && deckFile && <PdfViewer file={deckFile} onClose={() => setViewing(false)} />}
    </div>
  )
}
