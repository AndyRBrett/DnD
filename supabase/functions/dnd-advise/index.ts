// D&D Table Live: "Ask Claude" for the hosted app.
//
// POST { code, character } with the player's Supabase access token. The
// player's own token calls dnd_advise_begin, which checks they are signed in,
// the room is live, and the limits allow it (or returns a cached answer). The
// Claude call uses this project's ANTHROPIC_API_KEY secret; the answer is cached
// with the service role. advice.js is a copy of src/advice.js (npm test checks).
import { CLAUDE_URL, AdviceError, claudeRequest, readAdvice, dmRequest, readEnemies, readDmHelp } from "./advice.js";

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

  let input: { code?: unknown; character?: unknown; question?: unknown; spent?: unknown; table?: unknown; mode?: unknown; prompt?: unknown };
  try {
    input = await req.json();
  } catch {
    return reply({ error: "Invalid request." }, 400);
  }
  const code = typeof input.code === "string" && /^[a-f0-9]{24}$/.test(input.code) ? input.code : "";
  // The DM's asks: enemies from a description, or the DM assistant.
  if (input.mode === "enemies" || input.mode === "dm") {
    if (!code) return reply({ error: "Invalid request." }, 400);
    const prompt = typeof input.prompt === "string" ? input.prompt.trim().slice(0, 600) : "";
    if (!prompt) return reply({ error: input.mode === "enemies" ? "Describe the enemies you want." : "Ask the assistant something." }, 400);
    return await answerDm(req, reply, code, input.mode, prompt, typeof input.table === "string" ? input.table.slice(0, 3000) : "");
  }
  const character = Number(input.character);
  if (!code || !Number.isInteger(character) || character < 0 || character > 7) return reply({ error: "Invalid request." }, 400);
  const question = typeof input.question === "string" ? input.question.trim().slice(0, 300) : "";
  // Abilities the player's phone says are out of uses ("Fireball: no 3rd-level
  // or higher spell slot left"). Advice that depends on them skips the cache.
  const spent = Array.isArray(input.spent) ? input.spent.slice(0, 40).map(item => String(item).slice(0, 120)) : [];
  // The table as the player's phone sees it now (turn, HP, conditions, what's
  // left). It changes every turn, so such requests skip the cache too.
  const table = typeof input.table === "string" ? input.table.slice(0, 2000) : "";
  if (question || spent.length || table) return await answerQuestion(req, reply, code, character, question, spent, table);

  const begin = await fetch(SUPABASE_URL + "/rest/v1/rpc/dnd_advise_begin_v2", {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code, p_character: character })
  });
  const plan = await begin.json().catch(() => ({}));
  if (!begin.ok) return reply({ error: plan.message ?? "Could not reach the room." }, begin.status === 401 ? 401 : begin.status);
  if (plan.limit) return reply({ error: plan.limit }, 429);
  if (plan.cached) return reply({ ...plan.cached, sceneId: plan.sceneId });

  try {
    // The whole session, not just the last few updates (claudeRequest trims
    // to its character budget). Read with the service role: the tables have
    // no client grants, and dnd_advise_begin already checked this player.
    const sessionResponse = await fetch(SUPABASE_URL + "/rest/v1/dnd_scenes?select=id,text,created_at&code=eq." + code + "&order=id.desc&limit=200", {
      headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY }
    });
    const session = sessionResponse.ok
      ? (await sessionResponse.json()).reverse().map((scene: { id: number; text: string; created_at: string }) =>
          ({ id: scene.id, text: scene.text, created: Date.parse(scene.created_at) }))
      : plan.scenes;
    const advice = await readAdvice(await fetch(CLAUDE_URL, {
      ...claudeRequest(ANTHROPIC_API_KEY, plan.character, session.length ? session : plan.scenes, plan.history ?? "", plan.actions ?? []),
      signal: AbortSignal.timeout(60000)
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

// ── Questions ("Can I cast Silence with one arm held?"), and advice when
// something is spent ──
// Not cached (every question is different, and spent abilities change). The player's own token reads the
// room through dnd_room_v2, which checks they are signed in and the table is
// live; the same limits as dnd_advise_begin are then applied with the service
// role, which also reads the history and the full session.
const service = { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY };

async function countUsage(filter: string): Promise<number> {
  const response = await fetch(SUPABASE_URL + "/rest/v1/dnd_ai_usage?select=id&" + filter, {
    headers: { ...service, Prefer: "count=exact", Range: "0-0" }
  });
  const total = Number((response.headers.get("content-range") ?? "").split("/")[1]);
  return Number.isFinite(total) ? total : 0;
}

function tokenSubject(req: Request): string {
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.sub === "string" ? payload.sub : "";
  } catch {
    return "";
  }
}

async function answerQuestion(req: Request, reply: (body: unknown, status?: number) => Response, code: string, character: number, question: string, spent: string[] = [], table = "") {
  const roomResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/dnd_room_v2", {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code })
  });
  const room = await roomResponse.json().catch(() => ({}));
  if (!roomResponse.ok) return reply({ error: room.message ?? "Could not reach the room." }, roomResponse.status);
  const sheet = room.party?.[character] ? { ...room.party[character], spent } : null;
  const uid = tokenSubject(req);
  if (!sheet || !/^[0-9a-f-]{36}$/.test(uid)) return reply({ error: "Pick a character." }, 400);

  const since = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
  if (await countUsage("created_at=gte." + since(86400000)) >= 600) return reply({ error: "Claude suggestions are paused for today. Try again tomorrow." }, 429);
  if (await countUsage("user_id=eq." + uid + "&created_at=gte." + since(86400000)) >= 120) return reply({ error: "You have used today's Claude suggestions." }, 429);
  if (await countUsage("code=eq." + code) >= 500) return reply({ error: "This session has used its Claude suggestions." }, 429);
  if (await countUsage("code=eq." + code + "&character_index=eq." + character + "&created_at=gte." + since(8000)) > 0) {
    return reply({ error: "One moment — Claude was just asked for this character." }, 429);
  }
  await fetch(SUPABASE_URL + "/rest/v1/dnd_ai_usage", {
    method: "POST",
    headers: { ...service, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ code, character_index: character, user_id: uid })
  });

  try {
    const [historyRows, sceneRows] = await Promise.all([
      fetch(SUPABASE_URL + "/rest/v1/dnd_campaigns?select=history&name=eq." + encodeURIComponent("The Onyx Jewel"), { headers: service }).then(response => response.ok ? response.json() : []),
      fetch(SUPABASE_URL + "/rest/v1/dnd_scenes?select=id,text,created_at&code=eq." + code + "&order=id.desc&limit=200", { headers: service }).then(response => response.ok ? response.json() : [])
    ]);
    const scenes = sceneRows.reverse().map((scene: { id: number; text: string; created_at: string }) =>
      ({ id: scene.id, text: scene.text, created: Date.parse(scene.created_at) }));
    const advice = await readAdvice(await fetch(CLAUDE_URL, {
      ...claudeRequest(ANTHROPIC_API_KEY, sheet, scenes.length ? scenes : room.scenes, historyRows[0]?.history ?? "", room.actions ?? [], question, table),
      signal: AbortSignal.timeout(60000)
    }));
    return reply({ ...advice, sceneId: room.scenes?.at(-1)?.id ?? null, ...(question ? { asked: question } : {}) });
  } catch (error) {
    if (!(error instanceof AdviceError)) console.error(error);
    return reply({ error: error instanceof AdviceError ? error.message : "Claude could not answer. Try again." }, 502);
  }
}

// ── The DM's asks ──
// Only the table's host: the player's token reads the room (dnd_room_v2 checks
// they're signed in and the table is live, and says whether they host it).
// Same daily and per-table limits as questions, counted as character -1.
async function answerDm(req: Request, reply: (body: unknown, status?: number) => Response, code: string, mode: string, prompt: string, table: string) {
  const roomResponse = await fetch(SUPABASE_URL + "/rest/v1/rpc/dnd_room_v2", {
    method: "POST",
    headers: { apikey: ANON_KEY, Authorization: req.headers.get("Authorization") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ p_code: code })
  });
  const room = await roomResponse.json().catch(() => ({}));
  if (!roomResponse.ok) return reply({ error: room.message ?? "Could not reach the room." }, roomResponse.status);
  const uid = tokenSubject(req);
  if (!room.isHost || !/^[0-9a-f-]{36}$/.test(uid)) return reply({ error: "Only the DM can ask this." }, 403);

  const since = (ms: number) => encodeURIComponent(new Date(Date.now() - ms).toISOString());
  if (await countUsage("created_at=gte." + since(86400000)) >= 600) return reply({ error: "Claude suggestions are paused for today. Try again tomorrow." }, 429);
  if (await countUsage("user_id=eq." + uid + "&created_at=gte." + since(86400000)) >= 120) return reply({ error: "You have used today's Claude suggestions." }, 429);
  if (await countUsage("code=eq." + code) >= 500) return reply({ error: "This session has used its Claude suggestions." }, 429);
  if (await countUsage("code=eq." + code + "&character_index=eq.-1&created_at=gte." + since(8000)) > 0) {
    return reply({ error: "One moment — Claude was just asked." }, 429);
  }
  await fetch(SUPABASE_URL + "/rest/v1/dnd_ai_usage", {
    method: "POST",
    headers: { ...service, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ code, character_index: -1, user_id: uid })
  });

  try {
    const [historyRows, sceneRows] = await Promise.all([
      fetch(SUPABASE_URL + "/rest/v1/dnd_campaigns?select=history&name=eq." + encodeURIComponent("The Onyx Jewel"), { headers: service }).then(response => response.ok ? response.json() : []),
      fetch(SUPABASE_URL + "/rest/v1/dnd_scenes?select=id,text,created_at&code=eq." + code + "&order=id.desc&limit=200", { headers: service }).then(response => response.ok ? response.json() : [])
    ]);
    const scenes = sceneRows.reverse().map((scene: { id: number; text: string; created_at: string }) =>
      ({ id: scene.id, text: scene.text, created: Date.parse(scene.created_at) }));
    const party = (room.party ?? []).map((member: { name: string; role?: string }) => ({ name: member.name, role: member.role ?? "" }));
    const response = await fetch(CLAUDE_URL, {
      ...dmRequest(ANTHROPIC_API_KEY, mode, { scenes: scenes.length ? scenes : room.scenes ?? [], history: historyRows[0]?.history ?? "", actions: room.actions ?? [], party, prompt, table }),
      signal: AbortSignal.timeout(60000)
    });
    return reply(mode === "enemies" ? await readEnemies(response) : await readDmHelp(response));
  } catch (error) {
    if (!(error instanceof AdviceError)) console.error(error);
    return reply({ error: error instanceof AdviceError ? error.message : "Claude could not answer. Try again." }, 502);
  }
}
