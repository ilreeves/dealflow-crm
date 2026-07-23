-- Manually-curated known competitors (July 2026)
-- Complements the auto-generated ClinicalTrials.gov landscape with competitors
-- the team knows about — including stealth/preclinical ones that have no
-- registered trials to discover. One row per competitor per deal/company.
-- Safe to run in a fresh Supabase SQL Editor tab.
CREATE TABLE IF NOT EXISTS company_competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('deal', 'portfolio')),
  entity_id UUID NOT NULL,
  name TEXT NOT NULL,
  note TEXT,
  url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE company_competitors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage company_competitors" ON company_competitors;
CREATE POLICY "Auth users can manage company_competitors" ON company_competitors FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS company_competitors_entity_idx ON company_competitors (entity_type, entity_id);
