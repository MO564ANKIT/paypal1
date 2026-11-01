/*
# Create player_saves and roast_requests tables

1. New Tables
- `player_saves`: one row per signed-in player holding their full Spendemon game state as JSON.
  - `user_id` (uuid, primary key, defaults to the signed-in user, references auth.users)
  - `state` (jsonb, required): expenses, budgets, monsters, quests, achievements, events
  - `updated_at` (timestamptz)
- `roast_requests`: one row per AI roast request, used to rate-limit each player.
  - `id` (bigint identity, primary key)
  - `user_id` (uuid, references auth.users, cascades on delete)
  - `created_at` (timestamptz)

2. Security
- Row level security is enabled on both tables.
- `player_saves`: signed-in users can read, create, update, and delete only their own row.
- `roast_requests`: no browser policies. Only the server-side roast function (service role) can read and write it.

3. Important notes
- Game progress moves from the browser into the database so it survives device changes and browser clears.
- Anonymous visitors have no access to either table.
*/

CREATE TABLE IF NOT EXISTS player_saves (
  user_id uuid PRIMARY KEY DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE player_saves ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON player_saves TO authenticated;

DROP POLICY IF EXISTS "select_own_player_save" ON player_saves;
CREATE POLICY "select_own_player_save" ON player_saves FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_player_save" ON player_saves;
CREATE POLICY "insert_own_player_save" ON player_saves FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_player_save" ON player_saves;
CREATE POLICY "update_own_player_save" ON player_saves FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_player_save" ON player_saves;
CREATE POLICY "delete_own_player_save" ON player_saves FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS roast_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS roast_requests_user_created_idx ON roast_requests (user_id, created_at);

ALTER TABLE roast_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON roast_requests TO service_role;
