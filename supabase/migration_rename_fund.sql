-- Rename a fund / vehicle everywhere, atomically (September 2026)
--
-- A fund name is free text copied into several tables, not a foreign key. On
-- 2026-09-16 "Solas/Sower" was renamed to "Sower Solas II" by hand and
-- portfolio_companies.funds was missed, so five portfolio cards kept the old
-- tag for a week. This function is the one place that knows every column a
-- fund name lives in, and a plpgsql body runs in a single transaction, so a
-- rename either lands everywhere or nowhere. Settings → Fund / Vehicle
-- Options calls it via supabase.rpc('rename_fund', ...).
--
-- Columns renamed (exact, case-sensitive match on old_name):
--   list_options.value            list_key 'fund' AND 'spv_fund' — SPV
--                                 membership follows the rename
--   portfolio_positions.fund
--   portfolio_positions.lookthrough_of   names a vehicle, can equal a fund
--   portfolio_companies.funds     text[] tags: replaced in place, order kept,
--                                 duplicates dropped
--   portfolio_class_holdings.entity      cap-table holdings by Solas entity
--   fund_snapshots.fund
-- NOT renamed: free-text notes and deal_activity history ("Invested via
-- Solas/Sower") — those are records of what was written at the time.
-- Code fallbacks (lib/listOptions.ts FALLBACK_LISTS, PortfolioBoard's
-- FUND_ORDER) only apply when list_options is empty and are edited by hand.
--
-- Refused, with a message:
--   * blank or unchanged new name
--   * a new name already in use anywhere above (case-insensitive) — that is a
--     MERGE of two funds, not a rename. list_options has a unique index on
--     (list_key, lower(value)) and fund_snapshots is UNIQUE (as_of_date, fund,
--     company_name), so a merge needs a human decision on which rows win.
--     A case-only rename ("Fund Ii" → "Fund II") is allowed.
--   * an old name that appears nowhere (likely a typo)
--
-- SECURITY INVOKER: RLS already lets authenticated users write every one of
-- these tables, so the function needs no more privilege than the caller has.
-- Returns per-column row counts as jsonb.
-- Safe to re-run (CREATE OR REPLACE) in a fresh Supabase SQL Editor tab.

CREATE OR REPLACE FUNCTION rename_fund(old_name text, new_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  new_trim text := btrim(coalesce(new_name, ''));
  in_use   text;
  n_fund int; n_spv int; n_pos int; n_look int; n_tags int; n_hold int; n_snap int;
BEGIN
  IF old_name IS NULL OR btrim(old_name) = '' THEN
    RAISE EXCEPTION 'Current fund name is blank.';
  END IF;
  IF new_trim = '' THEN
    RAISE EXCEPTION 'New fund name is blank.';
  END IF;
  IF length(new_trim) > 100 THEN
    RAISE EXCEPTION 'New fund name is longer than 100 characters.';
  END IF;
  IF new_trim = old_name THEN
    RAISE EXCEPTION 'New name is the same as the current name.';
  END IF;

  -- Any OTHER spelling of the new name already in use means this would merge
  -- two funds. "value <> old_name" leaves a case-only rename of the fund's
  -- own rows alone.
  SELECT src INTO in_use FROM (
    SELECT 'the ' || CASE list_key WHEN 'spv_fund' THEN 'SPV / Sidecar' ELSE 'Fund / Vehicle' END || ' list' AS src
      FROM list_options
     WHERE list_key IN ('fund', 'spv_fund') AND value <> old_name AND lower(value) = lower(new_trim)
    UNION ALL
    SELECT 'portfolio positions (fund)' FROM portfolio_positions
     WHERE fund <> old_name AND lower(fund) = lower(new_trim)
    UNION ALL
    SELECT 'portfolio positions (look-through)' FROM portfolio_positions
     WHERE lookthrough_of <> old_name AND lower(lookthrough_of) = lower(new_trim)
    UNION ALL
    SELECT 'portfolio company fund tags' FROM portfolio_companies, unnest(funds) AS t(tag)
     WHERE tag <> old_name AND lower(tag) = lower(new_trim)
    UNION ALL
    SELECT 'cap-table holdings' FROM portfolio_class_holdings
     WHERE entity <> old_name AND lower(entity) = lower(new_trim)
    UNION ALL
    SELECT 'fund snapshots' FROM fund_snapshots
     WHERE fund <> old_name AND lower(fund) = lower(new_trim)
  ) hits
  LIMIT 1;
  IF in_use IS NOT NULL THEN
    RAISE EXCEPTION '"%" is already used in %. Renaming onto it would merge two funds — that has to be done by hand.', new_trim, in_use;
  END IF;

  UPDATE list_options SET value = new_trim WHERE list_key = 'fund' AND value = old_name;
  GET DIAGNOSTICS n_fund = ROW_COUNT;
  UPDATE list_options SET value = new_trim WHERE list_key = 'spv_fund' AND value = old_name;
  GET DIAGNOSTICS n_spv = ROW_COUNT;
  UPDATE portfolio_positions SET fund = new_trim WHERE fund = old_name;
  GET DIAGNOSTICS n_pos = ROW_COUNT;
  UPDATE portfolio_positions SET lookthrough_of = new_trim WHERE lookthrough_of = old_name;
  GET DIAGNOSTICS n_look = ROW_COUNT;
  -- Replace in place, keep the first occurrence of each tag in its original
  -- position (so a card's tag order doesn't shuffle).
  UPDATE portfolio_companies pc
     SET funds = (
       SELECT array_agg(tag ORDER BY first_pos)
         FROM (
           SELECT tag, min(pos) AS first_pos
             FROM unnest(array_replace(pc.funds, old_name, new_trim)) WITH ORDINALITY AS u(tag, pos)
            GROUP BY tag
         ) d
     )
   WHERE old_name = ANY (pc.funds);
  GET DIAGNOSTICS n_tags = ROW_COUNT;
  UPDATE portfolio_class_holdings SET entity = new_trim WHERE entity = old_name;
  GET DIAGNOSTICS n_hold = ROW_COUNT;
  UPDATE fund_snapshots SET fund = new_trim WHERE fund = old_name;
  GET DIAGNOSTICS n_snap = ROW_COUNT;

  IF n_fund + n_spv + n_pos + n_look + n_tags + n_hold + n_snap = 0 THEN
    RAISE EXCEPTION '"%" isn''t used anywhere — nothing to rename.', old_name;
  END IF;

  RETURN jsonb_build_object(
    'old_name', old_name,
    'new_name', new_trim,
    'list_options_fund', n_fund,
    'list_options_spv_fund', n_spv,
    'portfolio_positions_fund', n_pos,
    'portfolio_positions_lookthrough_of', n_look,
    'portfolio_companies_funds', n_tags,
    'portfolio_class_holdings_entity', n_hold,
    'fund_snapshots_fund', n_snap
  );
END;
$$;

-- Functions are executable by PUBLIC (and so anon) by default. RLS would stop
-- an anon write anyway; don't leave the door open.
REVOKE ALL ON FUNCTION rename_fund(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rename_fund(text, text) TO authenticated;

-- PostgREST caches the schema; without this the new function can 404
-- (PGRST202) for a short while after creation.
NOTIFY pgrst, 'reload schema';

-- Verify: should return one row, security_invoker = true.
SELECT proname, NOT prosecdef AS security_invoker
FROM pg_proc WHERE proname = 'rename_fund';
