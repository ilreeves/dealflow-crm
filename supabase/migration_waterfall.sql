-- Quick waterfall (August 2026)
-- Per-class Solas share counts on the cap table, so the Ownership tab's quick
-- waterfall can compute Solas proceeds at a hypothetical exit — not just
-- class-level payouts. Reference data, same standalone contract as the rest of
-- portfolio_share_classes: never feeds positions or Fund Performance.
-- Safe to run in a fresh Supabase SQL Editor tab.

ALTER TABLE portfolio_share_classes ADD COLUMN IF NOT EXISTS solas_shares NUMERIC;
