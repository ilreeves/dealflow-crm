"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, Maximize2, Loader2 } from "lucide-react"
import { DealFile } from "@/lib/types"
import { createClient } from "@/lib/supabase/client"

interface Props {
  file: DealFile
  onClose: () => void
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any

export default function PdfViewer({ file, onClose }: Props) {
  const supabase = createClient()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const docRef = useRef<PdfDoc | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingTaskRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null)
  const signedUrlRef = useRef<string | null>(null)

  const [numPages, setNumPages] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Load the document once
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError("")
      try {
        const { data, error: urlErr } = await supabase.storage
          .from("deal-files")
          .createSignedUrl(file.storage_path, 300)
        if (urlErr || !data?.signedUrl) throw new Error(urlErr?.message || "Could not load file")
        signedUrlRef.current = data.signedUrl

        const pdfjs = await import("pdfjs-dist")
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString()

        const loadingTask = pdfjs.getDocument({ url: data.signedUrl })
        loadingTaskRef.current = loadingTask
        const doc: PdfDoc = await loadingTask.promise
        if (cancelled) {
          loadingTask.destroy()
          return
        }
        docRef.current = doc
        setNumPages(doc.numPages)
        setPage(1)
        setLoading(false)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to open PDF")
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch { /* noop */ }
      }
      if (loadingTaskRef.current) {
        try { loadingTaskRef.current.destroy() } catch { /* noop */ }
        loadingTaskRef.current = null
      }
      docRef.current = null
    }
  }, [file.storage_path])

  // Render the current page whenever it changes
  useEffect(() => {
    const doc = docRef.current
    const canvas = canvasRef.current
    if (!doc || !canvas || loading) return

    let cancelled = false

    async function render() {
      if (renderTaskRef.current) {
        try { renderTaskRef.current.cancel() } catch { /* noop */ }
      }
      const pdfPage = await doc.getPage(page)
      if (cancelled) return

      const container = containerRef.current
      const maxWidth = container ? Math.min(container.clientWidth - 48, 1100) : 900
      const baseViewport = pdfPage.getViewport({ scale: 1 })
      const scale = maxWidth / baseViewport.width
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const viewport = pdfPage.getViewport({ scale: scale * dpr })

      const ctx = canvas!.getContext("2d")
      if (!ctx) return
      canvas!.width = viewport.width
      canvas!.height = viewport.height
      canvas!.style.width = `${viewport.width / dpr}px`
      canvas!.style.height = `${viewport.height / dpr}px`

      const task = pdfPage.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch { /* cancelled render */ }
    }

    render()
    return () => { cancelled = true }
  }, [page, loading, numPages])

  const goTo = useCallback((n: number) => {
    setPage((p) => {
      const next = Math.min(Math.max(n, 1), numPages || 1)
      return next
    })
  }, [numPages])

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(page + 1)
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(page - 1)
      else if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [page, goTo, onClose])

  async function handleDownload() {
    const url = signedUrlRef.current
    if (!url) return
    const a = document.createElement("a")
    a.href = url
    a.download = file.name
    a.click()
  }

  function handleFullscreen() {
    const el = containerRef.current
    if (!el) return
    if (document.fullscreenElement) document.exitFullscreen()
    else el.requestFullscreen?.()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div
        ref={containerRef}
        className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span
              className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
              style={{ backgroundColor: "#023a51" }}
            >
              <ExternalLink className="w-3.5 h-3.5 text-white" />
            </span>
            <p className="text-sm font-medium text-slate-800 truncate">{file.name}</p>
          </div>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition"
            title="Download"
          >
            <Download className="w-3.5 h-3.5" /> Download
          </button>
          <button
            onClick={handleFullscreen}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 border border-slate-200 hover:border-slate-300 rounded-lg px-2.5 py-1.5 transition"
            title="Fullscreen"
          >
            <Maximize2 className="w-3.5 h-3.5" /> Fullscreen
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition ml-1"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Slide stage */}
        <div className="relative flex-1 min-h-0 flex items-center justify-center" style={{ backgroundColor: "#1c2b31" }}>
          {loading ? (
            <div className="flex flex-col items-center gap-2 text-slate-300">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-xs">Loading deck…</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-slate-200 px-6 text-center">
              <p className="text-sm">{error}</p>
              <button onClick={handleDownload} className="text-xs underline text-slate-300 hover:text-white">
                Download the file instead
              </button>
            </div>
          ) : (
            <div className="overflow-auto max-h-full max-w-full p-6 flex items-center justify-center">
              <canvas ref={canvasRef} className="rounded-lg shadow-lg bg-white" />
            </div>
          )}

          {/* Nav controls */}
          {!loading && !error && numPages > 0 && (
            <div className="absolute left-4 right-4 bottom-4 flex items-center gap-3">
              <button
                onClick={() => goTo(page - 1)}
                disabled={page <= 1}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white transition disabled:opacity-30"
                style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                title="Previous"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex-1 h-[3px] rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                <div
                  className="h-full transition-all"
                  style={{ width: `${(page / numPages) * 100}%`, backgroundColor: "#5ba200" }}
                />
              </div>
              <span className="text-xs text-white tabular-nums min-w-[52px] text-center">
                {page} / {numPages}
              </span>
              <button
                onClick={() => goTo(page + 1)}
                disabled={page >= numPages}
                className="w-8 h-8 rounded-full flex items-center justify-center text-white transition disabled:opacity-30"
                style={{ backgroundColor: "rgba(255,255,255,0.14)" }}
                title="Next"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Thumbnail rail */}
        {!loading && !error && numPages > 1 && (
          <div className="flex gap-2 px-4 py-3 border-t border-slate-100 overflow-x-auto shrink-0">
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
              <Thumb
                key={n}
                docRef={docRef}
                pageNum={n}
                active={n === page}
                onClick={() => goTo(n)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function Thumb({
  docRef,
  pageNum,
  active,
  onClick,
}: {
  docRef: React.MutableRefObject<PdfDoc | null>
  pageNum: number
  active: boolean
  onClick: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [rendered, setRendered] = useState(false)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || rendered) return
    let cancelled = false

    const observer = new IntersectionObserver(async (entries) => {
      if (!entries[0]?.isIntersecting) return
      observer.disconnect()
      const doc = docRef.current
      if (!doc) return
      try {
        const pdfPage = await doc.getPage(pageNum)
        if (cancelled) return
        const base = pdfPage.getViewport({ scale: 1 })
        const scale = 96 / base.width
        const viewport = pdfPage.getViewport({ scale })
        const ctx = canvas.getContext("2d")
        if (!ctx) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        await pdfPage.render({ canvasContext: ctx, viewport }).promise
        if (!cancelled) setRendered(true)
      } catch { /* noop */ }
    })
    observer.observe(canvas)
    return () => { cancelled = true; observer.disconnect() }
  }, [docRef, pageNum, rendered])

  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-md overflow-hidden bg-white transition"
      style={{
        width: 96,
        height: 54,
        border: active ? "2px solid #5ba200" : "2px solid transparent",
        boxShadow: active ? "none" : "0 0 0 1px #e2e8f0",
      }}
      title={`Slide ${pageNum}`}
    >
      <canvas ref={ref} className="w-full h-full object-contain" />
    </button>
  )
}
