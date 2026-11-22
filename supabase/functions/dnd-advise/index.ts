// D&D Table Live: "Ask Claude" for the hosted app.
//
// POST { code, character } with the player's Supabase access token. The
// player's own token calls dnd_advise_begin, which checks they are signed in,
// the room is live, and the limits allow it (or returns a cached answer). The
// Claude call uses this project's ANTHROPIC_API_KEY secret; the answer is cached
// with the service role. advice.js is a copy of src/advice.js (npm test checks).
import { CLAUDE_URL, AdviceError, claudeRequest, readAdvice } from "./advice.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ORIGINS = (Deno.env.get("DND_ALLOWED_ORIGINS") ?? "https://andyrbrett.github.io,http://localhost:4173")
  .split(",").map(origin => origin.trim()).filter(Boolean);

function headers(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
    "Content-Type": "application/json",
    "Cache-Control": "no-store"
  };
}

Deno.serve(async req => {
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: headers(req) });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: headers(req) });
  if (req.method !== "POST") return reply({ error: "Method unavailable." }, 405);
  if (!ANTHROPIC_API_KEY) return reply({ error: "Claude suggestions are off on this server." }, 503);

  let input: { code?: unknown; character?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const code = typeof input.code === "string" && /^[a-f0-9]{24}$/.test(input.code) ? input.code : "";
  const character = Number(input.character);
  if (!code || !Number.isInteger(character) || character < 0 || character > 4) return reply({ error: "Invalid request." }, 400);

  const begin = await fetch(SUPABASE_URL + "/rest/v1/rpc/dnd_advise_begin", {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code, p_character: character })
  });
  const plan = await begin.json().catch(() => ({}));
  if (!begin.ok) return reply({ error: plan.message ?? "Could not reach the room." }, begin.status === 401 ? 401 : begin.status);
  if (plan.limit) return reply({ error: plan.limit }, 429);
  if (plan.cached) return reply({ ...plan.cached, sceneId: plan.sceneId });

  try {
    const advice = await readAdvice(await fetch(CLAUDE_URL, {
      ...claudeRequest(ANTHROPIC_API_KEY, plan.character, plan.scenes, plan.history ?? ""),
      signal: AbortSignal.timeout(45000)
    }));
    await fetch(SUPABASE_URL + "/rest/v1/dnd_advice", {
      method: "POST",
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates" },
      body: JSON.stringify({ code, character_index: character, scene_id: plan.sceneId, sheet_hash: plan.hash, advice })
    }).catch(error => console.error("cache write failed", error));
    return reply({ ...advice, sceneId: plan.sceneId });
  } catch (error) {
    if (!(error instanceof AdviceError)) console.error(error);
    return reply({ error: error instanceof AdviceError ? error.message : "Claude could not answer. Try again." }, 502);
  }
});
