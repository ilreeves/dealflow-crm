'use client'

import { useState, useEffect, useRef } from 'react'
import { Upload, FileText, Download, Trash2, File, Loader2 } from 'lucide-react'
import { DealFile } from '@/lib/types'
import { createClient } from '@/lib/supabase/client'
import { formatBytes, formatDate } from '@/lib/utils'

interface Props {
  dealId: string
}

function fileIcon(mimeType: string | null) {
  return <File className="w-4 h-4 text-slate-400" />
}

export default function FileManager({ dealId }: Props) {
  const [files, setFiles] = useState<DealFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => {
    loadFiles()
  }, [dealId])

  async function loadFiles() {
    setLoading(true)
    const { data } = await supabase
      .from('deal_files')
      .select('*')
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
    setFiles((data as DealFile[]) ?? [])
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? [])
    if (!selectedFiles.length) return

    setUploading(true)
    setError('')

    for (const file of selectedFiles) {
      const path = `${dealId}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage
        .from('deal-files')
        .upload(path, file)

      if (uploadError) {
        setError(`Failed to upload ${file.name}: ${uploadError.message}`)
        continue
      }

      const { data: fileRecord } = await supabase
        .from('deal_files')
        .insert({
          deal_id: dealId,
          name: file.name,
          storage_path: path,
          size: file.size,
          mime_type: file.type || null,
        })
        .select()
        .single()

      if (fileRecord) {
        setFiles((prev) => [fileRecord as DealFile, ...prev])
      }
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleDownload(file: DealFile) {
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

  async function handleDelete(file: DealFile) {
    await supabase.storage.from('deal-files').remove([file.storage_path])
    await supabase.from('deal_files').delete().eq('id', file.id)
    setFiles((prev) => prev.filter((f) => f.id !== file.id))
  }

  return (
    <div className="space-y-4">
      {/* Upload area */}
      <div
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition group"
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
      ) : files.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">No files uploaded yet</p>
      ) : (
        <div className="space-y-1.5">
          {files.map((file) => (
            <div
              key={file.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 group transition"
            >
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                <p className="text-xs text-slate-400">
                  {file.size ? formatBytes(file.size) : ''}{file.size && ' · '}
                  {formatDate(file.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                <button
                  onClick={() => handleDownload(file)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleDelete(file)}
                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                  title="Delete"
                >
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
