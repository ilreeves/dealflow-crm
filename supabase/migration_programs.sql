-- Programs + market map (October 2026)
-- One row per company × intervention × indication, with its development phase.
-- Feeds the Market Map page (indication × phase grid) and the Programs section
-- on each deal / portfolio company.
--
-- Exactly one owner per row:
--   company_id   → a Solas portfolio company
--   deal_id      → a pipeline (or passed) deal
--   company_name → an external company (competitor / market context only)
-- Real FKs (unlike company_competitors' polymorphic entity_id) so deleting a
-- deal or company cascades instead of orphaning its programs.
--
-- `phase` is the precise label (drug ladder or device ladder); lib/programs.ts
-- maps it onto the map's shared columns. `needs_review` marks rows drafted by
-- research rather than entered by the team; saving one in the app clears it.
-- Safe to run in a fresh Supabase SQL Editor tab.
CREATE TABLE IF NOT EXISTS programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  company_name TEXT,
  intervention TEXT NOT NULL,
  mechanism TEXT,
  modality TEXT NOT NULL CHECK (modality IN ('Small molecule','Biologic','Nucleic acid','Cell & gene therapy','Device','Diagnostic','Digital health','Other')),
  indication TEXT NOT NULL,
  therapeutic_area TEXT NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN (
    'Preclinical','Phase 1','Phase 1/2','Phase 2','Phase 2/3','Phase 3','Filed','Approved',
    'First-in-human','Early feasibility','Pivotal','Submitted','Cleared / Approved','Marketed'
  )),
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Discontinued')),
  source TEXT,
  notes TEXT,
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT programs_one_owner CHECK (
    (company_id IS NOT NULL)::int + (deal_id IS NOT NULL)::int + (NULLIF(btrim(company_name), '') IS NOT NULL)::int = 1
  )
);
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage programs" ON programs;
CREATE POLICY "Auth users can manage programs" ON programs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS programs_company_idx ON programs (company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS programs_deal_idx ON programs (deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS programs_indication_idx ON programs (therapeutic_area, indication);
DROP TRIGGER IF EXISTS update_programs_updated_at ON programs;
CREATE TRIGGER update_programs_updated_at
  BEFORE UPDATE ON programs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
