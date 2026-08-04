-- Portfolio company revenue — projected vs actual (August 2026)
--
-- One row per (company, period). A period is a fiscal quarter, half, or full
-- year, and each row carries BOTH the projection and the actual so variance is a
-- single-row subtraction rather than a join between two series.
--
-- period_end is derived from period_type + fiscal_year on save (the same pattern
-- the catalysts table uses) and stored so ordering is done by the database and
-- stays correct across period types. A company on a non-calendar fiscal year can
-- have its period_end adjusted directly without changing the label.
--
-- projected_as_of records WHEN a projection was made, because projections get
-- revised: a plan set 18 months out and one set last month are not equally
-- meaningful, and without the date a stale forecast reads as a current one.
--
-- Safe to run in a fresh Supabase SQL Editor tab.

CREATE TABLE IF NOT EXISTS portfolio_revenue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE,
  -- 'Q1'|'Q2'|'Q3'|'Q4'|'H1'|'H2'|'FY'
  period_type TEXT NOT NULL DEFAULT 'FY',
  fiscal_year INT NOT NULL,
  period_end DATE,
  projected NUMERIC,
  actual NUMERIC,
  -- how the projection was sourced (company plan, board deck, Solas estimate…)
  projected_source TEXT,
  projected_as_of DATE,
  -- how the actual was sourced (audited, management-reported, public filing…)
  actual_source TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, period_type, fiscal_year)
);

ALTER TABLE portfolio_revenue ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_revenue" ON portfolio_revenue;
CREATE POLICY "Auth users can manage portfolio_revenue" ON portfolio_revenue
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS portfolio_revenue_company_idx ON portfolio_revenue (company_id, period_end DESC);
CREATE INDEX IF NOT EXISTS portfolio_revenue_period_idx ON portfolio_revenue (period_end DESC);
