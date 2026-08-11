-- Monthly pitch counts (August 2026): top of the dealflow funnel
--
-- The monthly email audit counts every inbound pitch that reaches the inbox —
-- hundreds a year, most of which never become CRM deals. One row per month
-- here turns the Analytics Dealflow section into the LP funnel:
-- pitches received → deals evaluated → invested.
--
-- Counts are DISTINCT COMPANIES per month (a company emailing three times is
-- one pitch), matching how the audit reports. Maintained from Settings →
-- Monthly Pitch Counts, or appended when the monthly audit runs.

CREATE TABLE IF NOT EXISTS monthly_pitch_counts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- First of the month, one row per month.
  month DATE NOT NULL UNIQUE,
  pitches INTEGER NOT NULL CHECK (pitches >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE monthly_pitch_counts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Auth users can manage monthly_pitch_counts" ON monthly_pitch_counts;
CREATE POLICY "Auth users can manage monthly_pitch_counts" ON monthly_pitch_counts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS update_monthly_pitch_counts_updated_at ON monthly_pitch_counts;
CREATE TRIGGER update_monthly_pitch_counts_updated_at
  BEFORE UPDATE ON monthly_pitch_counts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Backfill from the 2026 YTD audit CSV (distinct companies per month, as of
-- 2026-08-11). DO NOTHING so re-runs never clobber a hand-corrected figure.
INSERT INTO monthly_pitch_counts (month, pitches) VALUES
  ('2026-01-01', 8),
  ('2026-02-01', 61),
  ('2026-03-01', 36),
  ('2026-04-01', 45),
  ('2026-05-01', 24),
  ('2026-06-01', 25),
  ('2026-07-01', 24)
ON CONFLICT (month) DO NOTHING;
