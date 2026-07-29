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
