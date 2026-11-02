/*
# Let the roast function read saved player progress

1. Security
- Grants the server-side roast function (service role) read access to `player_saves`. It uses this to work out budget figures itself instead of trusting numbers sent from the browser.
- Browsers still reach `player_saves` only through the owner-only policies; nothing changes for them.

2. Important notes
- Read-only grant. The roast function does not write game progress.
*/

GRANT SELECT ON player_saves TO service_role;
