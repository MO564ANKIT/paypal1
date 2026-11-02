# Spendemon

Spendemon is a budgeting game. Log expenses to level up spending monsters, complete daily and weekly quests, check purchases in the Money Lab before you buy, and chat with an AI roaster that answers using your real budget numbers. Progress is saved to your account, and a PayPal sandbox checkout handles Loot Shop purchases.

## Features

- **Budget tracking:** monthly and category budgets with live remaining amounts.
- **Monster progression:** each spending category feeds a monster that levels up as you log expenses.
- **Quests and streaks:** daily and weekly goals with rewards, plus a logging streak.
- **Money Lab:** simulate a purchase before you make it and see whether it fits your budgets.
- **Roast Chat:** an AI roaster (Gemini) that reads your budget on the server. The browser never sends financial figures.
- **Loot Shop:** items paid through PayPal Orders v2 in the sandbox, with server-side pricing and verification.

## Tech stack

- React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Lucide icons
- Supabase: email/password auth, Postgres with row-level security, and Edge Functions (Deno)
- PayPal REST API (sandbox), Google Gemini API
- Vitest for automated tests

## Local setup

1. Install dependencies with `npm install`.
2. Create a `.env` file in the project root:

   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

3. Start the app with `npm run dev`.

The anon key is safe to ship to the browser. Row-level security protects every table.

## Supabase setup

Apply the migrations in `supabase/migrations/` in order. They create:

- `player_saves`: one save per user, with a version number that prevents overwriting newer progress from another tab or device. Owner-only access.
- `roast_requests`: hourly roast counter, readable only by the service role.
- `shop_orders`: Loot Shop orders tied to the buyer, with the states `created`, `capturing`, `completed`, `failed`, and `cancelled`.

In the Supabase dashboard, turn off email confirmation under Authentication, then Providers, then Email, so new accounts can sign in right away.

## Edge Function secrets

Set these in Supabase under Project Settings, then Edge Functions, then Secrets. Do not put them in the frontend `.env`.

| Secret | Used by | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | `roast-chat` | Gemini `generateContent` calls |
| `PAYPAL_CLIENT_ID` | `paypal-checkout` | PayPal sandbox OAuth |
| `PAYPAL_CLIENT_SECRET` | `paypal-checkout` | PayPal sandbox OAuth |

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are provided to functions automatically.

## Deploying the Edge Functions

Deploy `roast-chat` and `paypal-checkout` from `supabase/functions/`. Both have `verify_jwt = false` in `supabase/config.toml` and check the user's session token inside the function, so requests without a valid sign-in are rejected with a 401.

## How the security model works

- **Money stays on the server.** Loot Shop prices live in the `paypal-checkout` function. The browser sends only item IDs, and the amount is recalculated and checked against PayPal's capture before an order is recorded as paid.
- **Single-flight capture.** An order is claimed before PayPal is called, so repeated or parallel capture requests cannot charge twice. A claim expires after two minutes so a crashed request can be retried.
- **Ownership checks.** Every order lookup is scoped to the signed-in user, so one account cannot capture or cancel another account's order.
- **Rate limits.** Checkouts are limited to 10 per user per hour and roasts to 30 per user per hour.
- **AI facts from the server.** The roaster computes budget figures from the saved progress on the server. Message length, history length, and the date are validated before any request is made to Gemini.
- **Keys stay server-side.** The Gemini and PayPal secrets are read only inside Edge Functions.
- **CORS.** Functions allow any origin because they authenticate with a bearer token rather than cookies, so a foreign page cannot act for a signed-in user without that token.

## Testing

```
npm test
```

The tests cover budget totals and purchase verdicts, quest progress, the server-side roast facts (including parity with the in-app simulator), and PayPal payment verification (amount, currency, and pending or tampered captures).

Other checks:

```
npm run typecheck
npm run lint
npm run build
```

## Testing the PayPal sandbox

Use a sandbox buyer account from the PayPal Developer dashboard. Check these cases:

1. Approve a purchase and confirm the return page lists the items you bought and the total.
2. Cancel on the PayPal page and confirm nothing is charged.
3. Reload the return page and confirm the order is not charged or recorded twice.
4. Try a different signed-in account with the same order ID and confirm it is refused.

## Project layout

- `src/` is the React app. Game rules live in `src/lib/` and are pure functions with tests.
- `supabase/functions/` holds the Edge Functions. `roast-chat/budgetFacts.ts` and `paypal-checkout/verification.ts` contain the logic that is unit tested.
- `supabase/migrations/` holds the database schema.

## License

MIT. See [LICENSE](./LICENSE).
