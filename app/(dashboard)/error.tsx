'use client' // Error boundaries must be Client Components

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

// Catches a thrown server-page error (usually a failed Supabase query — see
// lib/supabase/unwrap.ts) so a transient DB hiccup reads as "couldn't load,
// try again" instead of a page of confident zeros.
export default function DashboardError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertTriangle className="w-8 h-8 text-amber-500 mb-3" />
      <h2 className="text-base font-semibold text-slate-900">Couldn&apos;t load this page</h2>
      <p className="text-sm text-slate-500 mt-1 max-w-md">
        {error.message || 'Something went wrong talking to the database.'}
      </p>
      <button
        onClick={() => unstable_retry()}
        className="mt-5 px-4 py-2 text-sm font-medium text-white rounded-lg transition"
        style={{ backgroundColor: '#023a51' }}
      >
        Try again
      </button>
    </div>
  )
}
