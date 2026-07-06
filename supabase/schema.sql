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
