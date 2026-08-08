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
