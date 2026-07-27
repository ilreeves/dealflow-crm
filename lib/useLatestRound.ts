'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { fmtMoney } from '@/lib/rounds'

export type LatestRound = {
  roundName: string
  securityType: string | null
  fundraise: string | null
  /** Amount + what it is, e.g. "$16.5M Convertible Note" / "$16.5M Series B" */
  raiseSummary: string | null
  valuation: string | null
}

// Reads the most recent fundraising round for a deal or portfolio company so the
// Overview can show structured round figures instead of the free-text fields.
// Returns null when no round is recorded — callers fall back to the manually
// entered current_fundraise / current_valuation values.
export function useLatestRound(
  table: 'deal_fundraise_rounds' | 'portfolio_fundraise_rounds',
  fkColumn: 'deal_id' | 'company_id',
  entityId: string,
): LatestRound | null {
  const [latest, setLatest] = useState<LatestRound | null>(null)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    supabase.from(table).select('*').eq(fkColumn, entityId)
      // nullsFirst:false so an undated round never outranks a dated one
      .order('date', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!active) return
        const r = (data as Record<string, unknown>[] | null)?.[0]
        if (!r) { setLatest(null); return }
        const terms = (r.terms ?? {}) as Record<string, unknown>
        const size = r.round_size as number | null
        const post = r.post_money as number | null
        const pre = r.pre_money as number | null
        const cap = terms.valuation_cap as number | null | undefined
        const valuation =
          post != null ? `${fmtMoney(post)} post-money`
            : pre != null ? `${fmtMoney(pre)} pre-money`
              : cap != null ? `${fmtMoney(Number(cap))} cap`
                : null
        const roundName = String(r.round_name ?? '')
        const securityType = (r.security_type as string | null) ?? null
        const fundraise = size != null ? fmtMoney(size) : null
        // Convertibles read better as "$16.5M Convertible Note"; priced rounds as
        // "$16.5M Series B" (the security type would just say "Priced equity").
        const isConvertible = securityType === 'SAFE' || securityType === 'Convertible note'
        const suffix = isConvertible ? securityType : roundName
        setLatest({
          roundName,
          securityType,
          fundraise,
          raiseSummary: fundraise ? [fundraise, suffix].filter(Boolean).join(' ') : null,
          valuation,
        })
      })
    return () => { active = false }
  }, [table, fkColumn, entityId])

  return latest
}
