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
