// Shared catalyst vocabulary — periods, statuses, and their colours — used by
// the calendar, the gantt, the edit modal, and the portfolio Catalysts tab.
// Each previously kept its own copy, which is how the four drift apart.

export const PERIODS = ['1Q', '2Q', '3Q', '4Q', '1H', '2H', 'FY'] as const

export const STATUSES = ['Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated'] as const

// Badge/pill colours. Failed and Terminated share a shade here — at pill size
// the label carries the distinction.
export const STATUS_COLORS: Record<string, string> = {
  'Pending':    'bg-yellow-100 text-yellow-800',
  'On Track':   'bg-emerald-100 text-emerald-700',
  'Done':       'bg-green-100 text-green-700',
  'Delayed':    'bg-orange-100 text-orange-700',
  'On Hold':    'bg-slate-200 text-slate-600',
  'Failed':     'bg-red-100 text-red-700',
  'Terminated': 'bg-red-100 text-red-700',
}

// Gantt bar fills. Deliberately NOT derived from STATUS_COLORS: a solid bar has
// no label on it, so Terminated gets a darker red than Failed to stay tellable.
export const STATUS_BAR: Record<string, string> = {
  'Pending':    'bg-yellow-400',
  'On Track':   'bg-emerald-500',
  'Done':       'bg-green-500',
  'Delayed':    'bg-orange-500',
  'On Hold':    'bg-slate-400',
  'Failed':     'bg-red-500',
  'Terminated': 'bg-red-700',
}

// Statuses that end a catalyst's life — nothing further is expected of it.
export const CLOSED_STATUSES = ['Done', 'Failed', 'Terminated']

// A missing status has always meant Pending, so it counts as open.
export function isClosed(status: string | null | undefined): boolean {
  return CLOSED_STATUSES.includes(status ?? 'Pending')
}

// End date of each period, for sorting and past-detection. Anything
// unrecognised falls through to year-end, matching FY.
export function periodEnd(period: string, year: number): string {
  switch (period) {
    case '1Q': return `${year}-03-31`
    case '2Q': return `${year}-06-30`
    case '3Q': return `${year}-09-30`
    case '1H': return `${year}-06-30`
    default:   return `${year}-12-31`
  }
}

/**
 * Catalyst deletes are immediate and permanent (the row and its history go),
 * and the delete buttons sit one mis-tap from edit controls in the list, the
 * Gantt bar menu, the edit modal and the company modal — so every path asks.
 * The native dialog is deliberate: it works identically on desktop and touch,
 * and can't be scrolled out of view inside a modal.
 */
export function confirmCatalystDelete(c: { title: string; company_name?: string | null }): boolean {
  const who = c.company_name ? `${c.company_name}: ` : ''
  return window.confirm(`Delete the catalyst "${who}${c.title}"? This can't be undone.`)
}
