-- Cap table structure (August 2026)
-- Share classes per portfolio company: Common, each preferred series, the
-- option pool — shares outstanding, price, liquidation preference. Structure
-- only, no per-holder ledger. Deliberately STANDALONE from portfolio_positions:
-- positions.ownership_pct stays hand-entered and keeps driving Fund
-- Performance, so a half-filled cap table can never silently move AUM. The tab
-- flags disagreement between the two instead.
-- Safe to run in a fresh Supabase SQL Editor tab.

CREATE TABLE IF NOT EXISTS portfolio_share_classes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  class_type TEXT NOT NULL CHECK (class_type IN ('Common', 'Preferred', 'Option pool', 'Warrants', 'Other')),
  shares_outstanding NUMERIC,
  price_per_share NUMERIC,
  -- Liquidation preference as a multiple (1 = 1×). NULL for common/pool.
  liq_pref_multiple NUMERIC,
  -- Stack rank for the preference waterfall: 1 = most senior. NULL sorts last,
  -- which is where common and the pool belong.
  seniority INTEGER,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portfolio_share_classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_share_classes" ON portfolio_share_classes;
CREATE POLICY "Auth users can manage portfolio_share_classes" ON portfolio_share_classes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS portfolio_share_classes_company_id_idx ON portfolio_share_classes (company_id);

-- A cap table AGES as one document — the classes are re-keyed together from
-- the same source file, so the as-of date lives once on the company, not per row.
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS cap_table_as_of DATE;
