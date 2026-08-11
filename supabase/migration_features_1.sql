-- Features migration (August 2026): pitch tracking, catalyst FK, error log
--
-- Run the whole file in the Supabase SQL Editor. Safe to re-run.

-- ============================================================
-- 1. Pitch tracking: inbound flag on deals
-- ============================================================
-- Replaces the manual monthly inbound-pitch count. NULL means "not yet
-- classified" (every pre-existing deal), so the analytics section can show
-- an unclassified count rather than silently treating old deals as outbound.

ALTER TABLE deals ADD COLUMN IF NOT EXISTS inbound BOOLEAN;

-- ============================================================
-- 2. Catalysts get a real link to their portfolio company
-- ============================================================
-- catalysts joined to companies by NAME only; the rename path now keeps the
-- names in sync, but this makes the link structural. Nullable: catalysts on
-- pipeline deals (and legacy names) have no portfolio company to point at —
-- for those, company_name remains the only key, which is fine because deals
-- are never renamed in place the way portfolio companies are.

ALTER TABLE catalysts ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES portfolio_companies(id) ON DELETE SET NULL;

UPDATE catalysts c SET company_id = p.id
FROM portfolio_companies p
WHERE c.company_id IS NULL AND c.company_name = p.name;

CREATE INDEX IF NOT EXISTS catalysts_company_id_idx ON catalysts (company_id) WHERE company_id IS NOT NULL;

-- ============================================================
-- 3. Durable error log
-- ============================================================
-- Console errors on Vercel evaporate. Failures in the fire-and-forget paths
-- (activity logging, delete cleanup, deck serving) now also land here, and
-- Settings shows the recent ones. Writes come from both the browser client
-- (authenticated) and the deck route (service role).

CREATE TABLE IF NOT EXISTS log_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error', 'warn', 'info')),
  -- Where it happened, e.g. 'activity.logActivity' or 'api/deck'.
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE log_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can manage log_events" ON log_events;
CREATE POLICY "Auth users can manage log_events" ON log_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS log_events_created_idx ON log_events (created_at DESC);

-- Self-pruning: the log is a diagnostic window, not an archive. Each insert
-- from the app also fires a best-effort cleanup of rows older than 90 days
-- (see lib/log.ts), so no cron is needed.

-- ============================================================
-- 4. Index for the deck-view digest
-- ============================================================
-- The pipeline page now reads the most recent views across ALL tokens;
-- the existing indexes only serve per-token lookups.

CREATE INDEX IF NOT EXISTS deck_views_viewed_at_idx ON deck_views (viewed_at DESC);
