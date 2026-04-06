'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, ChevronDown, ChevronRight, Calendar, Users, Send, FileText, Trash2, Download, Upload, Loader2 } from 'lucide-react'
import { DealMeeting, MeetingNote, MeetingFile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

interface Props {
  dealId: string
}

// ─── Add Meeting Form ─────────────────────────────────────────────────────────
function AddMeetingForm({ dealId, onAdded }: { dealId: string; onAdded: (m: DealMeeting) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [attendees, setAttendees] = useState('')
  const [summary, setSummary] = useState('')
  const [saving, setSaving] = useState(false)
  const supabase = createClient()

  async function handleSave() {
    if (!title.trim()) return
    setSaving(true)
    const { data } = await supabase.from('deal_meetings').insert({
      deal_id: dealId,
      title: title.trim(),
      meeting_date: date || null,
      attendees: attendees || null,
      summary: summary || null,
    }).select().single()
    if (data) {
      onAdded(data as DealMeeting)
      setTitle(''); setDate(''); setAttendees(''); setSummary('')
      setOpen(false)
    }
    setSaving(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-sm text-slate-500 hover:border-slate-400 hover:text-slate-700 transition"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Meeting
      </button>
    )
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50">
      <p className="text-sm font-semibold text-slate-700">New Meeting</p>
      <input
        placeholder="Meeting title *"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Attendees</label>
          <input
            placeholder="e.g. Isaiah, Spencer"
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
          />
        </div>
      </div>
      <textarea
        rows={2}
        placeholder="Summary / agenda…"
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none bg-white"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 transition">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
          style={{backgroundColor: '#023a51'}}
        >
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Save Meeting
        </button>
      </div>
    </div>
  )
}

// ─── Meeting Notes ────────────────────────────────────────────────────────────
function MeetingNotes({ meetingId }: { meetingId: string }) {
  const [notes, setNotes] = useState<MeetingNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('meeting_notes').select('*').eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setNotes((data as MeetingNote[]) ?? []); setLoading(false) })
  }, [meetingId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!newNote.trim()) return
    setSubmitting(true)
    const { data: userData } = await supabase.auth.getUser()
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', userData.user?.id).single()
    const { data } = await supabase.from('meeting_notes').insert({
      meeting_id: meetingId,
      content: newNote.trim(),
      author_id: userData.user?.id,
      author_name: profile?.full_name ?? userData.user?.email ?? 'Unknown',
    }).select().single()
    if (data) setNotes((prev) => [data as MeetingNote, ...prev])
    setNewNote('')
    setSubmitting(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('meeting_notes').delete().eq('id', id)
    setNotes((prev) => prev.filter((n) => n.id !== id))
  }

  return (
    <div className="space-y-2.5">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Add a note…"
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
        />
        <button
          type="submit"
          disabled={submitting || !newNote.trim()}
          className="px-3 py-2 bg-slate-900 text-white rounded-lg disabled:opacity-40 transition"
        >
          {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>
      {loading ? (
        <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-400 text-center py-2">No notes yet</p>
      ) : (
        <div className="space-y-1.5">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-lg border border-slate-100 px-3 py-2.5 group flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-slate-700">{note.author_name}</span>
                  <span className="text-xs text-slate-400">{formatDate(note.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.content}</p>
              </div>
              <button
                onClick={() => handleDelete(note.id)}
                className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 rounded transition shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Meeting Files ────────────────────────────────────────────────────────────
function MeetingFiles({ meetingId }: { meetingId: string }) {
  const [files, setFiles] = useState<MeetingFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('meeting_files').select('*').eq('meeting_id', meetingId)
      .order('created_at', { ascending: false })
      .then(({ data }) => { setFiles((data as MeetingFile[]) ?? []); setLoading(false) })
  }, [meetingId])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? [])
    if (!selected.length) return
    setUploading(true)
    for (const file of selected) {
      const path = `meetings/${meetingId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('deal-files').upload(path, file)
      if (uploadError) continue
      const { data } = await supabase.from('meeting_files').insert({
        meeting_id: meetingId,
        name: file.name,
        storage_path: path,
        size: file.size,
        mime_type: file.type || null,
      }).select().single()
      if (data) setFiles((prev) => [data as MeetingFile, ...prev])
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDownload(file: MeetingFile) {
    const { data } = await supabase.storage.from('deal-files').createSignedUrl(file.storage_path, 60)
    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = file.name
      a.click()
    }
  }

  async function handleDelete(file: MeetingFile) {
    await supabase.storage.from('deal-files').remove([file.storage_path])
    await supabase.from('meeting_files').delete().eq('id', file.id)
    setFiles((prev) => prev.filter((f) => f.id !== file.id))
  }

  return (
    <div className="space-y-2">
      <div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-2.5 py-1.5 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 transition bg-white"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          Upload file
        </button>
        <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleUpload} />
      </div>
      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
      ) : files.length === 0 ? (
        <p className="text-xs text-slate-400">No files yet</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div key={file.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 group transition">
              <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="flex-1 text-sm text-slate-700 truncate">{file.name}</span>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button onClick={() => handleDownload(file)} className="p-1 text-slate-400 hover:text-slate-700 rounded transition">
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => handleDelete(file)} className="p-1 text-slate-400 hover:text-red-600 rounded transition">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Meeting Item ─────────────────────────────────────────────────────────────
function MeetingItem({ meeting, onDelete }: { meeting: DealMeeting; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [subTab, setSubTab] = useState<'notes' | 'files'>('notes')
  const [deleting, setDeleting] = useState(false)
  const supabase = createClient()

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    setDeleting(true)
    await supabase.from('deal_meetings').delete().eq('id', meeting.id)
    onDelete(meeting.id)
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 bg-white hover:bg-slate-50 cursor-pointer transition"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{meeting.title}</p>
          <div className="flex items-center gap-3 mt-0.5">
            {meeting.meeting_date && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Calendar className="w-3 h-3" />
                {new Date(meeting.meeting_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            )}
            {meeting.attendees && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="w-3 h-3" />
                {meeting.attendees}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition shrink-0"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 space-y-3">
          {meeting.summary && (
            <p className="text-sm text-slate-600 italic leading-relaxed">{meeting.summary}</p>
          )}
          <div className="flex gap-4 border-b border-slate-200 -mb-0.5">
            {(['notes', 'files'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setSubTab(t)}
                className={`pb-2 text-xs font-medium border-b-2 transition capitalize ${
                  subTab === t
                    ? 'border-slate-800 text-slate-800'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="pt-1">
            {subTab === 'notes' ? <MeetingNotes meetingId={meeting.id} /> : <MeetingFiles meetingId={meeting.id} />}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Export ──────────────────────────────────────────────────────────────
export default function MeetingsList({ dealId }: Props) {
  const [meetings, setMeetings] = useState<DealMeeting[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('deal_meetings').select('*').eq('deal_id', dealId)
      .order('meeting_date', { ascending: false })
      .then(({ data }) => { setMeetings((data as DealMeeting[]) ?? []); setLoading(false) })
  }, [dealId])

  return (
    <div className="space-y-4">
      <AddMeetingForm dealId={dealId} onAdded={(m) => setMeetings((prev) => [m, ...prev])} />
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
        </div>
      ) : meetings.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No meetings recorded yet</p>
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <MeetingItem
              key={m.id}
              meeting={m}
              onDelete={(id) => setMeetings((prev) => prev.filter((x) => x.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}
