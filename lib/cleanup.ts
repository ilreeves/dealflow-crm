import { SupabaseClient } from '@supabase/supabase-js'
import { logError } from '@/lib/log'

// Deleting a deal or portfolio company cascades its OWN child rows, but two
// kinds of artifacts survive and have to be cleaned up by hand:
//
//  1. Storage objects — deal_files / meeting_files / portfolio_files /
//     company_decks rows cascade, but the bytes they point at don't.
//  2. Polymorphic rows — company_decks, company_enrichment and
//     company_competitors key on (entity_type, entity_id) with no FK, so they
//     orphan. company_decks is the one that matters: an orphaned row keeps a
//     PUBLIC share link alive (the deck route also checks the parent now, but
//     the row shouldn't exist at all).
//
// Usage: gather BEFORE deleting the parent (the cascade destroys the pointers),
// finish AFTER the delete succeeds. Cleanup failures are logged, not surfaced —
// the parent is already gone, so there's nothing actionable for the user.

type EntityType = 'deal' | 'portfolio'

export async function gatherEntityCleanup(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
): Promise<string[]> {
  const paths: string[] = []
  const collect = (rows: { storage_path: string | null }[] | null) => {
    for (const r of rows ?? []) if (r.storage_path) paths.push(r.storage_path)
  }

  if (entityType === 'deal') {
    const [files, meetings] = await Promise.all([
      supabase.from('deal_files').select('storage_path').eq('deal_id', entityId),
      supabase.from('deal_meetings').select('id').eq('deal_id', entityId),
    ])
    collect(files.data)
    const meetingIds = (meetings.data ?? []).map((m: { id: string }) => m.id)
    if (meetingIds.length) {
      const mf = await supabase.from('meeting_files').select('storage_path').in('meeting_id', meetingIds)
      collect(mf.data)
    }
  } else {
    const files = await supabase.from('portfolio_files').select('storage_path').eq('company_id', entityId)
    collect(files.data)
  }

  const decks = await supabase
    .from('company_decks')
    .select('storage_path')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  collect(decks.data)

  return paths
}

export async function finishEntityCleanup(
  supabase: SupabaseClient,
  entityType: EntityType,
  entityId: string,
  paths: string[],
): Promise<void> {
  // Deleting the company_decks rows is what actually kills the share links.
  for (const table of ['company_decks', 'company_enrichment', 'company_competitors']) {
    const { error } = await supabase.from(table).delete().eq('entity_type', entityType).eq('entity_id', entityId)
    if (error) logError('cleanup', `${table} delete failed for ${entityType} ${entityId}: ${error.message}`)
  }

  if (paths.length) {
    // Storage remove() takes a list; chunk defensively for large file sets.
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from('deal-files').remove(paths.slice(i, i + 100))
      if (error) logError('cleanup', `storage remove failed for ${entityType} ${entityId}: ${error.message}`)
    }
  }
}
