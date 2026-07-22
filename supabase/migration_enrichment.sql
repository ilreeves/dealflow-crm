-- Clinical/scientific enrichment cache (July 2026)
-- Stores the latest ClinicalTrials.gov + PubMed pull for a deal or portfolio
-- company so pages load instantly and we don't re-hit the public APIs on every
-- view. Refreshed on demand from the "Pull clinical & scientific context" button.
-- Safe to run in a fresh Supabase SQL Editor tab.
CREATE TABLE IF NOT EXISTS company_enrichment (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('deal', 'portfolio')),
  entity_id UUID NOT NULL,
  query_name TEXT,
  trials JSONB NOT NULL DEFAULT '[]'::jsonb,
  publications JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, entity_id)
);
ALTER TABLE company_enrichment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage company_enrichment" ON company_enrichment;
CREATE POLICY "Auth users can manage company_enrichment" ON company_enrichment FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS company_enrichment_entity_idx ON company_enrichment (entity_type, entity_id);
