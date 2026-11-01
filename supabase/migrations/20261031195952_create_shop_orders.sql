/*
# Create shop_orders table for PayPal sandbox checkout

1. New Tables
- `shop_orders`: one row per PayPal order started from the Loot Shop.
  - `id` (uuid, primary key)
  - `paypal_order_id` (text, unique): PayPal's order identifier
  - `item_ids` (text array): Loot Shop item ids in the order
  - `amount_cents` (integer, positive): total in US cents, computed by the server
  - `currency` (text): always USD for now
  - `status` (text): created, cancelled, completed, or failed
  - `paypal_capture_id` (text, optional): PayPal's capture identifier once paid
  - `created_at` / `updated_at` (timestamps)

2. Security
- Row level security is enabled with no policies, so the browser (anon or signed-in roles) cannot read or write orders directly.
- Only the server-side checkout function (service role) can touch this table, and it is granted only the verbs it uses.

3. Important notes
- Orders are created and captured exclusively by the server function, which is the only place prices are trusted.
*/

CREATE TABLE IF NOT EXISTS shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paypal_order_id text NOT NULL UNIQUE,
  item_ids text[] NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'cancelled', 'completed', 'failed')),
  paypal_capture_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE shop_orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON shop_orders TO service_role;
