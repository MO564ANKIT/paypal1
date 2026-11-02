import { LOOT_BY_ID } from '@/lib/lootCatalogue';
import { supabase } from '@/lib/supabase';

const CHECKOUT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/paypal-checkout`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type CaptureResult =
  | { status: 'completed'; orderId: string; itemIds: string[]; amountCents: number }
  | { status: 'failed'; orderId: string; message: string }
  | { status: 'pending'; orderId: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function postCheckout(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sign in to continue checkout.');

  let response: Response;
  try {
    response = await fetch(CHECKOUT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach the payment service. Check your connection and try again.');
  }

  const data: unknown = await response.json().catch(() => null);
  if (!isRecord(data)) throw new Error('The payment service sent an unexpected reply. Please try again.');
  if (!response.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Payment failed. Please try again.');
  }
  return data;
}

export async function createPaypalOrder(itemIds: string[]): Promise<{ orderId: string; approveUrl: string }> {
  const unknownItem = itemIds.find((id) => !LOOT_BY_ID[id]);
  if (unknownItem || itemIds.length === 0) throw new Error('Your cart is empty or has an unknown item.');

  const data = await postCheckout({ action: 'create', itemIds });
  if (typeof data.orderId !== 'string' || typeof data.approveUrl !== 'string') {
    throw new Error('PayPal did not return a checkout link. Please try again.');
  }
  return { orderId: data.orderId, approveUrl: data.approveUrl };
}

export async function capturePaypalOrder(orderId: string): Promise<CaptureResult> {
  const data = await postCheckout({ action: 'capture', orderId });
  const itemIds = data.itemIds;
  if (
    data.status === 'completed' &&
    typeof data.orderId === 'string' &&
    Array.isArray(itemIds) &&
    itemIds.every((id) => typeof id === 'string') &&
    typeof data.amountCents === 'number'
  ) {
    return { status: 'completed', orderId: data.orderId, itemIds, amountCents: data.amountCents };
  }
  if (data.status === 'pending') {
    return {
      status: 'pending',
      orderId,
      message: typeof data.message === 'string' ? data.message : 'Your payment is still being confirmed.',
    };
  }
  return {
    status: 'failed',
    orderId,
    message: typeof data.message === 'string' ? data.message : 'Payment was not completed. Nothing was charged.',
  };
}

export async function cancelPaypalOrder(orderId: string): Promise<void> {
  await postCheckout({ action: 'cancel', orderId });
}
