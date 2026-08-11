'use client'

import { useState, useRef, useEffect } from 'react'
import { Upload, FileText, Download, Trash2, Eye, Loader2, RefreshCw, Mail, Users, ChevronDown, ChevronRight, Plus, Pencil, Check, X, Link2 } from 'lucide-react'
import { CompanyDeck, DeckView, DealFile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import { isExpired, DECK_LINK_TTL_MS } from '@/lib/deck'
import PdfViewer from '@/components/deals/PdfViewer'

interface Props {
  entityType: 'deal' | 'portfolio'
  entityId: string
  entityName: string
  buildEmail: (deckUrl: string, label: string) => { subject: string; body: string }
}

type RoundOption = { id: string; round_name: string }

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'deck'
}

export default function DecksSection({ entityType, entityId, entityName, buildEmail }: Props) {
  const supabase = createClient()
  const [decks, setDecks] = useState<CompanyDeck[]>([])
  const [rounds, setRounds] = useState<RoundOption[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newRoundId, setNewRoundId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [uploadingNew, setUploadingNew] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const addInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('company_decks').select('*').eq('entity_type', entityType).eq('entity_id', entityId)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      .then(({ data }) => { setDecks((data as CompanyDeck[]) ?? []); setLoading(false) })
  }, [entityType, entityId, supabase])

  // Fundraising rounds a deck can be tied to, so the label follows the round.
  useEffect(() => {
    const table = entityType === 'deal' ? 'deal_fundraise_rounds' : 'portfolio_fundraise_rounds'
    const fk = entityType === 'deal' ? 'deal_id' : 'company_id'
    supabase.from(table).select('id,round_name').eq(fk, entityId)
      .order('date', { ascending: false, nullsFirst: false })
      .then(({ data }) => setRounds((data as RoundOption[]) ?? []))
  }, [entityType, entityId, supabase])

  async function addDeck(file: File) {
    setUploadingNew(true)
    setError('')
    const round = rounds.find((r) => r.id === newRoundId)
    const label = round ? round.round_name : (newLabel.trim() || 'Deck')
    const prefix = entityType === 'deal' ? entityId : `portfolio/${entityId}`
    const storagePath = `${prefix}/noncon-deck/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('deal-files').upload(storagePath, file)
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setUploadingNew(false); return }
    const { data, error: insErr } = await supabase.from('company_decks').insert({
      entity_type: entityType, entity_id: entityId, company_name: entityName,
      label, round_id: round?.id ?? null, storage_path: storagePath, file_name: file.name, sort_order: decks.length,
    }).select().single()
    if (insErr || !data) {
      // Roll back the uploaded file so we don't leave an orphan in storage.
      await supabase.storage.from('deal-files').remove([storagePath])
      setError(`Could not save deck: ${insErr?.message ?? 'insert failed'}`)
      setUploadingNew(false)
      return
    }
    setDecks((prev) => [...prev, data as CompanyDeck]); setNewLabel(''); setNewRoundId(''); setAdding(false)
    setUploadingNew(false)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Non-Confidential Decks</p>
        {!adding && (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition">
            <Plus className="w-3.5 h-3.5" /> Add deck
          </button>
        )}
      </div>
      <p className="text-xs text-slate-400 mb-2">One deck per raise — each gets its own share link (name/email gate, 4-week expiry) and view tracker.</p>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-slate-400" /></div>
      ) : (
        <div className="space-y-2">
          {decks.map((deck) => (
            <DeckItem
              key={deck.id}
              deck={deck}
              rounds={rounds}
              entityName={entityName}
              buildEmail={buildEmail}
              onUpdated={(d) => setDecks((prev) => prev.map((x) => (x.id === d.id ? d : x)))}
              onDeleted={(id) => setDecks((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
          {decks.length === 0 && !adding && (
            <p className="text-sm text-slate-400 py-2">No decks yet.</p>
          )}
        </div>
      )}

      {adding && (
        <div
          className="border border-slate-200 rounded-xl p-4 mt-2 space-y-3 bg-slate-50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => e.preventDefault()}
        >
          <div>
            <label className="block text-xs text-slate-500 mb-1">Round</label>
            <select
              autoFocus
              value={newRoundId}
              onChange={(e) => setNewRoundId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              <option value="">Custom label…</option>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.round_name}</option>)}
            </select>
            {newRoundId === '' && (
              <input
                placeholder="e.g. Series C"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                className="w-full mt-2 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
            )}
            <p className="text-xs text-slate-400 mt-1">
              {rounds.length === 0
                ? 'No fundraising rounds yet — add one in the Fundraising tab to link this deck to it.'
                : 'Linking to a round keeps the label in sync if the round is renamed.'}
            </p>
          </div>
          <div
            onClick={() => addInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={(e) => { e.preventDefault(); setDragging(false) }}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) addDeck(f) }}
            className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition group ${dragging ? 'border-slate-500 bg-white' : 'border-slate-200 hover:border-slate-400 hover:bg-white'}`}
          >
            <Upload className="w-5 h-5 text-slate-400 group-hover:text-slate-600 mx-auto mb-1.5 transition" />
            <p className="text-sm text-slate-500"><span className="font-medium text-slate-700">Click to choose</span> or drag a file here to upload as this deck</p>
            {uploadingNew && <div className="flex items-center justify-center gap-2 mt-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</div>}
          </div>
          <input ref={addInputRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addDeck(f); if (addInputRef.current) addInputRef.current.value = '' }} />
          {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div className="flex justify-end">
            <button onClick={() => { setAdding(false); setNewLabel(''); setNewRoundId(''); setError('') }} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function DeckItem({ deck, rounds, entityName, buildEmail, onUpdated, onDeleted }: {
  deck: CompanyDeck
  rounds: RoundOption[]
  entityName: string
  buildEmail: (deckUrl: string, label: string) => { subject: string; body: string }
  onUpdated: (d: CompanyDeck) => void
  onDeleted: (id: string) => void
}) {
  const supabase = createClient()
  const [viewing, setViewing] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(deck.label)
  const [roundDraft, setRoundDraft] = useState(deck.round_id ?? '')
  const [loadedViews, setLoadedViews] = useState<{ token: string; rows: DeckView[] } | null>(null)
  const [showViews, setShowViews] = useState(false)
  const [rowError, setRowError] = useState('')
  const replaceRef = useRef<HTMLInputElement>(null)

  // A linked round's name always wins over the stored label, so renaming the
  // round updates the deck badge, share slug, and share email. The label is the
  // fallback for unlinked decks (or if the round was deleted).
  const linkedRound = rounds.find((r) => r.id === deck.round_id)
  const displayLabel = linkedRound?.round_name ?? deck.label

  const isPdf = deck.file_name.toLowerCase().endsWith('.pdf')
  const linkExpired = isExpired(deck.shared_at)
  const expiryDate = deck.shared_at ? formatDate(new Date(new Date(deck.shared_at).getTime() + DECK_LINK_TTL_MS).toISOString()) : null

  // Tagged with the token they belong to, so a deck without a share link — or one
  // whose link was just regenerated — reads as zero views without an effect that
  // clears state synchronously.
  const views = loadedViews?.token === deck.token ? loadedViews.rows : []

  useEffect(() => {
    const token = deck.token
    if (!token) return
    let cancelled = false
    supabase.from('deck_views').select('*').eq('token', token).order('viewed_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setLoadedViews({ token, rows: (data as DeckView[]) ?? [] }) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck.token])

  async function handleDownload() {
    const { data } = await supabase.storage.from('deal-files').createSignedUrl(deck.storage_path, 60)
    if (data?.signedUrl) { const a = document.createElement('a'); a.href = data.signedUrl; a.download = deck.file_name; a.click() }
  }

  async function handleReplace(file: File) {
    setReplacing(true)
    setRowError('')
    const prefix = deck.entity_type === 'deal' ? deck.entity_id : `portfolio/${deck.entity_id}`
    const storagePath = `${prefix}/noncon-deck/${Date.now()}-${file.name}`
    const { error: upErr } = await supabase.storage.from('deal-files').upload(storagePath, file)
    if (upErr) { setRowError(`Upload failed: ${upErr.message}`); setReplacing(false); return }
    const previous = deck.storage_path
    const { data, error: updErr } = await supabase.from('company_decks').update({ storage_path: storagePath, file_name: file.name }).eq('id', deck.id).select().single()
    if (updErr || !data) {
      // DB update failed — roll back the new upload and keep the old file intact.
      await supabase.storage.from('deal-files').remove([storagePath])
      setRowError(`Replace failed: ${updErr?.message ?? 'could not update deck'}`)
      setReplacing(false)
      return
    }
    // Only remove the previous file once the row is confirmed to point at the new one.
    if (previous && previous !== storagePath) await supabase.storage.from('deal-files').remove([previous])
    onUpdated(data as CompanyDeck)
    setReplacing(false)
  }

  // Unguessable share token: a readable prefix (nice for recipients) plus a
  // 128-bit crypto-random suffix so tokens can't be enumerated by guessing
  // company/round names. Generated once per deck, then reused.
  function makeToken(): string {
    const suffix = crypto.randomUUID().replace(/-/g, '')
    return `${slugify(`${entityName} ${displayLabel}`)}-${suffix}`
  }

  async function handleEmail() {
    setEmailing(true)
    setRowError('')
    const token = deck.token ?? makeToken()
    const now = new Date().toISOString()
    const { data, error: updErr } = await supabase.from('company_decks').update({ token, shared_at: now }).eq('id', deck.id).select().single()
    if (updErr || !data) {
      // Don't open a mail draft with a link that was never persisted.
      setRowError(`Could not create share link: ${updErr?.message ?? 'update failed'}`)
      setEmailing(false)
      return
    }
    onUpdated(data as CompanyDeck)
    const shareUrl = `${window.location.origin}/deck/${token}`
    const { subject, body } = buildEmail(shareUrl, displayLabel)
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    setEmailing(false)
  }

  async function saveLabel() {
    const round = rounds.find((r) => r.id === roundDraft)
    // Store the round's name as the label too, so it still reads sensibly if the
    // round is later deleted.
    const label = round ? round.round_name : (labelDraft.trim() || 'Deck')
    const { data, error: updErr } = await supabase.from('company_decks')
      .update({ label, round_id: round?.id ?? null }).eq('id', deck.id).select().single()
    if (updErr || !data) { setRowError(`Rename failed: ${updErr?.message ?? 'update failed'}`); return }
    onUpdated(data as CompanyDeck)
    setEditingLabel(false)
  }

  async function handleRemove() {
    setRowError('')
    // Delete the row first; only remove the file once the row is gone, so a
    // failed delete never leaves a live row pointing at a missing file.
    const { error: delErr } = await supabase.from('company_decks').delete().eq('id', deck.id)
    if (delErr) { setRowError(`Remove failed: ${delErr.message}`); return }
    await supabase.storage.from('deal-files').remove([deck.storage_path])
    onDeleted(deck.id)
  }

  const deckFile = { id: deck.id, name: deck.file_name, storage_path: deck.storage_path, size: null, mime_type: null, deal_id: '', uploaded_by: null, created_at: '' } as unknown as DealFile

  return (
    <div className="border border-slate-200 rounded-xl px-3 py-2.5 bg-white">
      {/* Label row */}
      <div className="flex items-center gap-2 mb-1.5">
        {editingLabel ? (
          <>
            <select
              autoFocus
              value={roundDraft}
              onChange={(e) => setRoundDraft(e.target.value)}
              className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            >
              <option value="">Custom label…</option>
              {rounds.map((r) => <option key={r.id} value={r.id}>{r.round_name}</option>)}
            </select>
            {roundDraft === '' && (
              <input
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') saveLabel(); if (e.key === 'Escape') { setLabelDraft(deck.label); setRoundDraft(deck.round_id ?? ''); setEditingLabel(false) } }}
                placeholder="Label"
                className="flex-1 min-w-0 px-2 py-1 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            )}
            <button onClick={saveLabel} className="p-1 text-green-600 hover:bg-green-50 rounded transition"><Check className="w-3.5 h-3.5" /></button>
            <button onClick={() => { setLabelDraft(deck.label); setRoundDraft(deck.round_id ?? ''); setEditingLabel(false) }} className="p-1 text-slate-400 hover:bg-slate-100 rounded transition"><X className="w-3.5 h-3.5" /></button>
          </>
        ) : (
          <>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: '#eaf3e0', color: '#3d6b00' }}>{displayLabel}</span>
            {linkedRound && (
              <span title="Linked to fundraising round" className="flex items-center">
                <Link2 className="w-3 h-3 text-slate-300" />
              </span>
            )}
            <button onClick={() => setEditingLabel(true)} className="p-1 text-slate-300 hover:text-slate-600 transition" title="Change round / label"><Pencil className="w-3 h-3" /></button>
          </>
        )}
      </div>

      {/* File + controls */}
      <div className="flex items-center gap-3">
        <FileText className="w-4 h-4 shrink-0" style={isPdf ? { color: '#e98925' } : { color: '#94a3b8' }} />
        <div className="flex-1 min-w-0">
          {isPdf ? (
            <button onClick={() => setViewing(true)} className="text-sm font-medium text-slate-700 truncate block text-left hover:text-slate-900 hover:underline" title="View deck">{deck.file_name}</button>
          ) : (
            <p className="text-sm font-medium text-slate-700 truncate">{deck.file_name}</p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleEmail} disabled={emailing} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-50" title="Draft investor email with deck link">
            {emailing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
          </button>
          {isPdf && (
            <button onClick={() => setViewing(true)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="View deck"><Eye className="w-3.5 h-3.5" /></button>
          )}
          <button onClick={handleDownload} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition" title="Download"><Download className="w-3.5 h-3.5" /></button>
          <button onClick={() => replaceRef.current?.click()} disabled={replacing} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition disabled:opacity-50" title="Replace file">
            {replacing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </button>
          <button onClick={handleRemove} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Remove deck"><Trash2 className="w-3.5 h-3.5" /></button>
        </div>
        <input ref={replaceRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleReplace(f); if (replaceRef.current) replaceRef.current.value = '' }} />
      </div>

      {rowError && <p className="text-xs text-red-600 mt-1.5">{rowError}</p>}

      {/* Share-link status */}
      {deck.shared_at && (
        <p className={`text-xs mt-1.5 ${linkExpired ? 'text-orange-600' : 'text-slate-400'}`}>
          {linkExpired ? 'Share link expired — click the mail icon to send a fresh 4-week link.' : `Share link active until ${expiryDate}.`}
        </p>
      )}

      {/* Viewer tracker */}
      <button onClick={() => setShowViews((v) => !v)} className="flex items-center gap-1.5 mt-1.5 text-xs text-slate-500 hover:text-slate-700 transition">
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
                {v.viewer_email && <a href={`mailto:${v.viewer_email}`} className="text-xs text-blue-600 hover:underline truncate block">{v.viewer_email}</a>}
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap shrink-0">{formatDate(v.viewed_at)}</span>
            </div>
          ))}
        </div>
      )}

      {viewing && <PdfViewer file={deckFile} onClose={() => setViewing(false)} />}
    </div>
  )
}
