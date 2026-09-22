-- Drop the deals.inbound flag (2026-09-21)
--
-- The flag recorded "did this pitch come to us, or did we source it?". That
-- distinction does not exist at Solas: we don't source companies ourselves,
-- so every deal in the pipeline arrived inbound by definition. The column was
-- effectively unused — 59 of 60 rows NULL, one classified true — and the
-- single classified row was enough to switch on an "Inbound" column in the
-- Analytics dealflow table, which then read as "1 of 60 deals were inbound"
-- when the truth is all of them were.
--
-- The UI control was removed from components/deals/DealForm.tsx, and the
-- Analytics reads were removed from app/(dashboard)/analytics/page.tsx. The
-- monthly inbound-pitch EMAIL audit (monthly_pitch_counts, Settings → Monthly
-- Pitch Counts) is a separate mechanism and is unaffected.
--
-- Pre-drop values are backed up alongside this run; only Grann Pharmaceuticals
-- carried a non-NULL value (true).

ALTER TABLE deals DROP COLUMN IF EXISTS inbound;
