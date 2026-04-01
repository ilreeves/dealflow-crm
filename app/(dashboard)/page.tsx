import { createClient } from '@/lib/supabase/server'
import PipelineBoard from '@/components/pipeline/PipelineBoard'
import { Deal } from '@/lib/types'

export default async function PipelinePage() {
  const supabase = await createClient()

  const { data: deals } = await supabase
    .from('deals')
    .select('*')
    .order('created_at', { ascending: false })

  return <PipelineBoard initialDeals={(deals as Deal[]) ?? []} />
}
