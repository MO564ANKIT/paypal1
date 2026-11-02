import { supabase } from '@/lib/supabase';

const ROAST_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/roast-chat`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const REQUEST_TIMEOUT_MS = 60000;

export interface RoastHistoryItem {
  role: 'user' | 'bot';
  text: string;
}

export interface RoastRequest {
  personality: string;
  message: string;
  today: string;
  history: RoastHistoryItem[];
}

export async function requestRoast(request: RoastRequest): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Sign in to chat with the roaster.');

  let response: Response;
  try {
    response = await fetch(ROAST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        apikey: ANON_KEY,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error('The roaster took too long or could not be reached. Please try again.');
  }

  const data: unknown = await response.json().catch(() => null);
  const error = typeof data === 'object' && data !== null && 'error' in data ? data.error : null;
  if (!response.ok) {
    throw new Error(typeof error === 'string' ? error : 'The roast did not come through. Please try again.');
  }
  const reply = typeof data === 'object' && data !== null && 'reply' in data ? data.reply : null;
  if (typeof reply !== 'string' || reply.trim().length === 0) {
    throw new Error('The roast service sent an empty reply. Please try again.');
  }
  return reply;
}
