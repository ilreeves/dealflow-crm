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
  // A failed select means the paths it would have returned are lost once the
  // cascade runs — those objects orphan in storage. The callers (deal modal,
  // portfolio detail) don't catch, so throwing here would strand them in their
  // "deleting…" state; instead each failure is logged loudly enough to find
  // the orphans later, and the delete proceeds with whatever was gathered.
  const collect = (
    label: string,
    res: { data: { storage_path: string | null }[] | null; error: { message: string } | null },
  ) => {
    if (res.error) {
      logError('cleanup', `${label} select failed for ${entityType} ${entityId} — its storage objects will be orphaned: ${res.error.message}`, supabase)
    }
    for (const r of res.data ?? []) if (r.storage_path) paths.push(r.storage_path)
  }

  if (entityType === 'deal') {
    const [files, meetings] = await Promise.all([
      supabase.from('deal_files').select('storage_path').eq('deal_id', entityId),
      supabase.from('deal_meetings').select('id').eq('deal_id', entityId),
    ])
    collect('deal_files', files)
    if (meetings.error) {
      logError('cleanup', `deal_meetings select failed for deal ${entityId} — meeting files will be orphaned: ${meetings.error.message}`, supabase)
    }
    const meetingIds = (meetings.data ?? []).map((m: { id: string }) => m.id)
    if (meetingIds.length) {
      const mf = await supabase.from('meeting_files').select('storage_path').in('meeting_id', meetingIds)
      collect('meeting_files', mf)
    }
  } else {
    const files = await supabase.from('portfolio_files').select('storage_path').eq('company_id', entityId)
    collect('portfolio_files', files)
  }

  const decks = await supabase
    .from('company_decks')
    .select('storage_path')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
  collect('company_decks', decks)

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
