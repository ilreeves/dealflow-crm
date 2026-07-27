-- Tie non-confidential decks to a fundraising round (July 2026)
-- The deck label was free text; it can now point at an actual round so renaming
-- the round updates the deck label, share slug, and share email.
-- round_id is polymorphic (portfolio_fundraise_rounds OR deal_fundraise_rounds,
-- per entity_type) so it carries no FK — matching the existing entity_id pattern.
-- `label` is kept as a snapshot/fallback for decks with no linked round.
-- Safe to run in a fresh Supabase SQL Editor tab.

ALTER TABLE company_decks ADD COLUMN IF NOT EXISTS round_id UUID;
CREATE INDEX IF NOT EXISTS company_decks_round_id_idx ON company_decks (round_id);

-- Auto-link existing decks whose free-text label already matches a round name
-- (e.g. a deck labelled "Series B" on a company that has a "Series B" round).
UPDATE company_decks cd
SET round_id = r.id
FROM portfolio_fundraise_rounds r
WHERE cd.entity_type = 'portfolio'
  AND cd.entity_id = r.company_id
  AND cd.round_id IS NULL
  AND lower(trim(cd.label)) = lower(trim(r.round_name));

UPDATE company_decks cd
SET round_id = r.id
FROM deal_fundraise_rounds r
WHERE cd.entity_type = 'deal'
  AND cd.entity_id = r.deal_id
  AND cd.round_id IS NULL
  AND lower(trim(cd.label)) = lower(trim(r.round_name));
