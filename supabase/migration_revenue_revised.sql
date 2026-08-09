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
