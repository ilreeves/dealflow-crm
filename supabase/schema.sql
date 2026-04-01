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
