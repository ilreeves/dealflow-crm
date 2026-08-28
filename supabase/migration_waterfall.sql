-- Quick waterfall (August 2026)
-- Per-entity Solas holdings on each share class, so the Ownership tab's quick
-- waterfall can break proceeds out by vehicle — the same company is held
-- through multiple Solas entities (funds, sidecars, H2Oey I/II), each with
-- different investors behind it, and ALL of them receive cash at an exit
-- regardless of carry treatment. Reference data, same standalone contract as
-- portfolio_share_classes: never feeds positions or Fund Performance.
-- Safe to run in a fresh Supabase SQL Editor tab.

-- A single-number solas_shares column briefly existed (never filled) before
-- the per-entity breakout replaced it.
ALTER TABLE portfolio_share_classes DROP COLUMN IF EXISTS solas_shares;

CREATE TABLE IF NOT EXISTS portfolio_class_holdings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id UUID REFERENCES portfolio_share_classes(id) ON DELETE CASCADE NOT NULL,
  -- Solas vehicle name, matching the fund names used on positions
  -- ("Fund II", "EHF", "Cryosa Sidecar", "H2Oey Ventures", ...).
  entity TEXT NOT NULL,
  shares NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE portfolio_class_holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Auth users can manage portfolio_class_holdings" ON portfolio_class_holdings;
CREATE POLICY "Auth users can manage portfolio_class_holdings" ON portfolio_class_holdings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS portfolio_class_holdings_class_id_idx ON portfolio_class_holdings (class_id);

-- Participating preferred takes its preference AND shares pro-rata (no
-- convert-or-take). Francis is the known case: its own waterfall model pays
-- "return of preference and then pro-rata proceeds".
ALTER TABLE portfolio_share_classes ADD COLUMN IF NOT EXISTS participating BOOLEAN;

-- Unconverted notes/SAFEs in the waterfall: a share-less 'Other' row with a
-- balance is modeled as converting at conversion_price when stated (e.g. the
-- CNXT/AFTx 2025A notes), else at a discount to the last round price — with a
-- 1x floor at its balance, which is the note's debt-like downside.
ALTER TABLE portfolio_share_classes ADD COLUMN IF NOT EXISTS convertible_balance NUMERIC;
ALTER TABLE portfolio_share_classes ADD COLUMN IF NOT EXISTS conversion_price NUMERIC;
