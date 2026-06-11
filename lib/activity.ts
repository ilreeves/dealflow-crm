import { createClient } from '@/lib/supabase/client'

export async function logActivity(
  dealId: string,
  dealName: string,
  action: string,
  details?: string,
  actorName?: string | null
) {
  const supabase = createClient()
  await supabase.from('deal_activity').insert({
    deal_id: dealId,
    deal_name: dealName,
    action,
    details: details ?? null,
    actor_name: actorName ?? null,
  })
}
