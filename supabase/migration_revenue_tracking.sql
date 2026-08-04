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
