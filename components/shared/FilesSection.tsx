'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, FileText, Download, Trash2, Loader2, Eye } from 'lucide-react'
import { StoredFile, CompanyDeck } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatBytes, formatDate } from '@/lib/utils'
import PdfViewer from '@/components/deals/PdfViewer'

// Documents for a deal or a portfolio company, in one component because the two
// are the same list with a different foreign key.
//
// ⚠️ NON-CON DECKS ARE LISTED HERE BUT NOT STORED HERE. Isaiah asked for an
// uploaded deck to show up in the company's files, and the obvious way — write
// a files row pointing at the deck's storage object — is the wrong one: a deck
// carries a public share token an outside investor may be holding, so a second
// row would create a second delete path and let this list silently 404 a live
// link. Decks are read from company_decks instead, shown with a badge, and
// deliberately have no delete button. One file, one owner, one delete.
interface Props {
  entityType: 'deal' | 'portfolio'
  entityId: string
}

/** Which table holds the rows, and under which column, for each side. */
const TABLE = { deal: 'deal_files', portfolio: 'portfolio_files' } as const
const FK = { deal: 'deal_id', portfolio: 'company_id' } as const

function isPdf(f: StoredFile) {
  return f.mime_type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
}

// Timestamped so two uploads of the same filename never collide. Lives at module
// scope: a clock read inside the component body reads as an impure render to the
// React compiler, even though this only ever runs from an upload handler.
//
// The portfolio prefix matches the one DecksSection already uses, so a company's
// objects stay together under one path whichever feature put them there.
function storagePath(entityType: Props['entityType'], entityId: string, fileName: string) {
  const prefix = entityType === 'deal' ? entityId : `portfolio/${entityId}`
  return `${prefix}/${Date.now()}-${fileName}`
}

export default function FilesSection({ entityType, entityId }: Props) {
  const [files, setFiles] = useState<StoredFile[]>([])
  const [decks, setDecks] = useState<StoredFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [viewing, setViewing] = useState<StoredFile | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Derived, not stored — a setLoading(true) inside the effect would force an extra
  // render pass on every mount. Switching deals reads as loading until its rows land.
  const loading = loadedId !== entityId

  useEffect(() => {
    let cancelled = false
    Promise.all([
      supabase.from(TABLE[entityType]).select('*').eq(FK[entityType], entityId)
        .order('created_at', { ascending: false }),
      // Decks are the same entity's documents, just owned by another table.
      supabase.from('company_decks').select('*')
        .eq('entity_type', entityType).eq('entity_id', entityId)
        .order('sort_order', { ascending: true }),
    ]).then(([f, d]) => {
      if (cancelled) return
      setFiles((f.data as StoredFile[]) ?? [])
      setDecks(
        ((d.data as CompanyDeck[]) ?? []).map((deck) => ({
          id: `deck-${deck.id}`,
          name: deck.file_name,
          storage_path: deck.storage_path,
          size: null,               // company_decks doesn't record it
          mime_type: null,
          created_at: deck.created_at,
          deckLabel: deck.label,
        })),
      )
      setLoadedId(entityId)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  // Decks first — they're the document someone is most often looking for, and
  // the one that gets shared outside the firm.
  const shown = [...decks, ...files]

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    await uploadFiles(Array.from(e.target.files ?? []))
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadFiles(selectedFiles: File[]) {
    if (!selectedFiles.length) return

    setUploading(true)
    setError('')

    for (const file of selectedFiles) {
      const path = storagePath(entityType, entityId, file.name)
      const { error: uploadError } = await supabase.storage
        .from('deal-files')
        .upload(path, file)

      if (uploadError) {
        setError(`Failed to upload ${file.name}: ${uploadError.message}`)
        continue
      }

      const { data: fileRecord, error: insertError } = await supabase
        .from(TABLE[entityType])
        .insert({
          [FK[entityType]]: entityId,
          name: file.name,
          storage_path: path,
          size: file.size,
          mime_type: file.type || null,
        })
        .select()
        .single()

      if (insertError || !fileRecord) {
        // Roll back the uploaded object so it isn't orphaned in storage.
        await supabase.storage.from('deal-files').remove([path])
        setError(`Failed to save ${file.name}: ${insertError?.message ?? 'could not create record'}`)
        continue
      }

      setFiles((prev) => [fileRecord as StoredFile, ...prev])
    }

    setUploading(false)
  }

  async function handleDownload(file: StoredFile) {
    const { data } = await supabase.storage
      .from('deal-files')
      .createSignedUrl(file.storage_path, 60)

    if (data?.signedUrl) {
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = file.name
      a.click()
    }
  }

  async function handleDelete(file: StoredFile) {
    setError('')
    // Guarded as well as hidden in the UI: a deck's object is owned by
    // company_decks and removing it here would break its public share link.
    if (file.deckLabel) return
    // Delete the row first; only remove the file once the row is gone, so a
    // failed delete never leaves a live record pointing at a missing file.
    const { error: delError } = await supabase.from(TABLE[entityType]).delete().eq('id', file.id)
    if (delError) { setError(`Failed to delete ${file.name}: ${delError.message}`); return }
    await supabase.storage.from('deal-files').remove([file.storage_path])
    setFiles((prev) => prev.filter((f) => f.id !== file.id))
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          uploadFiles(Array.from(e.dataTransfer.files))
        }}
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition group ${
          isDragging ? 'border-slate-500 bg-slate-100' : 'border-slate-200 hover:border-slate-400 hover:bg-slate-50'
        }`}
      >
        <Upload className="w-6 h-6 text-slate-400 group-hover:text-slate-600 mx-auto mb-2 transition" />
        <p className="text-sm text-slate-500">
          <span className="font-medium text-slate-700">Click to upload</span> or drag and drop
        </p>
        <p className="text-xs text-slate-400 mt-1">Any file type — pitch decks, financials, memos, cap tables</p>
        {uploading && (
          <div className="flex items-center justify-center gap-2 mt-3 text-xs text-slate-500">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Uploading…
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {error && (
        <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
      )}

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : shown.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No files uploaded yet</p>
      ) : (
        <div className="space-y-1.5">
          {shown.map((file) => {
            const pdf = isPdf(file)
            return (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 group transition"
            >
              <FileText className={`w-4 h-4 shrink-0 ${pdf ? '' : 'text-slate-400'}`} style={pdf ? { color: '#e98925' } : undefined} />
              <div className="flex-1 min-w-0">
                {pdf ? (
                  <button
                    onClick={() => setViewing(file)}
                    className="text-sm font-medium text-slate-700 truncate block text-left hover:text-slate-900 hover:underline"
                    title="View deck"
                  >
                    {file.name}
                  </button>
                ) : (
                  <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                )}
                <p className="text-xs text-slate-400">
                  {/* Says where a deck is managed, so its missing delete button
                      reads as deliberate rather than broken. */}
                  {file.deckLabel && (
                    <span className="text-slate-500">Non-con deck · {file.deckLabel} · manage in Overview · </span>
                  )}
                  {file.size ? formatBytes(file.size) : ''}{file.size ? ' · ' : ''}
                  {formatDate(file.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                {pdf && (
                  <button
                    onClick={() => setViewing(file)}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
                    title="View deck"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => handleDownload(file)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {!file.deckLabel && (
                  <button
                    onClick={() => handleDelete(file)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
            )
          })}
        </div>
      )}

      {viewing && <PdfViewer file={viewing} onClose={() => setViewing(null)} />}
    </div>
  )
}
