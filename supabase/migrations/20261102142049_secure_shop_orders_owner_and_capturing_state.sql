/*
# Secure shop_orders: owner column and capturing state

1. Modified Tables
- `shop_orders`
  - New column `user_id` (uuid, references auth.users, cascades on delete). Every new order is tied to the signed-in player who created it. Existing sandbox rows keep an empty owner and can no longer be captured by anyone.
  - Status now also allows `capturing`, which marks an order whose capture is in progress. This lets only one request capture a given order at a time.

2. Security
- No grant or policy changes. The table stays closed to browsers; only the server function (service role) reads and writes it, and it always filters by the owner.

3. Important notes
- Adds an index so the per-player order limit can be counted quickly.
- Existing data is kept as is.
*/

ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE shop_orders DROP CONSTRAINT IF EXISTS shop_orders_status_check;
ALTER TABLE shop_orders ADD CONSTRAINT shop_orders_status_check
  CHECK (status IN ('created', 'capturing', 'cancelled', 'completed', 'failed'));

CREATE INDEX IF NOT EXISTS shop_orders_user_created_idx ON shop_orders (user_id, created_at);
