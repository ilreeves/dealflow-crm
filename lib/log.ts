import { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// Durable error logging. Console output on Vercel evaporates, so failures in
// the fire-and-forget paths (activity logging, delete cleanup, deck serving)
// also land in log_events, which Settings → System Health surfaces.
//
// HARD RULES: never throw, never await-block the caller, never recurse. A
// broken logger that takes the feature down with it is worse than no logger —
// so every failure here degrades to console only, including the table simply
// not existing yet (migration_features_1.sql not run).

const RETENTION_DAYS = 90

export function logError(source: string, message: string, client?: SupabaseClient): void {
  console.error(`[${source}] ${message}`)
  try {
    const supabase = client ?? createClient()
    void supabase
      .from('log_events')
      .insert({ level: 'error', source, message: message.slice(0, 2000) })
      .then(({ error }) => {
        if (error) return // degrade silently — the console.error above already fired
        // Piggyback retention on writes: the log is a diagnostic window, not
        // an archive, and this avoids needing a cron. Best-effort.
        const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString()
        void supabase.from('log_events').delete().lt('created_at', cutoff).then(() => {})
      })
  } catch {
    // e.g. Supabase env missing — the console.error already carried the message
  }
}
