import { describe, it, expect } from 'vitest'
import {
  AuditEntry, groupEntries, summarise, fieldDiffs, extendOldest, fmtUndoResult, isMissingAudit,
  companyNameFromEntries, touchesCompanyExistence, relativeTime, TRUNCATE_AT, fmtMoney,
} from './auditHistory'

const ME = 'user-a'
const CO = 'co-1'
const T0 = Date.parse('2026-09-22T15:00:00Z')

let nextId = 1
let nextTx = 100
function entry(p: Partial<AuditEntry> & { sec?: number }): AuditEntry {
  const { sec = 0, ...rest } = p
  return {
    id: nextId++,
    table_name: 'portfolio_positions',
    row_id: `row-${nextId}`,
    company_id: CO,
    action: 'UPDATE',
    old_data: {},
    new_data: {},
    changed_by: ME,
    changed_at: new Date(T0 + sec * 1000).toISOString(),
    tx_id: nextTx++,
    ...rest,
  }
}

// The round editor's save: round UPDATE, then positions DELETE, then
// positions INSERT — three requests, three transactions, a second or two apart.
function roundEdit(sec = 0) {
  return [
    entry({ sec, table_name: 'portfolio_fundraise_rounds', row_id: 'r1', action: 'UPDATE', old_data: { id: 'r1', round_name: 'Series Seed', round_size: 5e6 }, new_data: { id: 'r1', round_name: 'Series Seed', round_size: 6e6 } }),
    entry({ sec: sec + 1, action: 'DELETE', row_id: 'p1', old_data: { id: 'p1', fund: 'EHF', invested_amount: 1e6, notes: 'keep me' }, new_data: null }),
    entry({ sec: sec + 1, action: 'DELETE', row_id: 'p2', old_data: { id: 'p2', fund: 'Solas I', invested_amount: 5e5 }, new_data: null }),
    entry({ sec: sec + 2, action: 'INSERT', row_id: 'p3', old_data: null, new_data: { id: 'p3', fund: 'EHF', invested_amount: 1.2e6, created_at: new Date(T0 + (sec + 2) * 1000).toISOString() } }),
    entry({ sec: sec + 2, action: 'INSERT', row_id: 'p4', old_data: null, new_data: { id: 'p4', fund: 'Solas I', invested_amount: 5e5, created_at: new Date(T0 + (sec + 2) * 1000).toISOString() } }),
  ]
}

describe('groupEntries', () => {
  it('folds the round editor’s separate requests into one edit', () => {
    const es = roundEdit()
    // separate transactions per request
    es[1].tx_id = es[2].tx_id
    es[3].tx_id = es[4].tx_id
    const gs = groupEntries(es)
    expect(gs).toHaveLength(1)
    expect(gs[0].ids).toEqual(es.map((e) => e.id))
    expect(gs[0].who).toBe(ME)
    expect(gs[0].company_id).toBe(CO)
    expect(gs[0].started).toBe(es[0].changed_at)
    expect(gs[0].ended).toBe(es[4].changed_at)
  })

  it('splits when the gap to the previous entry exceeds 20 s, and returns newest first', () => {
    const a = entry({ sec: 0 })
    const b = entry({ sec: 15 })
    const c = entry({ sec: 30 }) // 15 s after b — still chained
    const d = entry({ sec: 51 }) // 21 s after c — new edit
    const gs = groupEntries([d, b, a, c])
    expect(gs.map((g) => g.ids)).toEqual([[d.id], [a.id, b.id, c.id]])
  })

  it('splits on a different person or a different company', () => {
    const a = entry({ sec: 0 })
    const b = entry({ sec: 1, changed_by: 'user-b' })
    const c = entry({ sec: 2, changed_by: 'user-b', company_id: 'co-2' })
    const d = entry({ sec: 3, changed_by: 'user-b', company_id: 'co-2' })
    expect(groupEntries([a, b, c, d]).map((g) => g.ids)).toEqual([[c.id, d.id], [b.id], [a.id]])
  })

  it('only groups consecutive entries — someone else in between breaks the chain', () => {
    const a = entry({ sec: 0 })
    const b = entry({ sec: 1, changed_by: 'user-b' })
    const c = entry({ sec: 2 })
    expect(groupEntries([a, b, c])).toHaveLength(3)
  })

  it('keeps an undo made within 20 s as its own edit', () => {
    const edit = entry({ sec: 0, action: 'UPDATE', row_id: 'c1', table_name: 'portfolio_cash', old_data: { id: 'c1', cash_on_hand: 4e6, updated_at: 'x' }, new_data: { id: 'c1', cash_on_hand: 5e6, updated_at: 'y' } })
    const undo = entry({ sec: 5, action: 'UPDATE', row_id: 'c1', table_name: 'portfolio_cash', old_data: { id: 'c1', cash_on_hand: 5e6, updated_at: 'y' }, new_data: { id: 'c1', cash_on_hand: 4e6, updated_at: 'z' } })
    expect(groupEntries([edit, undo]).map((g) => g.ids)).toEqual([[undo.id], [edit.id]])
  })

  it('still merges a second autosave of the same row that is not a reversal', () => {
    const a = entry({ sec: 0, row_id: 'c1', old_data: { cash_on_hand: 4e6 }, new_data: { cash_on_hand: 5e6 } })
    const b = entry({ sec: 3, row_id: 'c1', old_data: { cash_on_hand: 5e6 }, new_data: { cash_on_hand: 5.5e6 } })
    expect(groupEntries([a, b])).toHaveLength(1)
  })
})

describe('extendOldest', () => {
  it('pulls the rest of an edit that straddles the page boundary', () => {
    const older = [entry({ sec: 0 }), entry({ sec: 30 }), entry({ sec: 31 })] // [0] is its own edit
    const page = [entry({ sec: 32 }), entry({ sec: 33 })]
    const r = extendOldest(page, [older[2], older[1], older[0]], false)
    expect(r.rows.map((x) => x.id).sort()).toEqual([older[1].id, older[2].id, page[0].id, page[1].id].sort())
    expect(r.open).toBe(false)
  })

  it('reports the edit as still open when it reaches the end of a full page', () => {
    const older = [entry({ sec: 0 }), entry({ sec: 1 })]
    const page = [entry({ sec: 2 })]
    expect(extendOldest(page, older, true).open).toBe(true)
    expect(extendOldest(page, older, false).open).toBe(false)
  })
})

describe('summarise', () => {
  it('names the round and detects delete + insert as “replaced”', () => {
    const [g] = groupEntries(roundEdit())
    expect(summarise(g)).toBe('Series Seed round edited · 2 positions replaced')
  })

  it('describes a single added position with fund and amount', () => {
    const [g] = groupEntries([entry({ action: 'INSERT', old_data: null, new_data: { fund: 'EHF', invested_amount: 1_750_000 } })])
    expect(summarise(g)).toBe('Position added (EHF, $1.75M)')
  })

  it('leaves over-and-above rows as added / deleted beside the replaced ones', () => {
    const [g] = groupEntries([
      entry({ action: 'DELETE', old_data: { fund: 'EHF' }, new_data: null }),
      entry({ action: 'INSERT', old_data: null, new_data: { fund: 'EHF' } }),
      entry({ action: 'INSERT', old_data: null, new_data: { fund: 'Solas I', invested_amount: 2e5 } }),
    ])
    expect(summarise(g)).toBe('Position replaced (EHF) · Position added (Solas I, $200K)')
  })

  it('collapses a company delete and its cascade', () => {
    const tx = 555
    const es = [
      entry({ tx_id: tx, table_name: 'portfolio_companies', row_id: CO, action: 'DELETE', old_data: { id: CO, name: 'Basking Biosciences' }, new_data: null }),
      ...Array.from({ length: 9 }, () => entry({ tx_id: tx, action: 'DELETE', old_data: { fund: 'EHF' }, new_data: null })),
    ]
    const [g] = groupEntries(es)
    expect(summarise(g)).toBe('Company deleted: Basking Biosciences (and 9 related rows)')
    expect(touchesCompanyExistence(g)).toBe(true)
    expect(companyNameFromEntries(g.entries, CO)).toBe('Basking Biosciences')
  })

  it('calls a re-insert of an old row a restore', () => {
    const [g] = groupEntries([
      entry({ table_name: 'portfolio_companies', row_id: CO, action: 'INSERT', old_data: null, new_data: { id: CO, name: 'Basking', created_at: '2025-01-01T00:00:00Z' } }),
    ])
    expect(summarise(g)).toBe('Company restored: Basking')
  })

  it('dates a cash balance change', () => {
    const [g] = groupEntries([entry({ table_name: 'portfolio_cash', old_data: { as_of: '2026-06-30', cash_on_hand: 4e6 }, new_data: { as_of: '2026-06-30', cash_on_hand: 5e6 } })])
    expect(summarise(g)).toBe('Cash balance Jun 30, 2026 changed')
  })

  it('counts multiple rows of one table', () => {
    const es = Array.from({ length: 3 }, (_, i) => entry({ sec: i, table_name: 'portfolio_cash_forecast', action: 'INSERT', old_data: null, new_data: { period_end: '2027-03-31' } }))
    expect(summarise(groupEntries(es)[0])).toBe('3 cash forecast rows added')
  })

  it('lists the company fields that changed', () => {
    const [g] = groupEntries([entry({ table_name: 'portfolio_companies', row_id: CO, old_data: { name: 'X', funds: ['EHF'], status: 'Active' }, new_data: { name: 'X', funds: ['EHF', 'Solas II'], status: 'Exited' } })])
    expect(summarise(g)).toBe('Company details edited (Status, Funds)')
  })
})

describe('fieldDiffs', () => {
  it('shows only changed fields on an UPDATE, skipping server stamps, with friendly labels and money formatting', () => {
    const d = fieldDiffs(entry({
      old_data: { id: 'p1', invested_amount: 1e6, fair_value: 1e6, lookthrough_of: null, updated_at: 'a', created_by: 'u', notes: 'same' },
      new_data: { id: 'p1', invested_amount: 1_750_000, fair_value: 1e6, lookthrough_of: 'Sower Solas II', updated_at: 'b', created_by: 'v', notes: 'same' },
    }))
    expect(d.map((x) => [x.label, x.before, x.after])).toEqual([
      ['Look-through of', '', 'Sower Solas II'],
      ['Invested', '$1M', '$1.75M'],
    ])
  })

  it('diffs jsonb terms per key', () => {
    const d = fieldDiffs(entry({
      table_name: 'portfolio_fundraise_rounds',
      old_data: { terms: { valuation_cap: 20e6, discount: 20, interest_rate: 8 } },
      new_data: { terms: { valuation_cap: 25e6, discount: 20, interest_rate: '' } },
    }))
    expect(d.map((x) => [x.label, x.before, x.after])).toEqual([
      ['Terms · Valuation cap', '$20M', '$25M'],
      ['Terms · Interest rate %', '8%', ''],
    ])
  })

  it('keeps per-share prices exact and percentages as percentages', () => {
    const d = fieldDiffs(entry({ table_name: 'portfolio_share_classes', old_data: { price_per_share: 0.88, ownership_pct: 4.1 }, new_data: { price_per_share: 0.88002, ownership_pct: 4.25 } }))
    expect(d.find((x) => x.key === 'price_per_share')?.after).toBe('$0.88002')
    expect(d.find((x) => x.key === 'ownership_pct')?.after).toBe('4.25%')
  })

  it('shows exact amounts when two differ below the display precision', () => {
    const d = fieldDiffs(entry({ old_data: { invested_amount: 1_750_000 }, new_data: { invested_amount: 1_751_000 } }))
    expect([d[0].before, d[0].after]).toEqual(['$1,750,000', '$1,751,000'])
  })

  it('lists the key fields of a deleted row, notes included, truncating long text', () => {
    const long = 'x'.repeat(200)
    const d = fieldDiffs(entry({ action: 'DELETE', old_data: { id: 'p1', fund: 'EHF', invested_amount: 1e6, shares: null, notes: long, created_at: 'z' }, new_data: null }))
    expect(d.map((x) => x.label)).toEqual(['Fund', 'Invested', 'Notes'])
    expect(d.every((x) => x.after === null)).toBe(true)
    const notes = d.find((x) => x.key === 'notes')!
    expect(notes.before!.length).toBeLessThanOrEqual(TRUNCATE_AT)
    expect(notes.beforeFull).toBe(long)
  })

  it('lists the key fields of an inserted row as the new side', () => {
    const d = fieldDiffs(entry({ table_name: 'portfolio_cash', action: 'INSERT', old_data: null, new_data: { as_of: '2026-06-30', cash_on_hand: 4.5e6 } }))
    expect(d.map((x) => [x.label, x.before, x.after])).toEqual([['As of', null, 'Jun 30, 2026'], ['Cash', null, '$4.5M']])
  })

  it('does not put a thousands separator in a fiscal year', () => {
    const d = fieldDiffs(entry({ table_name: 'portfolio_revenue', action: 'INSERT', old_data: null, new_data: { period_type: 'FY', fiscal_year: 2026 } }))
    expect(d.find((x) => x.key === 'fiscal_year')?.after).toBe('2026')
  })
})

describe('fmtMoney', () => {
  it('keeps two decimals of millions and promotes units like the app does', () => {
    expect(fmtMoney(1_750_000)).toBe('$1.75M')
    expect(fmtMoney(-4_500_000)).toBe('-$4.5M')
    expect(fmtMoney(999_990)).toBe('$1M')
    expect(fmtMoney(1_119_000_000)).toBe('$1.12B')
    expect(fmtMoney(200_000)).toBe('$200K')
  })
})

describe('fmtUndoResult', () => {
  it('reads like a sentence', () => {
    expect(fmtUndoResult({ restored: 2, removed: 2, reverted: 1 })).toBe('Undone: 2 rows restored, 2 removed, 1 reverted')
    expect(fmtUndoResult({ restored: 0, removed: 0, reverted: 1 })).toBe('Undone: 1 row reverted')
    expect(fmtUndoResult({ restored: 0, removed: 0, reverted: 0 })).toBe('Undone — nothing needed changing.')
  })
})

describe('isMissingAudit', () => {
  it('recognises a missing table or function, and nothing else', () => {
    expect(isMissingAudit({ code: 'PGRST205' })).toBe(true)
    expect(isMissingAudit({ code: '42883' })).toBe(true)
    expect(isMissingAudit({ message: 'Could not find the function public.undo_audit_entries' })).toBe(true)
    expect(isMissingAudit({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingAudit(null)).toBe(false)
  })
})

describe('relativeTime', () => {
  it('buckets recent times and falls back to a date', () => {
    const now = T0
    expect(relativeTime(new Date(now - 10_000).toISOString(), now)).toBe('just now')
    expect(relativeTime(new Date(now - 5 * 60_000).toISOString(), now)).toBe('5 min ago')
    expect(relativeTime(new Date(now - 3 * 3600_000).toISOString(), now)).toBe('3 h ago')
    expect(relativeTime(new Date(now - 30 * 86400_000).toISOString(), now)).toMatch(/2026/)
  })
})
