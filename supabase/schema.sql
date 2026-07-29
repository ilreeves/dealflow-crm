-- ============================================================
-- Solas Dealflow CRM - Supabase Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deals
CREATE TABLE deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'Sourced',
  sector TEXT,
  check_size TEXT,
  lead_partner TEXT,
  founders TEXT,
  source TEXT,
  website TEXT,
  description TEXT,
  custom_fields JSONB DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Custom field definitions (admin-managed schema)
CREATE TABLE custom_field_definitions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,        -- internal key, e.g. "arr"
  label TEXT NOT NULL,              -- display label, e.g. "ARR ($)"
  field_type TEXT NOT NULL DEFAULT 'text', -- text | number | date | select | boolean
  options JSONB,                    -- for select type: ["Option A", "Option B"]
  required BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deal files
CREATE TABLE deal_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deal notes
CREATE TABLE deal_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_notes ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Deals: all authenticated users have full access
CREATE POLICY "Auth users can view deals" ON deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert deals" ON deals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update deals" ON deals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete deals" ON deals FOR DELETE TO authenticated USING (true);

-- Custom fields: all authenticated users can manage
CREATE POLICY "Auth users can view custom fields" ON custom_field_definitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can manage custom fields" ON custom_field_definitions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Files: all authenticated users can manage
CREATE POLICY "Auth users can view files" ON deal_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert files" ON deal_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can delete files" ON deal_files FOR DELETE TO authenticated USING (true);

-- Notes: all authenticated users can manage
CREATE POLICY "Auth users can view notes" ON deal_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users can insert notes" ON deal_notes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users can update notes" ON deal_notes FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth users can delete notes" ON deal_notes FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Triggers
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_deal_notes_updated_at
  BEFORE UPDATE ON deal_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- Storage bucket for deal files
-- Run this separately in Supabase SQL Editor:
-- ============================================================
-- INSERT INTO storage.buckets (id, name, public) VALUES ('deal-files', 'deal-files', false);
--
-- CREATE POLICY "Auth users can upload files" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'deal-files');
-- CREATE POLICY "Auth users can view files" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'deal-files');
-- CREATE POLICY "Auth users can delete files" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'deal-files');


-- ============================================================
-- MIGRATION: Run these in Supabase SQL Editor for existing DBs
-- ============================================================
-- ALTER TABLE deals ADD COLUMN IF NOT EXISTS contact_email TEXT;

-- ============================================================
-- Deal Meetings
-- ============================================================

CREATE TABLE IF NOT EXISTS deal_meetings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  meeting_date DATE,
  attendees TEXT,
  summary TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID REFERENCES deal_meetings(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES auth.users(id),
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meeting_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID REFERENCES deal_meetings(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size INTEGER,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deal_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage deal_meetings" ON deal_meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can manage meeting_notes" ON meeting_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can manage meeting_files" ON meeting_files FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_deal_meetings_updated_at
  BEFORE UPDATE ON deal_meetings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Portfolio Companies
-- ============================================================

CREATE TABLE IF NOT EXISTS portfolio_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  category TEXT,
  funds TEXT[],
  series TEXT,
  clinical_stage TEXT,
  website TEXT,
  contact_email TEXT,
  description TEXT,
  current_valuation TEXT,
  current_fundraise TEXT,
  sharepoint_link TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_fundraise_rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE NOT NULL,
  round_name TEXT NOT NULL,
  amount TEXT,
  date DATE,
  lead_investor TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS portfolio_investor_intros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE NOT NULL,
  investor_name TEXT NOT NULL,
  investor_firm TEXT,
  contact_email TEXT,
  intro_date DATE,
  status TEXT DEFAULT 'Introduced',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE portfolio_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_fundraise_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_investor_intros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can manage portfolio_companies" ON portfolio_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can manage portfolio_fundraise_rounds" ON portfolio_fundraise_rounds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Auth users can manage portfolio_investor_intros" ON portfolio_investor_intros FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER update_portfolio_companies_updated_at
  BEFORE UPDATE ON portfolio_companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_portfolio_investor_intros_updated_at
  BEFORE UPDATE ON portfolio_investor_intros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Activity log
CREATE TABLE IF NOT EXISTS deal_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  deal_name TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deal_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage deal_activity" ON deal_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Location fields
ALTER TABLE deals ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS city TEXT;

-- Catalyst calendar
CREATE TABLE IF NOT EXISTS catalysts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  catalyst_date DATE NOT NULL,
  period TEXT,
  original_date DATE,
  original_period TEXT,
  status TEXT DEFAULT 'Pending',
  resolved_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE catalysts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage catalysts" ON catalysts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Catalyst activity feed
CREATE TABLE IF NOT EXISTS catalyst_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL,
  catalyst_title TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  actor_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE catalyst_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage catalyst_activity" ON catalyst_activity FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Legacy (inactive: failed/acquired) catalyst companies
CREATE TABLE IF NOT EXISTS legacy_companies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE legacy_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage legacy_companies" ON legacy_companies FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Shared dismissed catalyst reminders (signature ties to catalyst timing+status)
CREATE TABLE IF NOT EXISTS dismissed_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  signature TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE dismissed_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage dismissed_reminders" ON dismissed_reminders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Editable dropdown lists (series, clinical_stage, fund) managed from Settings
CREATE TABLE IF NOT EXISTS list_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_key TEXT NOT NULL,
  value TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE list_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users can manage list_options" ON list_options FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO list_options (list_key, value, sort_order) VALUES
('series','Pre-Seed',0),('series','Seed',1),('series','Convertible Note/SAFE',2),('series','A',3),('series','B',4),('series','C',5),('series','D+',6),('series','Crossover',7),('series','Public',8),
('clinical_stage','Preclinical',0),('clinical_stage','Pre-IND',1),('clinical_stage','Phase I',2),('clinical_stage','Phase II',3),('clinical_stage','Phase III',4),('clinical_stage','Pre-IDE',5),('clinical_stage','FIH',6),('clinical_stage','Pivotal',7),('clinical_stage','510(k)',8),('clinical_stage','PMA',9),('clinical_stage','Approved / Marketed',10),
('fund','Fund I',0),('fund','Fund II',1),('fund','EHF',2),('fund','Solas/Sower',3),('fund','SPV',4);

-- SharePoint link on deals
ALTER TABLE deals ADD COLUMN IF NOT EXISTS sharepoint_link TEXT;


-- ============================================================
-- Cap & Rounds: structured round terms + Solas positions
-- Run these in Supabase SQL Editor (safe to re-run)
-- ============================================================
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS security_type TEXT DEFAULT 'Priced equity';
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS round_size NUMERIC;
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS pre_money NUMERIC;
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS post_money NUMERIC;
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS price_per_share NUMERIC;
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS terms JSONB DEFAULT '{}';

CREATE TABLE IF NOT EXISTS portfolio_positions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE NOT NULL,
  round_id UUID REFERENCES portfolio_fundraise_rounds(id) ON DELETE CASCADE,
  fund TEXT,
  invested_amount NUMERIC,
  shares NUMERIC,
  ownership_pct NUMERIC,
  accrued_interest NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portfolio_positions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_positions" ON portfolio_positions;
CREATE POLICY "Auth users can manage portfolio_positions" ON portfolio_positions FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- Valuation marks: interim fair-value updates between rounds
-- Run in Supabase SQL Editor (safe to re-run)
-- ============================================================
CREATE TABLE IF NOT EXISTS portfolio_valuation_marks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE NOT NULL,
  as_of_date DATE,
  valuation NUMERIC,
  basis TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portfolio_valuation_marks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_valuation_marks" ON portfolio_valuation_marks;
CREATE POLICY "Auth users can manage portfolio_valuation_marks" ON portfolio_valuation_marks FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- Position-level fair-value marks (from audited financials / interim marks)
-- Run in Supabase SQL Editor (safe to re-run)
-- ============================================================
ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS fair_value NUMERIC;
ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS fair_value_date DATE;
ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS fair_value_source TEXT;


-- ============================================================
-- Portfolio company status (Active / Legacy / Exited)
-- Run in Supabase SQL Editor (safe to re-run)
-- ============================================================
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'Active';
UPDATE portfolio_companies SET status = 'Legacy' WHERE name = 'Areteia' AND (status IS NULL OR status = 'Active');


-- ============================================================
-- Pass reason / passed date (first-class) — run in Supabase SQL Editor
-- ============================================================
ALTER TABLE deals ADD COLUMN IF NOT EXISTS pass_reason TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS passed_at TIMESTAMPTZ;

-- Backfill from the latest "Passed: ..." note on each passed deal
UPDATE deals d SET
  pass_reason = sub.reason,
  passed_at   = COALESCE(d.passed_at, sub.created_at, d.stage_entered_at)
FROM (
  SELECT DISTINCT ON (deal_id) deal_id,
         regexp_replace(content, '^Passed:\s*', '') AS reason,
         created_at
  FROM deal_notes
  WHERE content ILIKE 'Passed:%'
  ORDER BY deal_id, created_at DESC
) sub
WHERE d.id = sub.deal_id AND d.stage = 'Passed' AND d.pass_reason IS NULL;


-- ============================================================
-- Non-confidential deck + pipeline investor intros + shared investor directory
-- Run in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- Dedicated single-slot "non-confidential deck" pointer (file lives in the deal-files bucket)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS non_con_deck_path TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS non_con_deck_name TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS non_con_deck_path TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS non_con_deck_name TEXT;

-- Investor intros for pipeline deals (mirrors portfolio_investor_intros)
CREATE TABLE IF NOT EXISTS deal_investor_intros (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  investor_name TEXT NOT NULL,
  investor_firm TEXT,
  contact_email TEXT,
  intro_date DATE,
  status TEXT DEFAULT 'Introduced',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deal_investor_intros ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage deal_investor_intros" ON deal_investor_intros;
CREATE POLICY "Auth users can manage deal_investor_intros" ON deal_investor_intros FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_deal_investor_intros_updated_at ON deal_investor_intros;
CREATE TRIGGER update_deal_investor_intros_updated_at
  BEFORE UPDATE ON deal_investor_intros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Shared, ever-growing investor directory that powers firm/email autocomplete
CREATE TABLE IF NOT EXISTS investor_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  firm TEXT,
  contact_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE investor_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage investor_contacts" ON investor_contacts;
CREATE POLICY "Auth users can manage investor_contacts" ON investor_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP TRIGGER IF EXISTS update_investor_contacts_updated_at ON investor_contacts;
CREATE TRIGGER update_investor_contacts_updated_at
  BEFORE UPDATE ON investor_contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed the directory from existing portfolio intros (one row per investor, most recent firm/email wins)
INSERT INTO investor_contacts (name, firm, contact_email)
SELECT DISTINCT ON (lower(investor_name)) trim(investor_name), investor_firm, contact_email
FROM portfolio_investor_intros
WHERE investor_name IS NOT NULL AND trim(investor_name) <> ''
ORDER BY lower(investor_name), updated_at DESC NULLS LAST
ON CONFLICT (name) DO NOTHING;


-- ============================================================
-- Trackable, permanent non-con deck share links + view log
-- Run in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- Stable per-entity share token (survives deck replacement; cleared when the deck is removed)
ALTER TABLE deals ADD COLUMN IF NOT EXISTS non_con_deck_token TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS non_con_deck_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS deals_deck_token_key ON deals (non_con_deck_token) WHERE non_con_deck_token IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS portfolio_deck_token_key ON portfolio_companies (non_con_deck_token) WHERE non_con_deck_token IS NOT NULL;

-- Each open of a /deck/<token> link, gated behind a name + email prompt
CREATE TABLE IF NOT EXISTS deck_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL,
  entity_type TEXT NOT NULL,           -- 'deal' | 'portfolio'
  entity_id UUID,
  company_name TEXT,
  viewer_name TEXT,
  viewer_email TEXT,
  viewed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deck_views ENABLE ROW LEVEL SECURITY;
-- App users read the tracker; inserts are done server-side with the service role (bypasses RLS), so no anon policy
DROP POLICY IF EXISTS "Auth users can read deck_views" ON deck_views;
CREATE POLICY "Auth users can read deck_views" ON deck_views FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS deck_views_token_idx ON deck_views (token);

-- Deck share links now expire 4 weeks after they are (re)sent
ALTER TABLE deals ADD COLUMN IF NOT EXISTS non_con_deck_shared_at TIMESTAMPTZ;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS non_con_deck_shared_at TIMESTAMPTZ;


-- ============================================================
-- Multiple non-con decks per company (one per raise), each independently trackable
-- Run in Supabase SQL Editor (safe to re-run)
-- ============================================================
CREATE TABLE IF NOT EXISTS company_decks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,          -- 'deal' | 'portfolio'
  entity_id UUID NOT NULL,
  company_name TEXT,
  label TEXT NOT NULL DEFAULT 'Deck', -- e.g. 'Series B', 'Series C'
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  token TEXT,
  shared_at TIMESTAMPTZ,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE company_decks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage company_decks" ON company_decks;
CREATE POLICY "Auth users can manage company_decks" ON company_decks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE UNIQUE INDEX IF NOT EXISTS company_decks_token_key ON company_decks (token) WHERE token IS NOT NULL;
CREATE INDEX IF NOT EXISTS company_decks_entity_idx ON company_decks (entity_type, entity_id);

-- Migrate existing single-slot decks into the new table (guarded so re-runs don't duplicate)
INSERT INTO company_decks (entity_type, entity_id, company_name, label, storage_path, file_name, token, shared_at)
SELECT 'deal', d.id, d.name, COALESCE(NULLIF(d.series, ''), 'Deck'), d.non_con_deck_path, d.non_con_deck_name, d.non_con_deck_token, d.non_con_deck_shared_at
FROM deals d
WHERE d.non_con_deck_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM company_decks cd WHERE cd.entity_type = 'deal' AND cd.entity_id = d.id);
INSERT INTO company_decks (entity_type, entity_id, company_name, label, storage_path, file_name, token, shared_at)
SELECT 'portfolio', p.id, p.name, COALESCE(NULLIF(p.series, ''), 'Deck'), p.non_con_deck_path, p.non_con_deck_name, p.non_con_deck_token, p.non_con_deck_shared_at
FROM portfolio_companies p
WHERE p.non_con_deck_path IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM company_decks cd WHERE cd.entity_type = 'portfolio' AND cd.entity_id = p.id);

-- Performance indexes (July 2026) — see supabase/migration_add_indexes.sql.
-- Postgres does not auto-index FK columns; these cover the app's FK/filter/order queries.
CREATE INDEX IF NOT EXISTS deal_files_deal_id_idx        ON deal_files (deal_id);
CREATE INDEX IF NOT EXISTS deal_notes_deal_id_idx        ON deal_notes (deal_id);
CREATE INDEX IF NOT EXISTS deal_meetings_deal_id_idx     ON deal_meetings (deal_id);
CREATE INDEX IF NOT EXISTS meeting_notes_meeting_id_idx  ON meeting_notes (meeting_id);
CREATE INDEX IF NOT EXISTS meeting_files_meeting_id_idx  ON meeting_files (meeting_id);
CREATE INDEX IF NOT EXISTS deal_investor_intros_deal_id_idx ON deal_investor_intros (deal_id);
CREATE INDEX IF NOT EXISTS portfolio_fundraise_rounds_company_id_idx ON portfolio_fundraise_rounds (company_id);
CREATE INDEX IF NOT EXISTS portfolio_positions_company_id_idx        ON portfolio_positions (company_id);
CREATE INDEX IF NOT EXISTS portfolio_positions_round_id_idx          ON portfolio_positions (round_id);
CREATE INDEX IF NOT EXISTS portfolio_valuation_marks_company_id_idx  ON portfolio_valuation_marks (company_id);
CREATE INDEX IF NOT EXISTS portfolio_investor_intros_company_id_idx  ON portfolio_investor_intros (company_id);
CREATE INDEX IF NOT EXISTS deal_activity_deal_id_idx            ON deal_activity (deal_id);
CREATE INDEX IF NOT EXISTS deal_activity_action_created_at_idx  ON deal_activity (action, created_at DESC);
CREATE INDEX IF NOT EXISTS catalyst_activity_created_at_idx     ON catalyst_activity (created_at DESC);
CREATE INDEX IF NOT EXISTS catalysts_company_name_idx  ON catalysts (company_name);
CREATE INDEX IF NOT EXISTS catalysts_catalyst_date_idx ON catalysts (catalyst_date);
CREATE INDEX IF NOT EXISTS list_options_list_key_idx ON list_options (list_key);
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
-- Research identifiers for clinical/scientific enrichment (July 2026)
-- Optional per-company keys that make ClinicalTrials.gov matching reliable when
-- the CRM company name doesn't match the registered trial sponsor (common after
-- asset acquisitions, spinouts, or partner-run trials).
--   drug_names      — comma-separated drug/asset names, searched as trial interventions
--   ct_sponsor_name — exact ClinicalTrials.gov sponsor name, if different from the company name
-- Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS drug_names TEXT;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS ct_sponsor_name TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS drug_names TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS ct_sponsor_name TEXT;
-- Competitive landscape enrichment (July 2026)
-- `indication` lets the enrichment search ClinicalTrials.gov for OTHER sponsors'
-- trials in the same disease area (the competitive field). When left blank, the
-- app derives the indication from the company's own trial conditions.
-- `competitors` / `indication_used` cache the landscape result alongside the
-- existing trials + publications for a company.
-- Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE deals ADD COLUMN IF NOT EXISTS indication TEXT;
ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS indication TEXT;
ALTER TABLE company_enrichment ADD COLUMN IF NOT EXISTS competitors JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE company_enrichment ADD COLUMN IF NOT EXISTS indication_used TEXT;
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
-- Fundraising details (July 2026)
-- 1) Option pool on portfolio rounds (percent of post-money fully diluted).
-- 2) Fundraising rounds for PIPELINE deals — same shape as the portfolio rounds
--    table but without Solas positions (we don't own a pipeline company yet).
--    Lets a deal record the round it's raising plus prior rounds.
-- Safe to run in a fresh Supabase SQL Editor tab.

ALTER TABLE portfolio_fundraise_rounds ADD COLUMN IF NOT EXISTS option_pool NUMERIC;

CREATE TABLE IF NOT EXISTS deal_fundraise_rounds (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE NOT NULL,
  round_name TEXT NOT NULL,
  security_type TEXT DEFAULT 'Priced equity',
  date DATE,
  lead_investor TEXT,
  round_size NUMERIC,
  pre_money NUMERIC,
  post_money NUMERIC,
  option_pool NUMERIC,
  price_per_share NUMERIC,
  status TEXT,
  terms JSONB DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deal_fundraise_rounds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage deal_fundraise_rounds" ON deal_fundraise_rounds;
CREATE POLICY "Auth users can manage deal_fundraise_rounds" ON deal_fundraise_rounds FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS deal_fundraise_rounds_deal_id_idx ON deal_fundraise_rounds (deal_id);
-- Tie non-confidential decks to a fundraising round (July 2026)
-- The deck label was free text; it can now point at an actual round so renaming
-- the round updates the deck label, share slug, and share email.
-- round_id is polymorphic (portfolio_fundraise_rounds OR deal_fundraise_rounds,
-- per entity_type) so it carries no FK — matching the existing entity_id pattern.
-- `label` is kept as a snapshot/fallback for decks with no linked round.
-- Safe to run in a fresh Supabase SQL Editor tab.

ALTER TABLE company_decks ADD COLUMN IF NOT EXISTS round_id UUID;
CREATE INDEX IF NOT EXISTS company_decks_round_id_idx ON company_decks (round_id);

-- Auto-link existing decks whose free-text label already matches a round name
-- (e.g. a deck labelled "Series B" on a company that has a "Series B" round).
UPDATE company_decks cd
SET round_id = r.id
FROM portfolio_fundraise_rounds r
WHERE cd.entity_type = 'portfolio'
  AND cd.entity_id = r.company_id
  AND cd.round_id IS NULL
  AND lower(trim(cd.label)) = lower(trim(r.round_name));

UPDATE company_decks cd
SET round_id = r.id
FROM deal_fundraise_rounds r
WHERE cd.entity_type = 'deal'
  AND cd.entity_id = r.deal_id
  AND cd.round_id IS NULL
  AND lower(trim(cd.label)) = lower(trim(r.round_name));
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
-- Look-through positions (July 2026)
-- Where a commingled fund is an LP in a sidecar we ALSO track at vehicle level,
-- the fund's position and the sidecar's investment are the same economics. We
-- keep both rows (so each fund still shows its own holdings) but tag the fund's
-- row with the sidecar it looks through to, and exclude those rows from the
-- portfolio-wide totals so AUM isn't double counted.
--   NULL          = a real, independent position (the default)
--   '<fund name>' = this row is our LP interest in that vehicle
-- Confirmed cases: EHF -> Basking Holdings, EHF -> Knopp Sub Investments.
-- Safe to run in a fresh Supabase SQL Editor tab.
ALTER TABLE portfolio_positions ADD COLUMN IF NOT EXISTS lookthrough_of TEXT;
CREATE INDEX IF NOT EXISTS portfolio_positions_lookthrough_idx ON portfolio_positions (lookthrough_of);
