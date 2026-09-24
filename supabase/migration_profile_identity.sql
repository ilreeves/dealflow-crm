-- ============================================================
-- Show who each account actually is in Settings → Team Members (2026-09-24)
--
-- Team Members listed five of seven accounts as "Unnamed user": profiles only
-- carried full_name, and most people never set one. With public sign-up open
-- until 2026-09-24 (every RLS policy is `authenticated USING (true)`, so any
-- self-registered account had full access), "who can get in" has to be
-- answerable from inside the CRM — not only from the Supabase dashboard.
--
-- Adds three read-only mirrors of auth.users onto profiles: email, joined_at
-- and last_sign_in_at. They are kept in sync by triggers on auth.users, and
-- users are prevented from editing them (column-level grants below), so a
-- member can't relabel their own row. full_name stays user-editable.
--
-- Safe to re-run: every step is idempotent.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_sign_in_at TIMESTAMPTZ;

-- Backfill existing rows, and create a row for any auth user that never got
-- one (the signup trigger predates some accounts) so nobody with access is
-- missing from the list.
UPDATE profiles p
   SET email = u.email, joined_at = u.created_at, last_sign_in_at = u.last_sign_in_at
  FROM auth.users u
 WHERE u.id = p.id;

INSERT INTO profiles (id, full_name, email, joined_at, last_sign_in_at)
SELECT u.id, u.raw_user_meta_data->>'full_name', u.email, u.created_at, u.last_sign_in_at
  FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- New accounts: same as before, plus the identity columns.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, joined_at, last_sign_in_at)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email, NEW.created_at, NEW.last_sign_in_at)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Existing accounts: follow email changes and sign-ins. last_sign_in_at moves
-- on an actual sign-in, not on every token refresh, so this fires rarely.
CREATE OR REPLACE FUNCTION sync_profile_from_auth()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.profiles
     SET email = NEW.email, last_sign_in_at = NEW.last_sign_in_at
   WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_updated ON auth.users;
CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE OF email, last_sign_in_at ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_profile_from_auth();

-- Users may write only their own name. Table-level INSERT/UPDATE would let a
-- member overwrite their own email/sign-in columns through the REST API; the
-- column grants keep exactly what ProfileSettings' upsert of {id, full_name}
-- needs (PostgREST's upsert SETs every column it sends, id included). The
-- SECURITY DEFINER triggers above are unaffected.
REVOKE INSERT, UPDATE ON profiles FROM authenticated;
GRANT INSERT (id, full_name) ON profiles TO authenticated;
GRANT UPDATE (id, full_name, updated_at) ON profiles TO authenticated;

-- Verify: every auth user should now have a row with an email.
SELECT count(*) AS auth_users,
       count(p.id) AS with_profile,
       count(p.email) AS with_email
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id;
