import { createClient } from '@/lib/supabase/client'
import { logError } from '@/lib/log'

export async function logActivity(
  dealId: string,
  dealName: string,
  action: string,
  details?: string,
  actorName?: string | null
) {
  const supabase = createClient()
  const { error } = await supabase.from('deal_activity').insert({
    deal_id: dealId,
    deal_name: dealName,
    action,
    details: details ?? null,
    actor_name: actorName ?? null,
  })
  // The activity feed is the only record of who changed what — a broken logger
  // must not look like "nothing happened".
  if (error) logError('activity.logActivity', `insert failed for "${dealName} / ${action}": ${error.message}`)
}

export async function logCatalystActivity(
  companyName: string,
  catalystTitle: string,
  action: string,
  details?: string | null
) {
  const supabase = createClient()
  const { error } = await supabase.from('catalyst_activity').insert({
    company_name: companyName,
    catalyst_title: catalystTitle,
    action,
    details: details ?? null,
  })
  if (error) logError('activity.logCatalystActivity', `insert failed for "${companyName} / ${action}": ${error.message}`)
}
