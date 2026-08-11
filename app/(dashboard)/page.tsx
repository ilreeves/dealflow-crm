import { createClient } from '@/lib/supabase/server'
import PipelineBoard from '@/components/pipeline/PipelineBoard'
import { Deal } from '@/lib/types'
import { rowsOrThrow } from '@/lib/supabase/unwrap'

// Everything the board, table, needs-attention strip, and card render — but
// NOT the heavy columns (description, custom_fields, founders, links, research
// identifiers). Those ship only when a deal is opened: DealDetailModal
// refetches the full row on mount. Keep this list in sync with what the
// pipeline components actually display.
const BOARD_COLUMNS =
  'id,name,stage,sector,category,series,clinical_stage,lead_partner,source,check_size,' +
  'current_fundraise,current_valuation,created_at,stage_entered_at,pass_reason,passed_at'

export default async function PipelinePage() {
  const supabase = await createClient()

  const since = new Date(new Date().getTime() - 14 * 86_400_000).toISOString()
  const [res, viewsRes] = await Promise.all([
    supabase.from('deals').select(BOARD_COLUMNS).order('created_at', { ascending: false }),
    // The digest is auxiliary — coalesced rather than thrown so a hiccup here
    // can't take the whole pipeline down with it.
    supabase
      .from('deck_views')
      .select('id,token,company_name,viewer_name,viewer_email,viewed_at')
      .gte('viewed_at', since)
      .order('viewed_at', { ascending: false })
      .limit(20),
  ])

  const deals = rowsOrThrow(res as { data: Deal[] | null; error: { message: string } | null }, 'the pipeline')

  const viewRows = (viewsRes.data ?? []) as {
    id: string; token: string; company_name: string | null
    viewer_name: string | null; viewer_email: string | null; viewed_at: string
  }[]
  // Attach each view's deck label (a company can have several decks out).
  const tokens = Array.from(new Set(viewRows.map((v) => v.token)))
  const labelByToken = new Map<string, string>()
  if (tokens.length) {
    const { data: decks } = await supabase.from('company_decks').select('token,label').in('token', tokens)
    for (const d of (decks ?? []) as { token: string | null; label: string | null }[]) {
      if (d.token && d.label) labelByToken.set(d.token, d.label)
    }
  }
  const deckViews = viewRows.map((v) => ({
    id: v.id,
    company_name: v.company_name,
    deck_label: labelByToken.get(v.token) ?? null,
    viewer_name: v.viewer_name,
    viewer_email: v.viewer_email,
    viewed_at: v.viewed_at,
  }))

  return <PipelineBoard initialDeals={deals} deckViews={deckViews} />
}
