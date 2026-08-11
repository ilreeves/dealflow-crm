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

  const res = await supabase
    .from('deals')
    .select(BOARD_COLUMNS)
    .order('created_at', { ascending: false })

  const deals = rowsOrThrow(res as { data: Deal[] | null; error: { message: string } | null }, 'the pipeline')

  return <PipelineBoard initialDeals={deals} />
}
