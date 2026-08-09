-- Clearing a runway "check" flag (August 2026)
--
-- WHY: the check badge fires when a company's STATED runway and its own
-- cash ÷ burn disagree materially. That gap is frequently legitimate rather
-- than an error — burn is forecast to ramp with a commercial launch, or to fall
-- after a trial completes — so the flag is a prompt to read the note, not a
-- defect. Three of the current five are known-good by design:
--   iO Urology   — burn ramps $495k → $1,084k/mo through the Gen 2 launch, so a
--                  flat cash ÷ burn reads ~12 months against a stated ~8.
--   InterShunt   — burn roughly triples as the pivotal enrols.
--   Basking      — cash came off the runway chart, not the balance sheet.
-- With no way to clear them the badges become wallpaper, and a badge everyone
-- ignores is worse than no badge: the one that matters stops being visible.
--
-- The acknowledgement records the PERCENTAGE that was accepted, not a boolean.
-- A boolean would stay stuck once set — someone clears a 159% gap, the figures
-- are later edited into a 400% gap, and the flag never returns. Storing the
-- reviewed value lets the flag come back when the disagreement materially
-- changes, which is the only time it has anything new to say.
--
-- Note that acknowledgements live on the cash ROW, so a new observation starts
-- unacknowledged by construction — a fresh balance deserves a fresh look.
--
-- Safe to run in a fresh Supabase SQL Editor tab. Idempotent.

ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_ack_pct NUMERIC;
ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_ack_note TEXT;
ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_acked_at TIMESTAMPTZ;
ALTER TABLE portfolio_cash ADD COLUMN IF NOT EXISTS mismatch_acked_by UUID REFERENCES auth.users(id);

COMMENT ON COLUMN portfolio_cash.mismatch_ack_pct IS
  'The stated-vs-derived runway gap (%) that was reviewed and accepted. The flag returns if the gap moves materially away from this — see MISMATCH_ACK_DRIFT_PCT in lib/runway.ts.';
COMMENT ON COLUMN portfolio_cash.mismatch_ack_note IS
  'Why the gap is expected. The whole point of clearing a flag rather than suppressing it: the reasoning is the thing worth keeping.';
COMMENT ON COLUMN portfolio_cash.mismatch_acked_at IS
  'When the gap was accepted. NULL means never reviewed.';
COMMENT ON COLUMN portfolio_cash.mismatch_acked_by IS
  'Who accepted it. Pairs with updated_by from migration_runway_audit.sql.';
