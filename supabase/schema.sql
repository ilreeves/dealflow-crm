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

-- Columns the app reads/writes that were added by hand in the SQL Editor and
-- never recorded here — without these, a fresh database 400s on every deal
-- save, and the backfills further down this file abort. No-ops on the live DB.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS contact_email        TEXT,
  ADD COLUMN IF NOT EXISTS category             TEXT,
  ADD COLUMN IF NOT EXISTS series               TEXT,
  ADD COLUMN IF NOT EXISTS clinical_stage       TEXT,
  ADD COLUMN IF NOT EXISTS current_valuation    TEXT,
  ADD COLUMN IF NOT EXISTS current_fundraise    TEXT,
  ADD COLUMN IF NOT EXISTS fundraising_to_date  TEXT,
  ADD COLUMN IF NOT EXISTS stage_entered_at     TIMESTAMPTZ;

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

-- Opt-in revenue tracking (August 2026)
--
-- Most portfolio companies are pre-revenue, so a Revenue tab on every company
-- is noise. Tracking is now explicit: a company is added to the roster on the
-- Revenue page, and only then does its Revenue tab appear.
--
-- This is a display flag, NOT a data gate — clearing it never deletes revenue
-- rows, and the Revenue page still lists any company that has figures recorded
-- so untracking can't make data invisible.
--
-- Safe to run in a fresh Supabase SQL Editor tab.

ALTER TABLE portfolio_companies ADD COLUMN IF NOT EXISTS track_revenue BOOLEAN NOT NULL DEFAULT false;

-- Any company that already has revenue recorded is tracked by definition.
UPDATE portfolio_companies c
SET track_revenue = true
WHERE NOT c.track_revenue
  AND EXISTS (SELECT 1 FROM portfolio_revenue r WHERE r.company_id = c.id);

CREATE INDEX IF NOT EXISTS portfolio_companies_track_revenue_idx ON portfolio_companies (track_revenue) WHERE track_revenue;

-- Runway tracking (August 2026)
--
-- Cash on hand, monthly burn, and when a company runs out — one row per cash
-- observation, sourced from board decks. Runway is the single most
-- time-sensitive number in the book, so the table records WHEN each balance was
-- measured and keeps the company's own runway claim separate from the arithmetic.
--
-- Safe to run in a fresh Supabase SQL Editor tab. All statements are idempotent.

CREATE TABLE IF NOT EXISTS portfolio_cash (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES portfolio_companies(id) ON DELETE CASCADE,

  -- The date the cash balance was MEASURED, not the date the deck was sent.
  -- Everything downstream keys off this: a $4M balance is a different fact in
  -- January than in July, and the difference is the whole point of the tab.
  as_of DATE NOT NULL,

  -- Dollars, not thousands. Board decks routinely quote $000s.
  cash_on_hand NUMERIC,

  -- Dollars per month, POSITIVE when spending. A cash-generating company gets
  -- 0 or a negative figure, which the app reads as "not burning" — never as
  -- zero runway.
  monthly_burn NUMERIC,

  -- What the burn figure actually measures: net (after revenue) vs gross opex,
  -- averaged vs a single month. Recorded verbatim so two companies' burn are
  -- never silently compared on different bases.
  burn_basis TEXT,

  -- What the COMPANY said, when they said it. Kept separate from cash/burn so
  -- the arithmetic can disagree with management and the disagreement stays
  -- visible instead of one side overwriting the other.
  runway_months NUMERIC,
  out_of_cash_date DATE,

  -- Capital committed or closed but NOT included in cash_on_hand — a signed
  -- tranche, a bridge that hasn't funded. Drives a pro-forma runway shown
  -- alongside, never folded into the cash figure itself.
  committed_funding NUMERIC,

  source TEXT,
  -- Which deck and which slide, so a figure can be traced back a year later.
  source_detail TEXT,
  notes TEXT,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- One observation per company per date. A newer deck restating the same
  -- month's balance is an UPDATE, not a second row.
  UNIQUE (company_id, as_of)
);

ALTER TABLE portfolio_cash ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_cash" ON portfolio_cash;
CREATE POLICY "Auth users can manage portfolio_cash" ON portfolio_cash
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS portfolio_cash_company_idx ON portfolio_cash (company_id, as_of DESC);
CREATE INDEX IF NOT EXISTS portfolio_cash_as_of_idx ON portfolio_cash (as_of DESC);

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


-- Revised projections alongside the original plan (August 2026)
--
-- WHY: `portfolio_revenue` had ONE plan slot. The convention was that `projected`
-- holds the ORIGINAL start-of-year budget and any restatement lives in `notes`,
-- but four rows broke it — they carry a mid-year reforecast in `projected`,
-- distinguished only by `projected_source = 'Reforecast'` (Vektor Q3/Q4 2025 and
-- Q2 2026, iO Urology Q2 2026). So the two series were conflated in one column:
-- for those rows the original plan is lost, and for every other row there is no
-- revised figure at all.
--
-- That conflation was already leaking into the code. lib/revenue.ts's
-- annualMismatch() had to special-case the 'Reforecast' tag to avoid flagging a
-- year whose quarters were never meant to reconcile to the original annual plan,
-- and the analytics page had to disclose that some of its comparisons were
-- against an easier, mid-year target.
--
-- This gives the revision its own column so neither series overwrites the other:
--   projected         — the ORIGINAL plan for the period. Never restated.
--   revised_projected — the current view of the period: a company reforecast, or
--                       the Solas team's own revision.
--
-- Consumers pick a basis deliberately. The Revenue page and the per-company
-- Revenue tab measure against the revised plan (falling back to the original
-- where no revision exists); /analytics stays on the original, because
-- projection reliability is only meaningful against the target that was set
-- before the year was known.
--
-- Safe to run in a fresh Supabase SQL Editor tab. Idempotent.

ALTER TABLE portfolio_revenue ADD COLUMN IF NOT EXISTS revised_projected NUMERIC;
ALTER TABLE portfolio_revenue ADD COLUMN IF NOT EXISTS revised_source TEXT;
ALTER TABLE portfolio_revenue ADD COLUMN IF NOT EXISTS revised_as_of DATE;

COMMENT ON COLUMN portfolio_revenue.projected IS
  'The ORIGINAL plan for the period. Never overwrite with a later restatement — put that in revised_projected.';
COMMENT ON COLUMN portfolio_revenue.revised_projected IS
  'Restated plan for the period: a company reforecast or the Solas team''s own revision. NULL means the original still stands.';
COMMENT ON COLUMN portfolio_revenue.revised_source IS
  'Where the revision came from — e.g. Company reforecast, Board deck, Solas team estimate.';
COMMENT ON COLUMN portfolio_revenue.revised_as_of IS
  'When the revision was made. A reforecast has a vintage, not just a number.';

-- Move the four rows that were storing a reforecast in `projected`. The original
-- plan for those periods was never located, so `projected` is left NULL rather
-- than back-filled with a guess — "no original budget on record" is the truth,
-- and /analytics correctly drops them from its original-basis sample.
UPDATE portfolio_revenue
SET revised_projected = projected,
    revised_source    = 'Company reforecast',
    revised_as_of     = projected_as_of,
    projected         = NULL,
    projected_source  = NULL,
    projected_as_of   = NULL
WHERE projected_source = 'Reforecast';


-- Clearing a runway "check" flag (August 2026)
--
-- WHY: the check badge fires when a company's STATED runway and its own
-- cash ÷ burn disagree materially. That gap is frequently legitimate rather
-- than an error — burn is forecast to ramp with a commercial launch, or to fall
-- after a trial completes — so the flag is a prompt to read the note, not a
-- defect. Three of the current five are known-good by design:
--   iO Urology   — burn ramps $495k → $1,084k/mo through the Gen 2 launch, so a
--                  flat cash ÷ burn reads ~12 months against a stated ~8.
--   InterShunt   — burn roughly triples as the pivotal enrols.
--   Basking      — cash came off the runway chart, not the balance sheet.
-- With no way to clear them the badges become wallpaper, and a badge everyone
-- ignores is worse than no badge: the one that matters stops being visible.
--
-- The acknowledgement records the PERCENTAGE that was accepted, not a boolean.
-- A boolean would stay stuck once set — someone clears a 159% gap, the figures
-- are later edited into a 400% gap, and the flag never returns. Storing the
-- reviewed value lets the flag come back when the disagreement materially
-- changes, which is the only time it has anything new to say.
--
-- Note that acknowledgements live on the cash ROW, so a new observation starts
-- unacknowledged by construction — a fresh balance deserves a fresh look.
--
-- Safe to run in a fresh Supabase SQL Editor tab. Idempotent.

ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_ack_pct NUMERIC;
ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_ack_note TEXT;
ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_acked_at TIMESTAMPTZ;
ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_acked_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN portfolio_cash.mismatch_ack_pct IS
  'The stated-vs-derived runway gap (%) that was reviewed and accepted. The flag returns if the gap moves materially away from this — see MISMATCH_ACK_DRIFT_PCT in lib/runway.ts.';
COMMENT ON COLUMN portfolio_cash.mismatch_ack_note IS
  'Why the gap is expected. The whole point of clearing a flag rather than suppressing it: the reasoning is the thing worth keeping.';
COMMENT ON COLUMN portfolio_cash.mismatch_acked_at IS
  'When the gap was accepted. NULL means never reviewed.';
COMMENT ON COLUMN portfolio_cash.mismatch_acked_by IS
  'Who accepted it. Pairs with updated_by from migration_runway_audit.sql.';


-- ============================================================
-- Portfolio company files (from migration_portfolio_files.sql)
-- ============================================================

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


-- ============================================================
-- Cash forecast curves (from migration_cash_forecast.sql)
-- ============================================================

-- Projected cash and burn (August 2026)
--
-- Isaiah asked on 2026-08-08 for burn charted HISTORICAL AND PROJECTED, plus a
-- read on how reliable each company's projections turn out to be. That was
-- deferred, and the blocker was never the charting — it was that there is
-- nowhere for a forecast to live. `portfolio_cash` holds REPORTED figures, and
-- the standing convention forbids putting a budget path in it, because a
-- forecast sitting in the observations table is indistinguishable from a
-- balance sheet the moment anyone stops reading notes. So forecast paths have
-- been stranded in `notes` prose: iO Urology's monthly ramp, Basking's
-- quarterly curve, Arrivo's, and now Francis's 20 quarters.
--
-- WHY A SEPARATE TABLE AND NOT A `kind` COLUMN ON portfolio_cash
--
-- A discriminator was the obvious cheap option and it is the wrong one, for
-- three reasons that only show up later:
--
--   1. EVERY helper would have to remember to filter. latestCash,
--      latestRunwaySource, cashMovementBurn, burnTrendPct, staleness and
--      buildCompanyRunway all scan the table. Miss one and a projection is
--      silently reported as a balance — precisely the failure the convention
--      exists to prevent, reintroduced as a permanent footgun.
--
--   2. UNIQUE (company_id, as_of) BLOCKS THE POINT OF THE FEATURE. A forecast
--      for Q4-2026 and the actual balance that later arrives for Q4-2026 must
--      coexist, or you can never compare them — and comparing them IS the
--      reliability half of the request.
--
--   3. A FORECAST HAS A VINTAGE AND AN OBSERVATION DOES NOT. The March-2026
--      model and the August-2026 board deck both project Q4-2026 cash, and they
--      disagree; that disagreement is a finding, not a conflict to resolve. The
--      natural key is (company, vintage, period) — three columns where
--      portfolio_cash has room for two.
--
-- portfolio_revenue solves the same problem with two slots in one row
-- (`projected` = original, `revised_projected` = restatement). That works there
-- because a period has one number. Cash forecasts arrive as a whole SERIES per
-- deck, so two slots will not do.
--
-- BURN IS NORMALISED TO PER-MONTH, matching portfolio_cash.monthly_burn, so the
-- two series can be charted on one axis without the caller doing arithmetic.
-- Francis's deck states burn per QUARTER ($12M in Q4-2026); that is stored as
-- 4,000,000. The grain is recoverable from period_end spacing, and the raw
-- figure belongs in notes.
--
-- Safe to run in a fresh Supabase SQL Editor tab. Idempotent.

CREATE TABLE IF NOT EXISTS portfolio_cash_forecast (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES portfolio_companies(id) ON DELETE CASCADE,

  -- THE VINTAGE: when this projection was made. Two decks projecting the same
  -- quarter are two rows, not a correction, and the older one is kept — a plan
  -- that moved is the finding.
  forecast_as_of DATE NOT NULL,

  -- The period being projected. End-of-period, so it lines up with the
  -- balance-sheet dates in portfolio_cash without any bucketing.
  period_end DATE NOT NULL,

  -- Projected END-OF-PERIOD cash. Signed: a company projecting a funding hole
  -- goes NEGATIVE here on purpose. Francis's unfunded path bottoms at
  -- -$49M in Q1-2029, and flooring that at zero would erase the size of the
  -- raise it implies, which is the single most useful number on the curve.
  cash_on_hand NUMERIC,

  -- Projected burn, DOLLARS PER MONTH, positive when spending — same sign and
  -- same units as portfolio_cash.monthly_burn. Negative once a company is
  -- projected to generate cash, which Francis does from Q2-2029.
  monthly_burn NUMERIC,

  -- Same vocabulary as portfolio_cash.burn_basis. A forecast series and the
  -- actuals it will be compared against must be on one basis or the comparison
  -- is two different measurements.
  burn_basis TEXT,

  -- Which scenario this row belongs to. A deck routinely carries several — the
  -- unfunded path, the path with a bridge, a haircut case — and charting them
  -- together without a label would read as one incoherent series. NULL means
  -- the company's single base case.
  scenario TEXT,

  source TEXT,
  -- Which deck and which slide, so a projection can be traced back a year later.
  source_detail TEXT,
  notes TEXT,

  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id),

  -- One projection per company per vintage per period per scenario. Reloading
  -- the same deck is an upsert; a NEW deck is a new vintage and new rows.
  UNIQUE (company_id, forecast_as_of, period_end, scenario)
);

ALTER TABLE portfolio_cash_forecast ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_cash_forecast" ON portfolio_cash_forecast;
CREATE POLICY "Auth users can manage portfolio_cash_forecast" ON portfolio_cash_forecast
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS portfolio_cash_forecast_company_idx
  ON portfolio_cash_forecast (company_id, period_end);
CREATE INDEX IF NOT EXISTS portfolio_cash_forecast_vintage_idx
  ON portfolio_cash_forecast (company_id, forecast_as_of DESC);

COMMENT ON TABLE portfolio_cash_forecast IS
  'Projected cash and burn from company decks. Deliberately NOT in portfolio_cash: '
  'a forecast has a vintage, must be able to coexist with the actual for the same '
  'period, and must never be picked up by the runway helpers.';
COMMENT ON COLUMN portfolio_cash_forecast.forecast_as_of IS
  'When the projection was made. Two vintages of the same period are both kept.';
COMMENT ON COLUMN portfolio_cash_forecast.cash_on_hand IS
  'Projected end-of-period cash. Goes negative on purpose — that is the funding gap.';
COMMENT ON COLUMN portfolio_cash_forecast.monthly_burn IS
  'Projected burn per MONTH, positive when spending. Quarterly deck figures are '
  'divided by 3 on the way in so this is directly comparable to portfolio_cash.';
COMMENT ON COLUMN portfolio_cash_forecast.scenario IS
  'NULL = the company base case. Otherwise names the path, e.g. "Unfunded".';


-- ============================================================
-- Cleanup #2 (from migration_cleanup_2.sql)
-- ============================================================

-- Cleanup migration #2 (August 2026 backlog sweep)
--
-- REVIEW BEFORE RUNNING, then run the whole file in the Supabase SQL Editor.
-- Guards abort with a message (rolling back the whole batch) rather than
-- silently constraining live data that would violate a rule.

-- ============================================================
-- 1. Drop the dead non_con_deck_* columns (superseded by company_decks)
-- ============================================================
-- No code reads or writes these eight columns; company_decks + DecksSection
-- replaced them and schema.sql backfilled the rows. The guard proves the
-- backfill really happened before anything is dropped.

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM deals d
  WHERE d.non_con_deck_path IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM company_decks cd WHERE cd.entity_type = 'deal' AND cd.entity_id = d.id);
  IF n > 0 THEN RAISE EXCEPTION '% deals still have an unmigrated non_con deck — run the company_decks backfill first', n; END IF;
  SELECT count(*) INTO n FROM portfolio_companies p
  WHERE p.non_con_deck_path IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM company_decks cd WHERE cd.entity_type = 'portfolio' AND cd.entity_id = p.id);
  IF n > 0 THEN RAISE EXCEPTION '% portfolio companies still have an unmigrated non_con deck — run the company_decks backfill first', n; END IF;
END $$;

DROP INDEX IF EXISTS deals_deck_token_key;
DROP INDEX IF EXISTS portfolio_deck_token_key;
ALTER TABLE deals
  DROP COLUMN IF EXISTS non_con_deck_path,
  DROP COLUMN IF EXISTS non_con_deck_name,
  DROP COLUMN IF EXISTS non_con_deck_token,
  DROP COLUMN IF EXISTS non_con_deck_shared_at;
ALTER TABLE portfolio_companies
  DROP COLUMN IF EXISTS non_con_deck_path,
  DROP COLUMN IF EXISTS non_con_deck_name,
  DROP COLUMN IF EXISTS non_con_deck_token,
  DROP COLUMN IF EXISTS non_con_deck_shared_at;

-- ============================================================
-- 2. Drop the dead auto-landscape columns on company_enrichment
-- ============================================================
-- Written by nothing, read by nothing — the manually curated
-- company_competitors table replaced the auto-generated landscape.

ALTER TABLE company_enrichment
  DROP COLUMN IF EXISTS competitors,
  DROP COLUMN IF EXISTS indication_used;

-- ============================================================
-- 3. portfolio_revenue.period_end becomes NOT NULL
-- ============================================================
-- The app always derives it from (period_type, fiscal_year) on save, and two
-- indexes plus both page queries order by it — a NULL sorts unpredictably.
-- Backfill uses the same mapping as REVENUE_PERIOD_END in lib/types.ts.

UPDATE portfolio_revenue SET period_end = (fiscal_year || '-' || CASE period_type
  WHEN 'Q1' THEN '03-31' WHEN 'Q2' THEN '06-30' WHEN 'Q3' THEN '09-30' WHEN 'Q4' THEN '12-31'
  WHEN 'H1' THEN '06-30' WHEN 'H2' THEN '12-31' ELSE '12-31' END)::date
WHERE period_end IS NULL;

ALTER TABLE portfolio_revenue ALTER COLUMN period_end SET NOT NULL;

-- ============================================================
-- 4. CHECK constraints for the remaining app-side enums
-- ============================================================
-- Each guard lists any value that would violate the constraint so a typo'd
-- legacy row gets FIXED rather than the constraint skipped.

DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(DISTINCT stage, ', ') INTO bad FROM deals
  WHERE stage NOT IN ('Passed', 'Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet', 'Invested');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'deals.stage has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM portfolio_companies
  WHERE status IS NOT NULL AND status NOT IN ('Active', 'Legacy', 'Exited');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_companies.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM catalysts
  WHERE status IS NOT NULL AND status NOT IN ('Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'catalysts.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM deal_investor_intros
  WHERE status IS NOT NULL AND status NOT IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'deal_investor_intros.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT status, ', ') INTO bad FROM portfolio_investor_intros
  WHERE status IS NOT NULL AND status NOT IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_investor_intros.status has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT field_type, ', ') INTO bad FROM custom_field_definitions
  WHERE field_type NOT IN ('text', 'number', 'date', 'select', 'boolean');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'custom_field_definitions.field_type has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT projected_source, ', ') INTO bad FROM portfolio_revenue
  WHERE projected_source IS NOT NULL
    AND projected_source NOT IN ('Company plan', 'Board deck', 'Management update', 'Investor update', 'Solas estimate');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_revenue.projected_source has out-of-enum values (including any resurrected ''Reforecast''): %', bad; END IF;

  SELECT string_agg(DISTINCT security_type, ', ') INTO bad FROM portfolio_fundraise_rounds
  WHERE security_type IS NOT NULL AND security_type NOT IN ('Priced equity', 'SAFE', 'Convertible note');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'portfolio_fundraise_rounds.security_type has out-of-enum values: %', bad; END IF;

  SELECT string_agg(DISTINCT security_type, ', ') INTO bad FROM deal_fundraise_rounds
  WHERE security_type IS NOT NULL AND security_type NOT IN ('Priced equity', 'SAFE', 'Convertible note');
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'deal_fundraise_rounds.security_type has out-of-enum values: %', bad; END IF;
END $$;

ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_stage_check;
ALTER TABLE deals ADD CONSTRAINT deals_stage_check
  CHECK (stage IN ('Passed', 'Sourced', 'Science Committee', 'Finance Committee', 'Investment Committee', 'Term Sheet', 'Invested'));

ALTER TABLE portfolio_companies DROP CONSTRAINT IF EXISTS portfolio_companies_status_check;
ALTER TABLE portfolio_companies ADD CONSTRAINT portfolio_companies_status_check
  CHECK (status IN ('Active', 'Legacy', 'Exited'));

ALTER TABLE catalysts DROP CONSTRAINT IF EXISTS catalysts_status_check;
ALTER TABLE catalysts ADD CONSTRAINT catalysts_status_check
  CHECK (status IN ('Pending', 'On Track', 'Done', 'Delayed', 'On Hold', 'Failed', 'Terminated'));

ALTER TABLE deal_investor_intros DROP CONSTRAINT IF EXISTS deal_investor_intros_status_check;
ALTER TABLE deal_investor_intros ADD CONSTRAINT deal_investor_intros_status_check
  CHECK (status IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested'));

ALTER TABLE portfolio_investor_intros DROP CONSTRAINT IF EXISTS portfolio_investor_intros_status_check;
ALTER TABLE portfolio_investor_intros ADD CONSTRAINT portfolio_investor_intros_status_check
  CHECK (status IN ('Introduced', 'Meeting Scheduled', 'In Diligence', 'Passed', 'Invested'));

ALTER TABLE custom_field_definitions DROP CONSTRAINT IF EXISTS custom_field_definitions_field_type_check;
ALTER TABLE custom_field_definitions ADD CONSTRAINT custom_field_definitions_field_type_check
  CHECK (field_type IN ('text', 'number', 'date', 'select', 'boolean'));

-- 'Reforecast' was deliberately retired by migration_revenue_revised.sql; this
-- makes that guarantee structural instead of conventional.
ALTER TABLE portfolio_revenue DROP CONSTRAINT IF EXISTS portfolio_revenue_projected_source_check;
ALTER TABLE portfolio_revenue ADD CONSTRAINT portfolio_revenue_projected_source_check
  CHECK (projected_source IN ('Company plan', 'Board deck', 'Management update', 'Investor update', 'Solas estimate'));

ALTER TABLE portfolio_fundraise_rounds DROP CONSTRAINT IF EXISTS portfolio_fundraise_rounds_security_type_check;
ALTER TABLE portfolio_fundraise_rounds ADD CONSTRAINT portfolio_fundraise_rounds_security_type_check
  CHECK (security_type IN ('Priced equity', 'SAFE', 'Convertible note'));

ALTER TABLE deal_fundraise_rounds DROP CONSTRAINT IF EXISTS deal_fundraise_rounds_security_type_check;
ALTER TABLE deal_fundraise_rounds ADD CONSTRAINT deal_fundraise_rounds_security_type_check
  CHECK (security_type IN ('Priced equity', 'SAFE', 'Convertible note'));
