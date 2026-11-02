import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { centsToValue, verifyPayment, type PaypalOrderBody } from "./verification.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYPAL_API = "https://api-m.sandbox.paypal.com";
const ORDER_ID_PATTERN = /^[A-Z0-9]{10,30}$/;
const MAX_CART_ITEMS = 20;
const MAX_ORDERS_PER_HOUR = 10;
const CAPTURE_LEASE_MS = 2 * 60 * 1000;

// Server-side price list: the only prices that are ever charged.
const CATALOGUE: Record<string, { priceUsdCents: number }> = {
  "neon-hoodie": { priceUsdCents: 2499 },
  "glow-sneakers": { priceUsdCents: 3499 },
  "cold-brew-voucher": { priceUsdCents: 499 },
  "chaos-headphones": { priceUsdCents: 2999 },
  "crystal-sticker-pack": { priceUsdCents: 299 },
  "monster-plushie": { priceUsdCents: 899 },
};

interface OrderRow {
  paypal_order_id: string;
  item_ids: string[];
  amount_cents: number;
  currency: string;
  status: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

async function authenticate(req: Request, db: SupabaseClient): Promise<string | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PayPal credentials are not configured");

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || typeof data?.access_token !== "string") {
    throw new Error(`PayPal authentication failed (${response.status})`);
  }
  return data.access_token;
}

async function fetchPaypalOrder(accessToken: string, orderId: string): Promise<PaypalOrderBody | null> {
  const response = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return response.ok ? await response.json().catch(() => null) : null;
}

async function createOrder(req: Request, db: SupabaseClient, userId: string, itemIds: unknown): Promise<Response> {
  if (
    !Array.isArray(itemIds) ||
    itemIds.length === 0 ||
    itemIds.length > MAX_CART_ITEMS ||
    !itemIds.every((id) => typeof id === "string" && Object.hasOwn(CATALOGUE, id))
  ) {
    return json({ error: "Your cart has an item we do not recognise. Remove it and try again." }, 400);
  }

  const origin = req.headers.get("origin");
  if (!origin) return json({ error: "Checkout could not determine where to return you." }, 400);

  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await db
    .from("shop_orders")
    .select("paypal_order_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStart);
  if (countError) throw countError;
  if ((count ?? 0) >= MAX_ORDERS_PER_HOUR) {
    return json({ error: "You have started too many checkouts this hour. Please try again later." }, 429);
  }

  const ids = [...new Set(itemIds as string[])];
  const amountCents = ids.reduce((sum, id) => sum + CATALOGUE[id].priceUsdCents, 0);
  const accessToken = await getAccessToken();

  const orderResponse = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: "loot-shop",
          description: "Loot Shop order",
          amount: { currency_code: "USD", value: centsToValue(amountCents) },
        },
      ],
      application_context: {
        brand_name: "Spendemon",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: `${origin}/?paypal=return`,
        cancel_url: `${origin}/?paypal=cancel`,
      },
    }),
  });
  const order = await orderResponse.json().catch(() => null);
  const approveUrl = Array.isArray(order?.links)
    ? order.links.find((link: { rel?: string }) => link.rel === "payer-action" || link.rel === "approve")?.href
    : undefined;
  if (!orderResponse.ok || typeof order?.id !== "string" || typeof approveUrl !== "string") {
    return json({ error: "PayPal could not start this order. Please try again." }, 502);
  }

  const { error } = await db.from("shop_orders").insert({
    paypal_order_id: order.id,
    user_id: userId,
    item_ids: ids,
    amount_cents: amountCents,
    currency: "USD",
    status: "created",
  });
  if (error) throw error;

  return json({ orderId: order.id, approveUrl });
}

async function captureOrder(db: SupabaseClient, userId: string, orderId: unknown): Promise<Response> {
  if (typeof orderId !== "string" || !ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: "That payment reference is not valid." }, 400);
  }

  const leaseCutoff = new Date(Date.now() - CAPTURE_LEASE_MS).toISOString();
  const { data: claimed, error: claimError } = await db
    .from("shop_orders")
    .update({ status: "capturing", updated_at: new Date().toISOString() })
    .eq("paypal_order_id", orderId)
    .eq("user_id", userId)
    .or(`status.eq.created,and(status.eq.capturing,updated_at.lt.${leaseCutoff})`)
    .select("paypal_order_id, item_ids, amount_cents, currency, status")
    .maybeSingle();
  if (claimError) throw claimError;

  if (!claimed) {
    const { data: order, error: lookupError } = await db
      .from("shop_orders")
      .select("paypal_order_id, item_ids, amount_cents, currency, status")
      .eq("paypal_order_id", orderId)
      .eq("user_id", userId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (!order) return json({ error: "We could not find this order." }, 404);
    if (order.status === "completed") {
      return json({ status: "completed", orderId, itemIds: order.item_ids, amountCents: order.amount_cents });
    }
    if (order.status === "capturing") {
      return json({ status: "pending", orderId, message: "Your payment is still being confirmed. Please try again in a moment." });
    }
    return json({ status: order.status, orderId, message: "This order can no longer be paid." });
  }

  const order = claimed as OrderRow;
  const accessToken = await getAccessToken();
  const captureResponse = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": `capture-${orderId}`,
    },
  });
  let body: PaypalOrderBody | null = await captureResponse.json().catch(() => null);
  if (!captureResponse.ok) {
    body = await fetchPaypalOrder(accessToken, orderId);
  }

  const { verified, captureId, capturePending } = verifyPayment(body, {
    amountCents: order.amount_cents,
    currency: order.currency,
  });
  const stillPayable = body?.status === "APPROVED" || body?.status === "CREATED";

  if (!verified && capturePending) {
    return json({ status: "pending", orderId, message: "Your payment is still being confirmed. Please try again in a moment." });
  }

  const { error: updateError } = await db
    .from("shop_orders")
    .update({
      status: verified ? "completed" : stillPayable ? "created" : "failed",
      paypal_capture_id: captureId,
      updated_at: new Date().toISOString(),
    })
    .eq("paypal_order_id", orderId)
    .eq("user_id", userId)
    .eq("status", "capturing");
  if (updateError) throw updateError;

  if (!verified) {
    const message = stillPayable
      ? "Payment was not completed. You can try again."
      : "PayPal did not confirm this payment, so nothing was recorded.";
    return json({ status: "failed", orderId, message });
  }
  return json({ status: "completed", orderId, itemIds: order.item_ids, amountCents: order.amount_cents });
}

async function cancelOrder(db: SupabaseClient, userId: string, orderId: unknown): Promise<Response> {
  if (typeof orderId !== "string" || !ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: "That payment reference is not valid." }, 400);
  }
  const { data, error } = await db
    .from("shop_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("paypal_order_id", orderId)
    .eq("user_id", userId)
    .eq("status", "created")
    .select("paypal_order_id")
    .maybeSingle();
  if (error) throw error;
  if (!data) return json({ error: "We could not find this order." }, 404);
  return json({ status: "cancelled", orderId });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const db = adminClient();
    const userId = await authenticate(req, db);
    if (!userId) return json({ error: "Sign in to continue checkout." }, 401);

    const body = await req.json().catch(() => null);
    switch (body?.action) {
      case "create":
        return await createOrder(req, db, userId, body.itemIds);
      case "capture":
        return await captureOrder(db, userId, body.orderId);
      case "cancel":
        return await cancelOrder(db, userId, body.orderId);
      default:
        return json({ error: "Unknown checkout action." }, 400);
    }
  } catch (err) {
    console.error("paypal-checkout failed", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Something went wrong with the payment service. Please try again." }, 500);
  }
});
