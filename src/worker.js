const characterKey = name => name.toLowerCase().trim().replace(/^roam\b/, "roan").replace(/^the /, "");
const moveKey = line => line.split("|").at(-1).split(" — ")[0].toLowerCase().trim();

function importHistory(currentParty) {
  return currentParty.map(character => {
    if (character.historyImported) return character;
    const found = party.find(member => characterKey(member.name) === characterKey(character.name));
    if (!found) return character;
    const existing = new Set(character.moves.split("\n").map(moveKey));
    const added = found.moves.split("\n").filter(line => !existing.has(moveKey(line)));
    return {
      ...character,
      role: character.role === "Barbarian" && found.name === "Logan Ninefingers" ? found.role : character.role || found.role,
      moves: [character.moves, ...added].filter(Boolean).join("\n")
    };
  });
}
const roomAge = 8 * 60 * 60 * 1000;
const types = {"index.html":"text/html", "app.js":"text/javascript", "scene-options.js":"text/javascript", "backend.js":"text/javascript", "campaign.js":"text/javascript", "config.js":"text/javascript", "style.css":"text/css"};

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function randomToken(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
}


// Optional Claude suggestions. Off unless the server has ANTHROPIC_API_KEY
// (put it in .env on the host laptop). Nothing is sent until a player taps
// "Ask Claude". The prompt and request live in src/advice.js.
const aiCache = new Map();
const aiUsage = new Map();
const AI_ROOM_LIMIT = 200;
const AI_COOLDOWN = 8000;

async function askClaude(apiKey, character, scenes) {
  const response = await fetch(CLAUDE_URL, { ...claudeRequest(apiKey, character, scenes), signal: AbortSignal.timeout(60000) });
  return readAdvice(response);
}

const endpoints = {
  async create(request, db) {
    if (request.headers.get("x-table-action") !== "create") return json({ error: "Invalid request." }, 400);
    const code = randomToken(12);
    const host = randomToken(24);
    const now = Date.now();
    await db.batch([
      db.prepare("DELETE FROM rooms WHERE created < ?").bind(now - roomAge),
      db.prepare("INSERT INTO rooms VALUES (?, ?, ?, ?)").bind(code, host, now, JSON.stringify(party)),
      db.prepare("INSERT INTO scenes (code, text, created) VALUES (?, ?, ?)").bind(code, recap, now)
    ]);
    return json({ code, host });
  },
  async state(db, room, code, env) {
    const { results } = await db.prepare("SELECT id, text, created FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 30").bind(code).all();
    return json({ party: importHistory(JSON.parse(room.party)), scenes: results.reverse(), ai: Boolean(env.ANTHROPIC_API_KEY) });
  },
  async advise(request, db, room, code, env) {
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Claude suggestions are off on this server." }, 404);
    const body = await request.json();
    const index = Number(body.character);
    const party = importHistory(JSON.parse(room.party));
    const character = party[index];
    if (!Number.isInteger(index) || !character) return json({ error: "Pick a character." }, 400);
    const { results } = await db.prepare("SELECT id, text FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 200").bind(code).all();
    const scenes = results.reverse();
    if (!scenes.length) return json({ error: "Wait for a scene update." }, 400);
    const key = [code, index, scenes.at(-1).id, scenes.at(-1).text, character.moves].join("\u0000");
    const cached = aiCache.get(key);
    if (cached) return json({ ...(await cached), sceneId: scenes.at(-1).id });
    const usage = aiUsage.get(code) ?? { count: 0, last: new Map() };
    if (usage.count >= AI_ROOM_LIMIT) return json({ error: "This session has used its Claude suggestions." }, 429);
    if (Date.now() - (usage.last.get(index) ?? 0) < AI_COOLDOWN) return json({ error: "One moment — Claude was just asked for this character." }, 429);
    usage.count += 1;
    usage.last.set(index, Date.now());
    aiUsage.set(code, usage);
    const pending = askClaude(env.ANTHROPIC_API_KEY, character, scenes);
    aiCache.set(key, pending);
    if (aiCache.size > 500) aiCache.delete(aiCache.keys().next().value);
    try {
      return json({ ...(await pending), sceneId: scenes.at(-1).id });
    } catch (error) {
      aiCache.delete(key);
      if (!(error instanceof AdviceError)) console.error(error);
      return json({ error: error instanceof AdviceError ? error.message : "Claude could not answer. Try again." }, 502);
    }
  },
  async scene(request, db, code) {
    const body = await request.json();
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 1500) return json({ error: "Use 1 to 1,500 characters." }, 400);
    const now = Date.now();
    const id = Number(body.id);
    if (Number.isSafeInteger(id) && id > 0) {
      await db.prepare("UPDATE scenes SET text = ? WHERE code = ? AND id = ?").bind(text, code, id).run();
    } else {
      await db.prepare("INSERT INTO scenes (code, text, created) VALUES (?, ?, ?)").bind(code, text, now).run();
    }
    return json({ ok: true });
  },
  async party(request, db, code) {
    const body = await request.json();
    if (!Array.isArray(body.party) || body.party.length !== 5) return json({ error: "Enter five characters." }, 400);
    const updated = body.party.map(entry => ({
      name: typeof entry?.name === "string" ? entry.name.trim().slice(0, 70) : "",
      role: typeof entry?.role === "string" ? entry.role.trim().slice(0, 90) : "",
      moves: typeof entry?.moves === "string" ? entry.moves.trim().slice(0, 5000) : "",
      historyImported: true
    }));
    if (updated.some(entry => !entry.name)) return json({ error: "Each character needs a name." }, 400);
    await db.prepare("UPDATE rooms SET party = ? WHERE code = ?").bind(JSON.stringify(updated), code).run();
    return json({ ok: true });
  },
  async close(db, code) {
    aiUsage.delete(code);
    await db.prepare("DELETE FROM rooms WHERE code = ?").bind(code).run();
    return json({ ok: true });
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (!Object.hasOwn(types, name)) return new Response("Not found", { status: 404 });
      return new Response(assets[name], { headers: {
        "Content-Type": types[name] + "; charset=utf-8",
        "Cache-Control": "no-cache",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "Permissions-Policy": "microphone=(self)",
        "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'"
      } });
    }
    try {
      if (!env.DB) return json({ error: "Room storage is unavailable." }, 503);
      if (url.pathname === "/api/rooms" && request.method === "POST") return await endpoints.create(request, env.DB);
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{24})(?:\/(scene|party|close|advise))?$/);
      if (!match) return json({ error: "Invalid room link." }, 404);
      const [, code, operation] = match;
      const room = await env.DB.prepare("SELECT host, party FROM rooms WHERE code = ? AND created > ?")
        .bind(code, Date.now() - roomAge).first();
      if (!room) return json({ error: "This room has ended or expired." }, 404);
      if (!operation && request.method === "GET") return await endpoints.state(env.DB, room, code, env);
      if (operation === "advise" && request.method === "POST") return await endpoints.advise(request, env.DB, room, code, env);
      if (request.method !== "POST") return json({ error: "Method unavailable." }, 405);
      if (request.headers.get("x-table-host") !== room.host) return json({ error: "Only the host can make changes." }, 403);
      if (operation === "close") return await endpoints.close(env.DB, code);
      if (operation === "scene" || operation === "party") return await endpoints[operation](request, env.DB, code);
      return json({ error: "Invalid request." }, 400);
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "Invalid request." }, 400);
      console.error(error);
      return json({ error: "Room service could not complete the request. Try again." }, 500);
    }
  }
};
