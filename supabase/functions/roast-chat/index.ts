import { createClient } from "npm:@supabase/supabase-js@2";
import { buildBudgetFacts, isDateKey, readSavedBudgetState } from "./budgetFacts.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const ROAST_LIMIT_PER_HOUR = 30;
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";
const MAX_MESSAGE_LENGTH = 200;
const MAX_HISTORY = 10;
const MAX_HISTORY_TEXT = 300;
const MAX_FACTS = 12;
const MAX_FACT_LENGTH = 300;

const PERSONA_STYLE: Record<string, string> = {
  softie: "You are a gentle, warm money buddy. Nudge kindly, celebrate small wins, never shame the user.",
  savage: "You are a blunt, witty roaster. Tease hard and fast, no sugar coating, but never cruel about the person's worth.",
  "big-brain": "You are a calm data analyst. Lead with numbers and trade-offs, keep feelings to one short line.",
  unhinged: "You are chaotic, hyped and playful, with big energy and short punchy sentences. Keep it fun, not mean.",
};

const RULES = [
  "Reply in 2 to 4 short sentences as plain text. No markdown, no lists, no emojis.",
  "Use only the numbers listed in the facts. Never invent amounts, dates or categories.",
  "If there are no facts, just chat about budgeting and invite the user to type a price.",
  "Reply in the same language the user writes in (English or Hinglish).",
].join("\n");

interface HistoryItem {
  role: "user" | "bot";
  text: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isHistory(value: unknown): value is HistoryItem[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        ((item as HistoryItem).role === "user" || (item as HistoryItem).role === "bot") &&
        typeof (item as HistoryItem).text === "string",
    )
  );
}

function buildRequest(personality: string, message: string, facts: string[], history: HistoryItem[]) {
  const system = [PERSONA_STYLE[personality], RULES].join("\n\n");
  const contents = [
    ...history.slice(-MAX_HISTORY).map((item) => ({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.text.slice(0, MAX_HISTORY_TEXT) }],
    })),
    {
      role: "user",
      parts: [
        {
          text: `Facts from the user's budget app:\n${facts.length ? facts.slice(0, MAX_FACTS).map((fact) => `- ${fact.slice(0, MAX_FACT_LENGTH)}`).join("\n") : "- (none)"}\n\nUser message: ${message}`,
        },
      ],
    },
  ];
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    generationConfig: {
      temperature: 1.0,
      maxOutputTokens: 4096,
      thinkingConfig: { thinkingLevel: "low" },
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => null);
    const personality = body?.personality;
    const message = body?.message;
    const today = body?.today;
    const history = body?.history ?? [];

    if (typeof personality !== "string" || !(personality in PERSONA_STYLE)) {
      return json({ error: "Pick a personality and try again." }, 400);
    }
    if (typeof message !== "string" || message.trim().length === 0 || message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: "Your message must be between 1 and 200 characters." }, 400);
    }
    if (!isDateKey(today) || !isHistory(history)) {
      return json({ error: "The roast request was not in the expected shape." }, 400);
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });
    const accessToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData.user) {
      return json({ error: "Sign in to chat with the roaster." }, 401);
    }

    const userId = userData.user.id;
    const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error: countError } = await admin
      .from("roast_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if (countError) throw countError;
    if ((count ?? 0) >= ROAST_LIMIT_PER_HOUR) {
      return json({ error: "You have used all your roasts for this hour. Come back soon." }, 429);
    }
    const { error: insertError } = await admin.from("roast_requests").insert({ user_id: userId });
    if (insertError) throw insertError;

    const { data: saveRow, error: saveError } = await admin
      .from("player_saves")
      .select("state")
      .eq("user_id", userId)
      .maybeSingle();
    if (saveError) throw saveError;
    const savedState = readSavedBudgetState(saveRow?.state);
    const facts = savedState ? buildBudgetFacts(savedState, message.trim(), today) : [];

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return json({ error: "The AI roaster is not set up yet." }, 503);
    }

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify(buildRequest(personality, message.trim(), facts, history)),
    });
    const data = await response.json().catch(() => null);
    const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!response.ok || typeof reply !== "string" || reply.trim().length === 0) {
      console.error("roast-chat gemini failed", response.status);
      return json({ error: "The AI roaster is taking a break. Try again in a moment." }, 502);
    }

    return json({ reply: reply.trim() });
  } catch (err) {
    console.error("roast-chat failed", err);
    if (err instanceof Error && err.name === "TimeoutError") {
      return json({ error: "The roaster is taking too long right now. Please try again." }, 504);
    }
    return json({ error: "Something went wrong while roasting. Please try again." }, 500);
  }
});
