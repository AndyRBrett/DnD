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
const roomAge = 3 * 24 * 60 * 60 * 1000; // 3 days idle
const types = {"index.html":"text/html", "app.js":"text/javascript", "scene-options.js":"text/javascript", "backend.js":"text/javascript", "campaign.js":"text/javascript", "rules.js":"text/javascript", "dice.js":"text/javascript", "dice3d.js":"text/javascript", "theme.js":"text/javascript", "encounter.js":"text/javascript", "config.js":"text/javascript", "style.css":"text/css", "manifest.json":"application/manifest+json", "sw.js":"text/javascript"};

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
const presence = new Map(); // room code → phone id → { character, at }
const AI_ROOM_LIMIT = 150;
const recaps = new Map(); // room code → { text, uptoAt }: the running recap (src/advice.js)
const AI_COOLDOWN = 8000;

// What each call used, on the server's console (the hosted app keeps it in dnd_ai_tokens).
const logTokens = mode => usage => console.log("Claude " + mode + ": " + usage.model + " · in " + usage.input_tokens
  + " (cache read " + usage.cache_read + ", write " + usage.cache_write + ") · out " + usage.output_tokens);

// The running recap, brought up to date when it's due.
async function currentRecap(apiKey, code, scenes, party) {
  const { recap, changed } = await refreshRecap(apiKey, scenes, [], recaps.get(code) ?? null, party, logTokens("recap"));
  if (changed) recaps.set(code, recap);
  return recap;
}

async function askClaude(apiKey, code, character, scenes, party, question = "", table = "") {
  const recap = await currentRecap(apiKey, code, scenes, party);
  const response = await fetch(CLAUDE_URL, { ...claudeRequest(apiKey, character, scenes, "", [], question, table, recap), signal: AbortSignal.timeout(60000) });
  return readAdvice(response, logTokens(question ? "question" : "advice"));
}

// The DM's asks (enemies from a description, the DM assistant): host only,
// never cached, and counted against the same per-table limit.
async function dmAsk(request, db, room, code, env, body) {
  if (request.headers.get("x-table-host") !== room.host) return json({ error: "Only the DM can ask this." }, 403);
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 600) : "";
  if (!prompt && body.mode !== "run") return json({ error: body.mode === "enemies" ? "Describe the enemies you want." : "Ask the assistant something." }, 400);
  if (body.mode === "run" && !room.practice) return json({ error: "The AI DM runs on practice tables for now." }, 403);
  const usage = aiUsage.get(code) ?? { count: 0, last: new Map() };
  if (usage.count >= AI_ROOM_LIMIT) return json({ error: "This session has used its Claude suggestions." }, 429);
  if (Date.now() - (usage.last.get(-1) ?? 0) < AI_COOLDOWN) return json({ error: "One moment — Claude was just asked." }, 429);
  usage.count += 1;
  usage.last.set(-1, Date.now());
  aiUsage.set(code, usage);
  const { results } = await db.prepare("SELECT id, text, created FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 400").bind(code).all();
  const party = JSON.parse(room.party).map(member => ({ name: member.name, role: member.role }));
  const table = typeof body.table === "string" ? body.table.slice(0, 3000) : "";
  try {
    const scenes = results.reverse();
    const recap = await currentRecap(env.ANTHROPIC_API_KEY, code, scenes, party);
    if (body.mode === "run") {
      const sheets = importHistory(JSON.parse(room.party)).map(member => ({ name: member.name, role: member.role, moves: member.moves }));
      const notes = typeof body.notes === "string" ? body.notes.slice(0, 3000) : "";
      const response = await fetch(CLAUDE_URL, { ...aiDmRequest(env.ANTHROPIC_API_KEY, { scenes, party: sheets, notes, prompt, table, recap }), signal: AbortSignal.timeout(90000) });
      return json(await readAiDm(response, sheets, logTokens("run")));
    }
    const response = await fetch(CLAUDE_URL, { ...dmRequest(env.ANTHROPIC_API_KEY, body.mode, { scenes, party, prompt, table, recap }), signal: AbortSignal.timeout(60000) });
    return json(body.mode === "enemies" ? await readEnemies(response, logTokens(body.mode)) : await readDmHelp(response, logTokens(body.mode)));
  } catch (error) {
    if (!(error instanceof AdviceError)) console.error(error);
    return json({ error: error instanceof AdviceError ? error.message : "Claude could not answer. Try again." }, 502);
  }
}

// HP and resources carry over between campaign tables; a practice table keeps
// its own, under a "room:<code>:" prefix.
const recordKey = (room, name) => room.practice ? "room:" + room.code + ":" + name : name;

const endpoints = {
  async create(request, db) {
  if (request.headers.get("x-table-action") !== "create") return json({ error: "Invalid request." }, 400);
    const code = randomToken(12);
    const host = randomToken(24);
    const now = Date.now();
    const practice = request.headers.get("x-table-practice") === "1" ? 1 : 0;
    const opening = practice ? "PRACTICE TABLE: test freely. Nothing from this table is added to the campaign history.\n\n" + recap : recap;
    await db.batch([
      db.prepare("DELETE FROM rooms WHERE last_active < ?").bind(now - roomAge),
      db.prepare("INSERT INTO rooms (code, host, created, party, last_active, practice) VALUES (?, ?, ?, ?, ?, ?)").bind(code, host, now, JSON.stringify(party), now, practice),
      db.prepare("INSERT INTO scenes (code, text, created) VALUES (?, ?, ?)").bind(code, opening, now)
    ]);
    return json({ code, host });
  },
  async state(db, room, code, env) {
    const { results } = await db.prepare("SELECT id, text, created FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 30").bind(code).all();
    const combat = await db.prepare("SELECT round, turn, enemies, party_init FROM combats WHERE code = ?").bind(code).first();
    const party = importHistory(JSON.parse(room.party));
    const { results: hpRows } = await db.prepare("SELECT name, hp, max_hp, temp, ac FROM party_hp").all();
    // Rows are stored under recordKey (a practice table has its own); report them by character name.
    const byName = rows => rows.flatMap(row => {
      const member = party.find(member => recordKey(room, member.name) === row.name);
      return member ? [{ ...row, name: member.name }] : [];
    });
    const names = new Set(party.map(member => member.name));
    const { results: resourceRows } = await db.prepare("SELECT name, state FROM party_resources").all();
    const resources = Object.fromEntries(byName(resourceRows).filter(row => names.has(row.name)).map(row => [row.name, JSON.parse(row.state)]));
    const hp = Object.fromEntries(byName(hpRows).filter(row => names.has(row.name)).map(row => [row.name, { hp: row.hp, max: row.max_hp, temp: row.temp, ...(row.ac ? { ac: row.ac } : {}) }]));
    // Phones seen in the last two minutes, by character (never who they are).
    const now = Date.now();
    const here = [...(presence.get(code)?.values() ?? [])].filter(entry => now - entry.at < 120000)
      .map(entry => ({ character: entry.character, seconds: Math.round((now - entry.at) / 1000) }))
      .sort((a, b) => a.character - b.character);
    return json({
      party, hp, resources, here, scenes: results.reverse(), ai: Boolean(env.ANTHROPIC_API_KEY),
      combat: combat ? { round: combat.round, turn: combat.turn, enemies: JSON.parse(combat.enemies), party: JSON.parse(combat.party_init) } : null
    });
  },
  async advise(request, db, room, code, env) {
    if (!env.ANTHROPIC_API_KEY) return json({ error: "Claude suggestions are off on this server." }, 404);
    const body = await request.json();
    if (body.mode === "enemies" || body.mode === "dm" || body.mode === "run") return await dmAsk(request, db, room, code, env, body);
    const index = Number(body.character);
    const party = importHistory(JSON.parse(room.party));
    const character = party[index];
    if (!Number.isInteger(index) || !character) return json({ error: "Pick a character." }, 400);
    const { results } = await db.prepare("SELECT id, text, created FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 400").bind(code).all();
    const scenes = results.reverse();
    if (!scenes.length) return json({ error: "Wait for a scene update." }, 400);
    const question = typeof body.question === "string" ? body.question.trim().slice(0, 300) : "";
    const spent = Array.isArray(body.spent) ? body.spent.slice(0, 40).map(item => String(item).slice(0, 120)) : [];
    if (spent.length) character.spent = spent;
    const table = typeof body.table === "string" ? body.table.slice(0, 2000) : "";
    const key = [code, index, scenes.at(-1).id, scenes.at(-1).text, character.moves, question, spent.join("|"), table].join("\u0000");
    const cached = aiCache.get(key);
    if (cached) return json({ ...(await cached), sceneId: scenes.at(-1).id });
    const usage = aiUsage.get(code) ?? { count: 0, last: new Map() };
    if (usage.count >= AI_ROOM_LIMIT) return json({ error: "This session has used its Claude suggestions." }, 429);
    if (Date.now() - (usage.last.get(index) ?? 0) < AI_COOLDOWN) return json({ error: "One moment — Claude was just asked for this character." }, 429);
    usage.count += 1;
    usage.last.set(index, Date.now());
    aiUsage.set(code, usage);
    const pending = askClaude(env.ANTHROPIC_API_KEY, code, character, scenes, party, question, table);
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
  // Combat: only the public view of each enemy is stored (never HP or AC).
  async combat(request, db, room, code) {
    const body = await request.json();
    if (body.end) {
      await db.prepare("DELETE FROM combats WHERE code = ?").bind(code).run();
      return json({ ok: true });
    }
    if (body.sitOut) {
      // Sit a character out of this fight ("out" in place of an initiative), or bring them back.
      const index = Number(body.sitOut.character);
      if (!Number.isInteger(index) || index < 0 || !JSON.parse(room.party)[index]) return json({ error: "Pick a character." }, 400);
      const key = "$.\"" + index + "\"";
      const result = body.sitOut.out
        ? await db.prepare("UPDATE combats SET party_init = json_set(party_init, ?, 'out') WHERE code = ?").bind(key, code).run()
        : await db.prepare("UPDATE combats SET party_init = json_remove(party_init, ?) WHERE code = ?").bind(key, code).run();
      if (!result.changes && !result.meta?.changes) return json({ error: "Combat has not started." }, 400);
      return json({ ok: true });
    }
    if (!Array.isArray(body.enemies) || body.enemies.length > 40) return json({ error: "Use up to 40 enemies." }, 400);
    const enemies = body.enemies.map(enemy => ({
      id: String(enemy?.id ?? "").slice(0, 40),
      name: String(enemy?.name ?? "Enemy").slice(0, 60),
      initiative: Number.isFinite(enemy?.initiative) ? enemy.initiative : null,
      status: ["ok", "bloodied", "down"].includes(enemy?.status) ? enemy.status : "ok",
      conditions: Array.isArray(enemy?.conditions) ? enemy.conditions.slice(0, 16).map(condition => String(condition).slice(0, 30)) : []
    }));
    if (body.enemiesOnly) {
      // Only the enemies change, and only in a fight that's still on.
      await db.prepare("UPDATE combats SET enemies = ? WHERE code = ?").bind(JSON.stringify(enemies), code).run();
      return json({ ok: true });
    }
    const round = Math.max(1, Math.min(999, Math.floor(Number(body.round)) || 1));
    const turn = typeof body.turn === "string" ? body.turn.slice(0, 60) : null;
    const existing = await db.prepare("SELECT party_init FROM combats WHERE code = ?").bind(code).first();
    const partyInit = existing && !body.reset ? existing.party_init : "{}";
    await db.prepare("INSERT OR REPLACE INTO combats (code, round, turn, enemies, party_init) VALUES (?, ?, ?, ?, ?)")
      .bind(code, round, turn, JSON.stringify(enemies), partyInit).run();
    return json({ ok: true });
  },
  // The player whose turn it is passes it on (same order as the app's
  // combatOrder: highest initiative first, party first on ties, unrolled
  // last, downed enemies skipped; past the last one starts a new round).
  async passTurn(request, db, room, code) {
    const body = await request.json();
    const index = Number(body.character);
    const row = await db.prepare("SELECT round, turn, enemies, party_init FROM combats WHERE code = ?").bind(code).first();
    if (!row) return json({ error: "Combat has not started." }, 400);
    if (row.turn !== "pc:" + index) return json({ error: "It isn't your turn anymore." }, 400);
    const party = JSON.parse(room.party);
    const rolls = JSON.parse(row.party_init);
    const rank = value => Number.isFinite(value) ? value : -1000;
    const entries = [
      ...party.map((_, i) => ({ key: "pc:" + i, rank: rank(rolls[i]), kind: 0, ord: i })).filter((_, i) => rolls[i] !== "out"),
      ...JSON.parse(row.enemies).filter(enemy => enemy.status !== "down")
        .map((enemy, j) => ({ key: "en:" + enemy.id, rank: rank(enemy.initiative), kind: 1, ord: 1000 + j }))
    ].sort((a, b) => b.rank - a.rank || a.kind - b.kind || a.ord - b.ord);
    const at = entries.findIndex(entry => entry.key === row.turn);
    const wraps = at < 0 || at >= entries.length - 1;
    const turn = wraps ? entries[0].key : entries[at + 1].key;
    const round = Math.min(999, row.round + (at >= 0 && wraps ? 1 : 0));
    await db.prepare("UPDATE combats SET turn = ?, round = ? WHERE code = ?").bind(turn, round, code).run();
    return json({ turn, round });
  },
  async initiative(request, db, room, code) {
    const body = await request.json();
    const index = Number(body.character);
    const value = Number(body.value);
    if (!Number.isInteger(index) || !JSON.parse(room.party)[index]) return json({ error: "Pick a character." }, 400);
    if (!Number.isInteger(value) || value < -10 || value > 60) return json({ error: "Enter an initiative between -10 and 60." }, 400);
    // Sets just this character's key in one statement, so two players rolling
    // at once can't overwrite each other.
    const result = await db.prepare("UPDATE combats SET party_init = json_set(party_init, ?, ?) WHERE code = ?")
      .bind("$.\"" + index + "\"", value, code).run();
    if (!result.changes && !result.meta?.changes) return json({ error: "Combat has not started." }, 400);
    return json({ ok: true });
  },
  // Party HP: anyone at the table can change it.
  async hp(request, db, room, adjust) {
    const body = await request.json();
    const name = JSON.parse(room.party)[Number(body.character)]?.name;
    if (!Number.isInteger(Number(body.character)) || !name) return json({ error: "Pick a character." }, 400);
    const whole = value => Number.isInteger(Number(value)) ? Number(value) : NaN;
    if (adjust) {
      const change = whole(body.change);
      if (!change || Math.abs(change) > 999) return json({ error: "Enter an amount from 1 to 999." }, 400);
      const row = await db.prepare("SELECT hp, max_hp, temp FROM party_hp WHERE name = ?").bind(recordKey(room, name)).first();
      if (!row) return json({ error: "Set this character's max HP first." }, 400);
      const next = change < 0
        ? { temp: Math.max(0, row.temp + change), hp: Math.max(0, row.hp - Math.max(0, -change - row.temp)) }
        : { temp: row.temp, hp: Math.min(row.max_hp, row.hp + change) };
      await db.prepare("UPDATE party_hp SET hp = ?, temp = ? WHERE name = ?").bind(next.hp, next.temp, recordKey(room, name)).run();
      return json({ ok: true });
    }
    const max = whole(body.max);
    if (!(max >= 1 && max <= 999)) return json({ error: "Max HP must be 1 to 999." }, 400);
    const hp = Math.max(0, Math.min(max, Number.isFinite(whole(body.hp)) ? whole(body.hp) : max));
    const temp = Math.max(0, Math.min(999, whole(body.temp) || 0));
    const ac = body.ac === undefined || body.ac === null || body.ac === "" ? null : whole(body.ac);
    if (ac !== null && !(ac >= 1 && ac <= 40)) return json({ error: "AC must be 1 to 40." }, 400);
    const kept = (await db.prepare("SELECT ac FROM party_hp WHERE name = ?").bind(recordKey(room, name)).first())?.ac ?? null;
    await db.prepare("INSERT OR REPLACE INTO party_hp (name, hp, max_hp, temp, ac) VALUES (?, ?, ?, ?, ?)").bind(recordKey(room, name), hp, max, temp, ac ?? kept).run();
    return json({ ok: true });
  },
  // Resources used (spell slots, rages…): anyone at the table can save them.
  async resources(request, db, room) {
    const body = await request.json();
    const name = JSON.parse(room.party)[Number(body.character)]?.name;
    if (!Number.isInteger(Number(body.character)) || !name) return json({ error: "Pick a character." }, 400);
    const used = body.state?.used;
    if (!used || typeof used !== "object" || Array.isArray(used)) return json({ error: "Invalid resources." }, 400);
    const clean = Object.fromEntries(Object.entries(used).slice(0, 40)
      .filter(([, value]) => /^\d{1,3}$/.test(String(value)))
      .map(([key, value]) => [String(key).slice(0, 40), Math.min(99, Number(value))]));
    const state = JSON.stringify({ used: clean, raging: body.state.raging === true });
    await db.prepare("INSERT OR REPLACE INTO party_resources (name, state) VALUES (?, ?)").bind(recordKey(room, name), state).run();
    return json({ ok: true });
  },
  async scene(request, db, code) {
    const body = await request.json();
    if (body.delete) {
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: "Invalid request." }, 400);
      await db.prepare("DELETE FROM scenes WHERE code = ? AND id = ?").bind(code, id).run();
      return json({ ok: true });
    }
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
    if (!Array.isArray(body.party) || body.party.length < 1 || body.party.length > 8) return json({ error: "Enter one to eight characters." }, 400);
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
  // Who's at the table (kept in memory; a restart forgets it until the next ping).
  async here(request, room, code) {
    const body = await request.json();
    const character = Number(body.character);
    const phone = String(body.phone ?? "").slice(0, 40);
    if (!Number.isInteger(character) || !JSON.parse(room.party)[character] || !phone) return json({ error: "Pick a character." }, 400);
    if (!presence.has(code)) presence.set(code, new Map());
    const phones = presence.get(code);
    phones.set(phone, { character, at: Date.now() });
    if (phones.size > 30) phones.delete(phones.keys().next().value);
    return json({ ok: true });
  },
  async close(db, code) {
    aiUsage.delete(code);
    recaps.delete(code);
    presence.delete(code);
    await db.prepare("DELETE FROM rooms WHERE code = ?").bind(code).run();
    await db.prepare("DELETE FROM party_hp WHERE name LIKE ?").bind("room:" + code + ":%").run();
    await db.prepare("DELETE FROM party_resources WHERE name LIKE ?").bind("room:" + code + ":%").run();
    return json({ ok: true });
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const name = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
      if (Object.hasOwn(fonts, name)) {
        return new Response(Uint8Array.from(atob(fonts[name]), char => char.charCodeAt(0)), { headers: {
          "Content-Type": name.endsWith(".png") ? "image/png" : "font/woff2",
          "Cache-Control": "public, max-age=604800",
          "X-Content-Type-Options": "nosniff"
        } });
      }
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
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{24})(?:\/(scene|party|close|advise|combat|initiative|hp|hp-adjust|resources|pass-turn|here|session))?$/);
      if (!match) return json({ error: "Invalid room link." }, 404);
      const [, code, operation] = match;
      // Open until 3 days after the last activity (any change that succeeds).
      const room = await env.DB.prepare("SELECT host, party, practice FROM rooms WHERE code = ? AND last_active > ?")
        .bind(code, Date.now() - roomAge).first();
      if (!room) return json({ error: "This room has ended or expired." }, 404);
      room.code = code;
      if (!operation && request.method === "GET") return await endpoints.state(env.DB, room, code, env);
      // The whole session for "Copy scene + whole party"; reading isn't activity.
      if (operation === "session" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id, text, created FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 2000").bind(code).all();
        return json({ scenes: results.reverse(), actions: [] });
      }
      // A phone saying who it's playing isn't table activity: it doesn't keep the table open.
      if (operation === "here" && request.method === "POST") return await endpoints.here(request, room, code);
      const response = await roomChange(request, env, room, code, operation);
      if (response.ok) await env.DB.prepare("UPDATE rooms SET last_active = ? WHERE code = ?").bind(Date.now(), code).run();
      return response;
    } catch (error) {
      if (error instanceof SyntaxError) return json({ error: "Invalid request." }, 400);
      console.error(error);
      return json({ error: "Room service could not complete the request. Try again." }, 500);
    }
  }
};

// Changes to an open table; a change that succeeds counts as activity.
async function roomChange(request, env, room, code, operation) {
  if (operation === "advise" && request.method === "POST") return await endpoints.advise(request, env.DB, room, code, env);
  if (operation === "pass-turn" && request.method === "POST") return await endpoints.passTurn(request, env.DB, room, code);
  if (operation === "resources" && request.method === "POST") return await endpoints.resources(request, env.DB, room);
  if ((operation === "hp" || operation === "hp-adjust") && request.method === "POST") return await endpoints.hp(request, env.DB, room, operation === "hp-adjust");
  if (operation === "initiative" && request.method === "POST") return await endpoints.initiative(request, env.DB, room, code);
  if (request.method !== "POST") return json({ error: "Method unavailable." }, 405);
  if (request.headers.get("x-table-host") !== room.host) return json({ error: "Only the host can make changes." }, 403);
  if (operation === "close") return await endpoints.close(env.DB, code);
  if (operation === "combat") return await endpoints.combat(request, env.DB, room, code);
  if (operation === "scene" || operation === "party") return await endpoints[operation](request, env.DB, code);
  return json({ error: "Invalid request." }, 400);
}
