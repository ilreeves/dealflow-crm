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
