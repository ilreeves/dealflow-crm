'use client'

import { useState, useEffect } from 'react'
import { Send, Pencil, Trash2, Check, X, Loader2 } from 'lucide-react'
import { DealNote } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

interface Props {
  dealId: string
}

export default function NotesList({ dealId }: Props) {
  const [notes, setNotes] = useState<DealNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadNotes()
  }, [dealId])

  async function loadNotes() {
    setLoading(true)
    const { data } = await supabase
      .from('deal_notes')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    setNotes((data as DealNote[]) ?? [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSubmitting(true)

    const { data: user } = await supabase.auth.getUser()
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.user?.id)
      .single()

    const { data } = await supabase
      .from('deal_notes')
      .insert({
        deal_id: dealId,
        content: newNote.trim(),
        author_id: user.user?.id,
        author_name: profile?.full_name ?? user.user?.email ?? 'Unknown',
      })
      .select()
      .single()

    if (data) setNotes((prev) => [data as DealNote, ...prev])
    setNewNote('')
    setSubmitting(false)
  }

  async function handleSaveEdit(note: DealNote) {
    if (!editContent.trim()) return
    const { data } = await supabase
      .from('deal_notes')
      .update({ content: editContent.trim() })
      .eq('id', note.id)
      .select()
      .single()
    if (data) setNotes((prev) => prev.map((n) => n.id === note.id ? data as DealNote : n))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    await supabase.from('deal_notes').delete().eq('id', id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="space-y-4">
      {/* New note */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          rows={3}
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note…"
          className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e)
          }}
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !newNote.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 disabled:opacity-40 transition"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {submitting ? 'Saving…' : 'Add Note'}
          </button>
        </div>
      </form>

      {/* Notes list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : notes.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No notes yet</p>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="bg-slate-50 rounded-xl p-3.5 group">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-xs font-medium text-slate-700">{note.author_name ?? 'Unknown'}</span>
                  <span className="text-xs text-slate-400 ml-2">{formatDate(note.created_at)}</span>
                  {note.updated_at !== note.created_at && (
                    <span className="text-xs text-slate-400 ml-1">(edited)</span>
                  )}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  {editingId === note.id ? (
                    <>
                      <button
                        onClick={() => handleSaveEdit(note)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded transition"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setEditingId(null)}
                        className="p-1 text-slate-400 hover:bg-slate-100 rounded transition"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingId(note.id); setEditContent(note.content) }}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-white rounded transition"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(note.id)}
                        className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {editingId === note.id ? (
                <textarea
                  rows={3}
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  autoFocus
                  className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none bg-white"
                />
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
