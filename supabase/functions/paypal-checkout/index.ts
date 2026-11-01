import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PAYPAL_API = "https://api-m.sandbox.paypal.com";
const ORDER_ID_PATTERN = /^[A-Z0-9]{10,30}$/;
const MAX_CART_ITEMS = 20;

// Server-side price list: the only prices that are ever charged.
const CATALOGUE: Record<string, { priceUsdCents: number }> = {
  "neon-hoodie": { priceUsdCents: 2499 },
  "glow-sneakers": { priceUsdCents: 3499 },
  "cold-brew-voucher": { priceUsdCents: 499 },
  "chaos-headphones": { priceUsdCents: 2999 },
  "crystal-sticker-pack": { priceUsdCents: 299 },
  "monster-plushie": { priceUsdCents: 899 },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function centsToValue(cents: number): string {
  return (cents / 100).toFixed(2);
}

function valueToCents(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d+\.\d{2}$/.test(value)) return null;
  return Math.round(Number(value) * 100);
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

async function createOrder(req: Request, itemIds: unknown): Promise<Response> {
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

  const { error } = await serviceClient().from("shop_orders").insert({
    paypal_order_id: order.id,
    item_ids: ids,
    amount_cents: amountCents,
    currency: "USD",
    status: "created",
  });
  if (error) throw error;

  return json({ orderId: order.id, approveUrl });
}

async function captureOrder(orderId: unknown): Promise<Response> {
  if (typeof orderId !== "string" || !ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: "That payment reference is not valid." }, 400);
  }

  const db = serviceClient();
  const { data: order, error: lookupError } = await db
    .from("shop_orders")
    .select("item_ids, amount_cents, currency, status")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!order) return json({ error: "We could not find this order." }, 404);

  if (order.status === "completed") {
    return json({ status: "completed", orderId, itemIds: order.item_ids, amountCents: order.amount_cents });
  }
  if (order.status !== "created") {
    return json({ status: order.status, orderId, message: "This order can no longer be paid." });
  }

  const accessToken = await getAccessToken();
  const captureResponse = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "PayPal-Request-Id": crypto.randomUUID(),
    },
  });
  const capture = await captureResponse.json().catch(() => null);
  const captured = capture?.purchase_units?.[0]?.payments?.captures?.[0];
  const capturedCents = valueToCents(captured?.amount?.value);

  const verified =
    captureResponse.ok &&
    capture?.status === "COMPLETED" &&
    captured?.status === "COMPLETED" &&
    captured?.amount?.currency_code === order.currency &&
    capturedCents === order.amount_cents;

  const nextStatus = verified ? "completed" : "failed";
  const { error: updateError } = await db
    .from("shop_orders")
    .update({
      status: nextStatus,
      paypal_capture_id: typeof captured?.id === "string" ? captured.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq("paypal_order_id", orderId)
    .eq("status", "created");
  if (updateError) throw updateError;

  if (!verified) {
    return json({ status: "failed", orderId, message: "PayPal did not confirm this payment, so nothing was recorded." });
  }
  return json({ status: "completed", orderId, itemIds: order.item_ids, amountCents: order.amount_cents });
}

async function cancelOrder(orderId: unknown): Promise<Response> {
  if (typeof orderId !== "string" || !ORDER_ID_PATTERN.test(orderId)) {
    return json({ error: "That payment reference is not valid." }, 400);
  }
  const { error } = await serviceClient()
    .from("shop_orders")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("paypal_order_id", orderId)
    .eq("status", "created");
  if (error) throw error;
  return json({ status: "cancelled", orderId });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    switch (body?.action) {
      case "create":
        return await createOrder(req, body.itemIds);
      case "capture":
        return await captureOrder(body.orderId);
      case "cancel":
        return await cancelOrder(body.orderId);
      default:
        return json({ error: "Unknown checkout action." }, 400);
    }
  } catch (err) {
    console.error("paypal-checkout failed", err);
    return json({ error: "Something went wrong with the payment service. Please try again." }, 500);
  }
});
