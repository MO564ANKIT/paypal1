/*
# Add version counter to player_saves

1. Modified Tables
- `player_saves`: new column `version` (integer, not null, default 1). It increases by one every time the saved game is updated.

2. Security
- No policy or grant changes. The existing owner-only policies and the authenticated grants continue to apply to the new column.

3. Important notes
- The version lets the app detect when progress was changed from another tab or device, so an older copy cannot overwrite newer progress.
- Existing rows receive version 1 automatically. No data is changed.
*/

ALTER TABLE player_saves ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
