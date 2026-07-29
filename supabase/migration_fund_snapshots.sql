-- Semi-annual fund valuation snapshots (July 2026)
-- Positions hold only the CURRENT mark, so a point-in-time series is needed to
-- graph performance over time. One row per (date, fund, company) taken from the
-- audited valuation files; updated twice a year (June 30 / December 31).
-- company_name is stored as text on purpose — a snapshot is a historical record
-- and must survive company renames, deletions, or companies never in the CRM.
-- Safe to run in a fresh Supabase SQL Editor tab.
CREATE TABLE IF NOT EXISTS fund_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  as_of_date DATE NOT NULL,
  fund TEXT NOT NULL,
  company_name TEXT NOT NULL,
  invested NUMERIC,
  value NUMERIC,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (as_of_date, fund, company_name)
);
ALTER TABLE fund_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage fund_snapshots" ON fund_snapshots;
CREATE POLICY "Auth users can manage fund_snapshots" ON fund_snapshots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS fund_snapshots_fund_date_idx ON fund_snapshots (fund, as_of_date);
