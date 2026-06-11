'use client'

import { useState } from 'react'

interface Props {
  dealName: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}

export default function PassReasonModal({ dealName, onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState('')

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-1">Why are we passing?</h3>
        <p className="text-sm text-slate-500 mb-4">
          Add a quick note on why <strong>{dealName}</strong> is a pass — future you will thank you.
        </p>
        <textarea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Too early, valuation too high, outside our thesis…"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-slate-600 hover:text-slate-900 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition"
            style={{ backgroundColor: '#023a51' }}
          >
            Pass Deal
          </button>
        </div>
      </div>
    </div>
  )
}
