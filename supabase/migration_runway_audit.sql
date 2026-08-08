-- Audit trail on portfolio_cash edits (August 2026)
--
-- WHY: a Basking cash figure changed from $33,200,000 to $32,000,000 and nobody
-- could say who did it. The row was the only one of 38 whose created_at and
-- updated_at differed, which identified it as an edit through the app — but that
-- was the ONLY thing recoverable. `created_by` is NULL on every row (rows loaded
-- over the REST API never set it) and there was no `updated_by` column at all,
-- while RLS deliberately lets any authenticated user write everything.
--
-- For financial figures that several people can hand-edit, "someone changed this
-- eleven hours ago" is not an audit trail. This adds the missing column; the
-- editor in components/portfolio/RunwayTab.tsx now stamps both.
--
-- Safe to run in a fresh Supabase SQL Editor tab. Idempotent.

ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN portfolio_cash.created_by IS
  'Who first entered the row. NULL for rows bulk-loaded over the REST API from board decks.';
COMMENT ON COLUMN portfolio_cash.updated_by IS
  'Who last edited the row through the app. NULL means never edited since creation.';

-- Finding "who touched this and when" is the whole point, so make that query cheap.
CREATE INDEX IF NOT EXISTS portfolio_cash_updated_idx ON portfolio_cash (updated_at DESC);
