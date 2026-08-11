import { createClient } from '@/lib/supabase/client'

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
  if (error) console.error('deal_activity insert failed:', error.message)
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
  if (error) console.error('catalyst_activity insert failed:', error.message)
}
