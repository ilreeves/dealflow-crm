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

export async function logCatalystActivity(
  companyName: string,
  catalystTitle: string,
  action: string,
  details?: string | null
) {
  const supabase = createClient()
  await supabase.from('catalyst_activity').insert({
    company_name: companyName,
    catalyst_title: catalystTitle,
    action,
    details: details ?? null,
  })
}
