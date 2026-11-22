function profile(name, role, moves) {
  return { name, role, moves: moves.join("\n"), historyImported: true };
}

const party = [
  profile("The White Wizard", "Half-Elf Light Domain cleric", [
    "combat | Sacred Flame — Cantrip used in play. Check line of sight, range, and the target’s save.",
    "combat | Fireball — Used against the casino guards for 24 damage. Check your slot and who is inside the blast.",
    "combat | Bless — Used in play. Check your prepared spells, slots, and concentration.",
    "combat | Spiritual Weapon — Used in play. Check the table’s version for casting and concentration.",
    "combat | Spirit Guardians — Used in play. Check your slot, concentration, and who is near you.",
    "combat | Wall of Fire — Used in play. Check your slot, concentration, and where the wall leaves allies.",
    "aid | Healing Word — Used in play. Check your prepared spells, slot, range, and whether you can see the ally.",
    "explore | Guidance — Cantrip used in play. Coordinate with the DM before the check.",
    "explore | Light — Cantrip used in play. Use when the group wants light and is ready to be seen.",
    "check | Warding Flare — Discussed previously. Confirm the reaction, trigger, and uses on the current sheet.",
    "check | Divine Intervention — Revisit after the level-up and confirm the table’s version."
  ]),
  profile("Arcturus", "Elf Gloom Stalker ranger", [
    "combat | Longbow — Primary weapon in the campaign recap. Check range, line of sight, and cover.",
    "combat | Extra Attack — Recorded in the ranger recap. Check your current sheet before counting attacks.",
    "combat | Dread Ambusher — The prior recap described an opening-turn extra attack. Confirm the house rule and its timing.",
    "combat | Sharpshooter — Prior notes say the DM limited it to cover and long-range benefits. Confirm before using.",
    "explore | Umbral Sight — Recorded in the ranger recap. Ask what the lighting lets you see.",
    "social | Disguise Self — Used during the casino heist. Check availability and whether the disguise fits the scene.",
    "check | Shortsword, Iron Mind, Ring of Dragon Champion / Defensive Duelist — Recorded in the earlier recap. Verify equipment and exact effects.",
    "check | Hunter’s Mark, Lightning Arrow, Cure Wounds, Pass Without Trace, Ensnaring Strike, Hail of Thorns, Absorb Elements — Discussed spells. Confirm which are available before using."
  ]),
  profile("Logan Ninefingers", "Berserker barbarian", [
    "combat | Rage — Used in play. Check remaining uses and the table’s activation rules.",
    "combat | Greataxe — Equipped in the campaign notes. Check reach and whether you can close the distance.",
    "combat | Reckless Attack — Recorded in play. Review the attack benefit and what it opens up for enemies.",
    "combat | Great Weapon Master — Recorded in play. Use the version on your current sheet.",
    "combat | Frenzy — Recorded on the Berserker build. Verify when it can apply and any costs under your table’s rules."
  ]),
  profile("Dum Dum", "Brawler / gladiator", [
    "combat | Close-range attack — Took down a musket guard in the casino fight. Check reach and use the attack on your sheet.",
    "check | Extra attack — Discussed during the casino fight. Confirm when it applies and which attacks, weapons, and features are on your current sheet."
  ]),
  profile("Roan the Last Shadow", "Living-shadow abilities", [
    "explore | Living-shadow swap — Placed a shadow in the casino back room and swapped places with it, leaving it on the casino floor. Ask where the shadow can be placed and what it takes to swap.",
    "danger | Living-shadow swap — Consider repositioning if your shadow is already somewhere safe. Check range, timing, and availability with the DM.",
    "check | Confirm the name, limits, and uses of the shadow feature and add the rest of Roan’s sheet."
  ])
];

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
const recap = "The party is searching the casino for the Onyx jewel. The group survived the musket encounter. The vault’s secrets remain unknown, and the DM announced a level-up.";
const roomAge = 8 * 60 * 60 * 1000;
const types = {"index.html":"text/html", "app.js":"text/javascript", "scene-options.js":"text/javascript", "style.css":"text/css"};

function json(body, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function randomToken(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, "0")).join("");
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
  async state(db, room, code) {
    const { results } = await db.prepare("SELECT id, text, created FROM scenes WHERE code = ? ORDER BY id DESC LIMIT 30").bind(code).all();
    return json({ party: importHistory(JSON.parse(room.party)), scenes: results.reverse() });
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
      const match = url.pathname.match(/^\/api\/rooms\/([a-f0-9]{24})(?:\/(scene|party|close))?$/);
      if (!match) return json({ error: "Invalid room link." }, 404);
      const [, code, operation] = match;
      const room = await env.DB.prepare("SELECT host, party FROM rooms WHERE code = ? AND created > ?")
        .bind(code, Date.now() - roomAge).first();
      if (!room) return json({ error: "This room has ended or expired." }, 404);
      if (!operation && request.method === "GET") return await endpoints.state(env.DB, room, code);
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
