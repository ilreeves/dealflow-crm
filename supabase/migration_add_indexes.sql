-- Performance indexes (July 2026)
-- Postgres does NOT auto-index foreign-key columns, so every lookup below was a
-- sequential scan. These add btree indexes on the FK / filter / order columns the
-- app actually queries. All are IF NOT EXISTS and non-destructive — safe to run in
-- a fresh Supabase SQL Editor tab. On small tables they're instant; they pay off as
-- the append-only tables (deal_activity, catalyst_activity, deck_views) grow.

-- Per-deal detail lookups (opened when a deal modal/tab is viewed)
CREATE INDEX IF NOT EXISTS deal_files_deal_id_idx        ON deal_files (deal_id);
CREATE INDEX IF NOT EXISTS deal_notes_deal_id_idx        ON deal_notes (deal_id);
CREATE INDEX IF NOT EXISTS deal_meetings_deal_id_idx     ON deal_meetings (deal_id);
CREATE INDEX IF NOT EXISTS meeting_notes_meeting_id_idx  ON meeting_notes (meeting_id);
CREATE INDEX IF NOT EXISTS meeting_files_meeting_id_idx  ON meeting_files (meeting_id);
CREATE INDEX IF NOT EXISTS deal_investor_intros_deal_id_idx ON deal_investor_intros (deal_id);

-- Per-portfolio-company detail lookups
CREATE INDEX IF NOT EXISTS portfolio_fundraise_rounds_company_id_idx ON portfolio_fundraise_rounds (company_id);
CREATE INDEX IF NOT EXISTS portfolio_positions_company_id_idx        ON portfolio_positions (company_id);
CREATE INDEX IF NOT EXISTS portfolio_positions_round_id_idx          ON portfolio_positions (round_id);
CREATE INDEX IF NOT EXISTS portfolio_valuation_marks_company_id_idx  ON portfolio_valuation_marks (company_id);
CREATE INDEX IF NOT EXISTS portfolio_investor_intros_company_id_idx  ON portfolio_investor_intros (company_id);

-- Activity feeds (append-only; grow fastest — order by created_at)
CREATE INDEX IF NOT EXISTS deal_activity_deal_id_idx            ON deal_activity (deal_id);
CREATE INDEX IF NOT EXISTS deal_activity_action_created_at_idx  ON deal_activity (action, created_at DESC);
CREATE INDEX IF NOT EXISTS catalyst_activity_created_at_idx     ON catalyst_activity (created_at DESC);

-- Catalysts (filtered by company, ordered by date on every calendar/detail load)
CREATE INDEX IF NOT EXISTS catalysts_company_name_idx  ON catalysts (company_name);
CREATE INDEX IF NOT EXISTS catalysts_catalyst_date_idx ON catalysts (catalyst_date);

-- List options (read on nearly every page/settings load)
CREATE INDEX IF NOT EXISTS list_options_list_key_idx ON list_options (list_key);
