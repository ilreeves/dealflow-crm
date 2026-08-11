-- Files on portfolio companies (August 2026)
--
-- WHY: pipeline deals have had file storage since the beginning (deal_files +
-- components/deals/FileManager.tsx), but portfolio companies never did. A
-- company that closes therefore LOSES the ability to hold a document at exactly
-- the point it starts generating the most of them — board decks, financials,
-- cap tables, consents. Isaiah asked for non-con decks to show up in a
-- company's files and there was no files list on the portfolio side to show
-- them in.
--
-- Deliberately a SECOND TABLE rather than widening deal_files with a nullable
-- company_id. Two nullable FKs where exactly one must be set is a constraint
-- the database cannot express well and every query then has to remember; the
-- shapes are identical, so a second table costs one migration and keeps both
-- sides honestly non-null.
--
-- ⚠️ NOTE WHAT THIS TABLE IS *NOT* FOR. Non-confidential decks live in
-- company_decks and stay there. They are listed in the files UI by reading that
-- table, never by copying a row in here, because a deck carries a public share
-- token an outside investor may be holding: a second row pointing at the same
-- storage object would create a second delete path, and deleting from the files
-- list would silently 404 a live link. One file, one owner, one delete.
--
-- Storage is the existing `deal-files` bucket (private; the app signs URLs on
-- demand). Portfolio objects are already namespaced `portfolio/<id>/…` by the
-- decks code, so this follows the same prefix.
--
-- Safe to run in a fresh Supabase SQL Editor tab. Idempotent.

CREATE TABLE IF NOT EXISTS portfolio_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES portfolio_companies(id) ON DELETE CASCADE,

  -- The name as uploaded, shown in the list. Storage path is timestamped
  -- separately so two uploads of the same filename cannot collide.
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,

  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolio_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_files" ON portfolio_files;
CREATE POLICY "Auth users can manage portfolio_files" ON portfolio_files
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Postgres does not auto-index FK columns; the list query filters and orders on
-- exactly these two.
CREATE INDEX IF NOT EXISTS portfolio_files_company_idx
  ON portfolio_files (company_id, created_at DESC);

COMMENT ON TABLE portfolio_files IS
  'Documents attached to a portfolio company. Mirrors deal_files. Non-con decks '
  'are NOT stored here — they live in company_decks and are listed alongside '
  'these, so a deck keeps a single owner and a single delete path.';
