// Claude suggestions, with the Anthropic API stubbed out: no network, no key.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";
import { openDatabase } from "../scripts/sqlite-db.mjs";

const realFetch = globalThis.fetch;
let requests;
let reply;
beforeEach(() => {
  requests = [];
  reply = () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    situation: "Combat",
    options: [{ action: "Cast Sacred Flame at the nearest guard.", why: "No slot needed." },
      { action: "Move behind the bar.", why: "Cover from muskets." },
      { action: "Call out the reloading guard.", why: "Warns the party.", explain: "Free to speak on your turn.", declare: "The White Wizard shouts a warning." },
      { action: "extra", why: "dropped" }],
    ask_dm: "Can I see the guard?"
  }) }] });
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://api.anthropic.com/")) return realFetch(url, init);
    requests.push({ url: String(url), init, body: JSON.parse(init.body) });
    return Response.json(reply());
  };
});

async function room(env) {
  const call = async (path, init = {}) => {
    const response = await worker.fetch(new Request("http://localhost" + path, init), env);
    return { status: response.status, body: await response.json() };
  };
  const { body: { code, host } } = await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } });
  const post = (path, body, headers = {}) => call("/api/rooms/" + code + path, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body)
  });
  await post("/scene", { text: "Roll initiative. Two guards raise their muskets." }, { "x-table-host": host });
  return { call: path => call("/api/rooms/" + code + path), post, host };
}

test("off without a key: state says so and nothing is sent", async () => {
  const { call, post } = await room({ DB: openDatabase() });
  assert.equal((await call("")).body.ai, false);
  assert.equal((await post("/advise", { character: 0 })).status, 404);
  assert.equal(requests.length, 0);
});

test("a player can ask; the request respects the sheet and the answer is trimmed to three", async () => {
  const { call, post, host } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "test-key" });
  assert.equal((await call("")).body.ai, true);
  // Every sheet is settled now, so the DM marks one line on Roan's as unconfirmed.
  const { body: before } = await call("");
  const party = before.party.map((member, index) => ({ ...member, moves: index === 4 ? member.moves + "\ncheck | Test move — Proposed by the player; the DM confirms it." : member.moves }));
  assert.equal((await post("/party", { party }, { "x-table-host": host })).status, 200);
  const result = await post("/advise", { character: 4 });
  assert.equal(result.status, 200);
  assert.equal(result.body.options.length, 3);
  assert.equal(result.body.options[2].declare, "The White Wizard shouts a warning.");
  assert.equal(result.body.question, "Can I see the guard?");

  const [{ init, body }] = requests;
  assert.equal(init.headers["x-api-key"], "test-key");
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.equal(body.output_config.format.type, "json_schema");
  const prompt = body.messages[0].content.map(block => block.text).join("\n");
  assert.ok(!body.messages[0].content.some(block => block.text.startsWith("CAMPAIGN HISTORY")), "no history block when the campaign has none");
  assert.match(prompt, /Roan the Last Shadow/);
  assert.match(prompt, /LATEST DM UPDATE:\nRoll initiative/);
  assert.match(prompt, /THIS SESSION SO FAR[\s\S]*Last time: the party reached the casino/);
  const [ready, unconfirmed] = prompt.split("UNCONFIRMED");
  assert.match(ready, /Razor Shuriken/);
  assert.doesNotMatch(ready, /Test move/);
  assert.match(unconfirmed, /Test move/);
  assert.match(body.system, /Never recommend anything listed under UNCONFIRMED/);
});

test("same scene and character is cached; a fast repeat for a new scene is throttled", async () => {
  const { post, host } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "k" });
  await post("/advise", { character: 1 });
  await post("/advise", { character: 1 });
  assert.equal(requests.length, 1);
  await post("/scene", { text: "The captain shouts." }, { "x-table-host": host });
  assert.equal((await post("/advise", { character: 1 })).status, 429);
  assert.equal((await post("/advise", { character: 2 })).status, 200);
  assert.equal(requests.length, 2);
});

test("refusals and bad input fail cleanly", async () => {
  const { post } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "k" });
  reply = () => ({ stop_reason: "refusal", content: [] });
  const refused = await post("/advise", { character: 3 });
  assert.equal(refused.status, 502);
  assert.match(refused.body.error, /declined/);
  assert.equal((await post("/advise", { character: 9 })).status, 400);
});

test("campaign history goes first, cached for an hour, and can't add abilities", async () => {
  const { claudeRequest } = await import("../src/advice.js");
  const character = { name: "Roan", role: "", moves: "explore | Shadow swap" };
  const body = JSON.parse(claudeRequest("k", character, [{ id: 1, text: "The vault door." }], "Session 1: Schalissa hired us.").body);
  const [history, turn] = body.messages[0].content;
  assert.match(history.text, /Schalissa/);
  assert.deepEqual(history.cache_control, { type: "ephemeral", ttl: "1h" });
  assert.match(turn.text, /LATEST DM UPDATE:\nThe vault door/);
  assert.equal(turn.cache_control, undefined);
  assert.match(body.system, /never count as available unless the character's sheet lists them as READY/);
});

test("Claude reads the whole session and is asked for the bigger picture", async () => {
  const { claudeRequest, sessionWindow, SESSION_CHARS, readAdvice } = await import("../src/advice.js");
  const scenes = Array.from({ length: 40 }, (_, index) => ({ id: index + 1, text: "Update " + (index + 1) + ": the employer's seal appears again." }));
  const body = JSON.parse(claudeRequest("k", { name: "Roan", role: "", moves: "" }, scenes, "History.").body);
  const [history, session, turn] = body.messages[0].content;
  assert.equal(history.cache_control.ttl, "1h");
  assert.match(session.text, /Update 1:[\s\S]*Update 39:/, "every earlier update is sent, not just the last six");
  assert.deepEqual(session.cache_control, { type: "ephemeral" });
  assert.match(turn.text, /LATEST DM UPDATE:\nUpdate 40:/);
  assert.match(body.system, /bigger picture the DM is building/);
  assert.ok(body.output_config.format.schema.required.includes("big_picture"));
  assert.equal(body.output_config.effort, "medium");

  const long = Array.from({ length: 400 }, (_, index) => ({ id: index, text: "x".repeat(200) }));
  const kept = sessionWindow(long);
  assert.ok(kept.length < 400 && kept.at(-1) === long.at(-1));
  assert.ok(kept.reduce((sum, scene) => sum + scene.text.length, 0) <= SESSION_CHARS);

  const advice = await readAdvice(Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    big_picture: "The DM seems to be building toward the employer being the strangler.", situation: "Investigating",
    options: [{ action: "a", why: "b" }, { action: "c", why: "d" }], ask_dm: "q" }) }] }));
  assert.match(advice.bigPicture, /employer/);
});

test("player actions are woven into the session and the newest are called out", async () => {
  const { claudeRequest } = await import("../src/advice.js");
  const scenes = [
    { id: 1, text: "Recap.", created: 1000 },
    { id: 2, text: "You cross to the tavern.", created: 2000 },
    { id: 3, text: "A hooded figure sits alone.", created: 4000 }
  ];
  const actions = [
    { name: "The White Wizard", text: "views his surroundings", created: 3000 },
    { name: "Dum Dum", text: "walks up to the hooded figure", created: 5000 }
  ];
  const body = JSON.parse(claudeRequest("k", { name: "Arcturus", role: "", moves: "" }, scenes, "", actions).body);
  const [session, turn] = body.messages[0].content;
  assert.match(session.text, /DM: You cross to the tavern\.\n- The White Wizard \(player\): views his surroundings/);
  assert.doesNotMatch(session.text, /Dum Dum/);
  assert.match(turn.text, /LATEST DM UPDATE:\nA hooded figure sits alone\.\n\nPLAYER ACTIONS SINCE THAT UPDATE[^\n]*\n- Dum Dum: walks up to the hooded figure/);
  assert.match(body.system, /Build on what this character already declared/);
});

test("a question reaches Claude, and three options come back with explanations and editable lines", async () => {
  const { claudeRequest, readAdvice, adviceSchema } = await import("../src/advice.js");
  const body = JSON.parse(claudeRequest("k", { name: "The White Wizard", role: "cleric", moves: "combat | Silence" },
    [{ id: 1, text: "Two guards hold your arms.", created: 1 }], "", [], "Can I cast Silence with one arm held?").body);
  assert.match(body.messages[0].content.at(-1).text, /THE PLAYER'S QUESTION:\nCan I cast Silence with one arm held\?/);
  assert.match(body.system, /exactly three options/);
  assert.match(body.system, /bonus action, reaction/);
  assert.deepEqual(adviceSchema.properties.options.items.required, ["action", "why", "explain", "declare"]);
  assert.ok(adviceSchema.required.includes("answer"));

  const advice = await readAdvice(Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    answer: "Probably: Silence needs a free hand for its gesture, and one arm is free. The DM decides.",
    big_picture: "", situation: "Restrained", ask_dm: "Is my casting hand free?",
    options: ["a", "b", "c", "d"].map(letter => ({ action: letter, why: "w", explain: "Uses your action.", declare: "The White Wizard does " + letter + "." }))
  }) }] }));
  assert.match(advice.answer, /free hand/);
  assert.equal(advice.options.length, 3);
  assert.equal(advice.options[0].explain, "Uses your action.");
  assert.equal(advice.options[2].declare, "The White Wizard does c.");
});

test("local server: a question gets its own answer, not the cached scene answer", async () => {
  const { post } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "k" });
  await post("/advise", { character: 4 });
  await new Promise(resolve => setTimeout(resolve, 10));
  reply = () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    answer: "Yes, if your shadow is within range.", big_picture: "", situation: "Question", ask_dm: "q",
    options: [{ action: "a", why: "b", explain: "c", declare: "d" }] }) }] });
  const asked = await post("/advise", { character: 3, question: "Can Roan swap with his shadow from here?" });
  assert.equal(asked.status, 200);
  assert.match(asked.body.answer, /shadow/);
  assert.match(requests.at(-1).body.messages[0].content.at(-1).text, /Can Roan swap/);
});

test("spent abilities from the player's phone reach Claude", async () => {
  const { post } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "k" });
  const spent = ["Fireball: no 3rd-level or higher spell slot left"];
  assert.equal((await post("/advise", { character: 0, spent })).status, 200);
  assert.equal(requests.length, 1);
  const prompt = requests[0].body.messages[0].content.map(block => block.text).join("\n");
  const [ready, rest] = prompt.split("SPENT right now");
  assert.ok(rest && /- Fireball: no 3rd-level/.test(rest));
  assert.ok(!/- Fireball —/.test(ready), "Fireball isn't listed as READY");
  assert.match(requests[0].body.system, /Never recommend anything listed under SPENT/);
});

test("the table snapshot (turn, HP, what's left) reaches Claude", async () => {
  const { post } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "k" });
  const table = "In combat, round 2. It is The White Wizard's turn right now.\nWhite Wizard: HP 30/75; AC 17.";
  assert.equal((await post("/advise", { character: 0, table })).status, 200);
  const prompt = requests[0].body.messages[0].content.map(block => block.text).join("\n");
  assert.match(prompt, /TABLE STATE \(from the app, right now\):\nIn combat, round 2\. It is The White Wizard's turn right now\./);
  assert.match(requests[0].body.system, /Enemy HP and AC are hidden: never guess numbers/);
  assert.equal(requests[0].body.model, "claude-sonnet-5-5");
});

test("the DM's asks: host only; enemies come back as tracker stat blocks, numbers clamped", async () => {
  const { post, host } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "test-key" });
  reply = () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    enemies: [{ name: "Masked Croupier", count: 3, cr: "5", ac: 15, hp: "11d8+22", init: 3, speed: 30, saves: [4, 5, 3, 0, 3],
      attacks: [{ name: "Brass Rake (×2)", hit: 7, damage: "1d10+4", extra_damage: "", extra_type: "", save: "Str", dc: 14, effect: "pulled 10 ft" },
        { name: "Bad dice", hit: 99, damage: "lots", extra_damage: "", extra_type: "", save: "", dc: 0, effect: "" },
        { name: "Thrown chip", hit: 7, damage: "2d6+3", extra_damage: "1d6", extra_type: "force", save: "", dc: 0, effect: "" }],
      routine: [0, 2, 7], abilities: "They fight in a line." },
    { name: "The House", count: 40, cr: "9", ac: 99, hp: "oops", init: 2, speed: 30, saves: [1, 1, 1, 1, 1, 1], attacks: [], routine: [], abilities: "" }],
    note: "A fair fight."
  }) }] });
  assert.equal((await post("/advise", { mode: "enemies", prompt: "croupiers" })).status, 403, "players can't ask");
  assert.equal((await post("/advise", { mode: "enemies", prompt: " " }, { "x-table-host": host })).status, 400);
  assert.equal(requests.length, 0);
  const result = await post("/advise", { mode: "enemies", prompt: "Three masked croupiers", table: "Fight: round 2" }, { "x-table-host": host });
  assert.equal(result.status, 200);
  const [croupier, house] = result.body.enemies;
  assert.deepEqual(croupier.attacks, [["Brass Rake (×2)", 7, "1d10+4", { save: "Str", dc: 14, effect: "pulled 10 ft" }], ["Thrown chip", 7, "2d6+3", { damage: "1d6", type: "force" }]]);
  assert.deepEqual(croupier.saves, [4, 5, 3, 0, 3, 0], "six saves, missing ones 0");
  assert.deepEqual(croupier.routine, [0, 1], "the routine follows the attacks that were kept (the chip moved from 2 to 1)");
  assert.equal(croupier.count, 3);
  assert.deepEqual([house.count, house.ac, house.hp], [12, 30, "10"], "clamped, and HP that doesn't roll falls back");
  assert.equal(result.body.note, "A fair fight.");
  const { body } = requests.at(-1);
  assert.equal(body.model, "claude-sonnet-5-5");
  assert.ok(body.system.includes("enemy stat blocks"));
  assert.deepEqual(body.output_config.format.schema.required, ["enemies", "note"]);
  const text = body.messages[0].content.map(block => block.text).join("\n");
  assert.ok(text.includes("Roll initiative. Two guards raise their muskets."), "the session goes along");
  assert.ok(text.includes("Logan Ninefingers") && text.includes("Fight: round 2") && text.includes("Three masked croupiers"));
  // Right after: the cooldown.
  assert.equal((await post("/advise", { mode: "dm", prompt: "a twist" }, { "x-table-host": host })).status, 429);
});

test("the DM assistant answers with ideas and lines to read out", async () => {
  const { post, host } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "test-key" });
  reply = () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({
    answer: "The croupiers fall back to protect the wheel.",
    ideas: [{ title: "The wheel spins", detail: "It shows what the house wants.", line: "The wheel begins to turn on its own." },
      { title: "Quiet", detail: "No line.", line: "" }, { title: "a", detail: "b", line: "c" }, { title: "dropped", detail: "", line: "" }]
  }) }] });
  const result = await post("/advise", { mode: "dm", prompt: "What would the croupiers do now?" }, { "x-table-host": host });
  assert.equal(result.status, 200);
  assert.equal(result.body.answer, "The croupiers fall back to protect the wheel.");
  assert.equal(result.body.ideas.length, 3);
  assert.equal(result.body.ideas[0].line, "The wheel begins to turn on its own.");
  assert.ok(requests.at(-1).body.system.includes("Dungeon Master"));
  assert.deepEqual(requests.at(-1).body.output_config.format.schema.required, ["answer", "ideas"]);
});

test("a split party: Claude's latest update is the one this character heard", async () => {
  const { claudeRequest, sceneHeardBy } = await import("../src/advice.js");
  const scenes = [
    { text: "The door booms shut.", created: 1 },
    { text: "🔒 To: The White Wizard\nThe wheel spins for you alone.", created: 2 },
    { text: "🔒 To: Logan Ninefingers, Dum Dum\nRakes come down in the corridor.", created: 3 }
  ];
  const text = request => JSON.parse(request.body).messages[0].content.map(block => block.text).join("\n");
  const wizard = text(claudeRequest("k", { name: "The White Wizard", moves: "" }, scenes));
  assert.match(wizard, /LATEST DM UPDATE:\n🔒 To: The White Wizard\nThe wheel spins/);
  assert.ok(wizard.includes("Rakes come down"), "the other group's update stays in the session, labeled");
  assert.match(text(claudeRequest("k", { name: "Logan Ninefingers", moves: "" }, scenes)), /LATEST DM UPDATE:\n🔒 To: Logan Ninefingers, Dum Dum/);
  // Never heard one: no latest update, rather than someone else's.
  assert.match(text(claudeRequest("k", { name: "Arcturus", moves: "" }, scenes.slice(1))), /LATEST DM UPDATE:\n\(none yet\)/);
  // Their update fell out of the session window: it's still their latest.
  const long = [scenes[1], ...Array.from({ length: 40 }, (_, i) => ({ text: "🔒 To: Logan Ninefingers\n" + "x".repeat(1000), created: 10 + i }))];
  assert.match(text(claudeRequest("k", { name: "The White Wizard", moves: "" }, long)), /LATEST DM UPDATE:\n🔒 To: The White Wizard/);
  assert.equal(sceneHeardBy("🔒 To: White Wizard\nx", "The White Wizard"), true);
  assert.equal(sceneHeardBy("🔒 To: Dum Dum\nx", "Arcturus"), false);
  assert.equal(sceneHeardBy("Everyone.", "Arcturus"), true);
});

// ── Cost: the running recap and token counts ──
const longScenes = (count, size = 400) => Array.from({ length: count }, (_, index) =>
  ({ id: index + 1, text: "Update " + index + " " + "x".repeat(size), created: 1000 + index * 10 }));

test("the recap is due only once enough has piled up, and keeps the newest lines word for word", async () => {
  const { recapPlan, storySignature, RECAP_TRIGGER, RECAP_KEEP } = await import("../src/advice.js");
  assert.equal(recapPlan(longScenes(5), []).due, false);
  const scenes = longScenes(40);
  const actions = [{ name: "Roan the Last Shadow", text: "throws a shuriken", created: 1005 }];
  const plan = recapPlan(scenes, actions);
  assert.equal(plan.due, true);
  assert.match(plan.lines[0], /^DM: Update 0 /);
  assert.equal(plan.lines[1], "Roan the Last Shadow (player): throws a shuriken");
  const keptText = scenes.filter(scene => scene.created > plan.uptoAt).map(scene => "DM: " + scene.text);
  assert.ok(keptText.join("   ").length <= RECAP_KEEP && keptText.length > 0);
  assert.ok(scenes.length * 400 > RECAP_TRIGGER);
  // After a recap, only what came later counts toward the next one.
  assert.equal(recapPlan(scenes, actions, { text: "So far.", uptoAt: plan.uptoAt, sig: storySignature(scenes, actions, plan.uptoAt) }).due, false);
});

test("with a recap, Claude gets it (cached for an hour) and only the lines after it", async () => {
  const { claudeRequest, dmRequest, storySignature } = await import("../src/advice.js");
  const scenes = longScenes(10, 20);
  const recap = { text: "The party met the dwarf mage.", uptoAt: scenes[6].created, sig: storySignature(scenes, [], scenes[6].created) };
  const body = JSON.parse(claudeRequest("k", { name: "Arcturus", role: "ranger", moves: "combat | Longbow — shoot" }, scenes, "History.", [], "", "", recap).body);
  const blocks = body.messages[0].content;
  const recapBlock = blocks.find(block => block.text.startsWith("THIS SESSION, EARLIER"));
  assert.match(recapBlock.text, /dwarf mage/);
  assert.deepEqual(recapBlock.cache_control, { type: "ephemeral", ttl: "1h" });
  const since = blocks.find(block => block.text.startsWith("THIS SESSION SINCE THAT RECAP"));
  assert.doesNotMatch(since.text, /Update 5 /);
  assert.match(since.text, /Update 7 /);
  assert.ok(blocks.filter(block => block.cache_control).length <= 4);
  const dm = JSON.parse(dmRequest("k", "dm", { scenes, recap, prompt: "A twist?" }).body);
  assert.ok(dm.messages[0].content.some(block => block.text.startsWith("THIS SESSION, EARLIER")));
  // No recap: the session block is as before.
  const plain = JSON.parse(claudeRequest("k", { name: "Arcturus", moves: "" }, scenes).body);
  assert.ok(plain.messages[0].content.some(block => block.text.startsWith("THIS SESSION SO FAR")));
});

test("the recap uses the cheap model at low effort, reports its tokens, and a failure keeps the old one", async () => {
  const { refreshRecap, storySignature, RECAP_MODEL } = await import("../src/advice.js");
  const scenes = longScenes(40);
  const used = [];
  const sent = [];
  const ok = async (url, init) => { sent.push(JSON.parse(init.body)); return Response.json({ model: RECAP_MODEL, stop_reason: "end_turn", content: [{ type: "text", text: "Recap: the vault." }], usage: { input_tokens: 900, output_tokens: 120 } }); };
  const fresh = await refreshRecap("k", scenes, [], null, [{ name: "Arcturus" }], usage => used.push(usage), ok);
  assert.equal(fresh.changed, true);
  assert.equal(fresh.recap.text, "Recap: the vault.");
  assert.equal(sent[0].model, "claude-haiku-5-5");
  assert.equal(sent[0].output_config.effort, "low");
  assert.equal(sent[0].fallbacks, undefined);
  assert.match(sent[0].messages[0].content, /THE PARTY: Arcturus/);
  assert.deepEqual(used[0], { model: "claude-haiku-5-5", input_tokens: 900, output_tokens: 120, cache_read: 0, cache_write: 0 });
  const old = { text: "Old recap.", uptoAt: 0, sig: storySignature(scenes, [], 0) };
  const failed = await refreshRecap("k", scenes, [], old, [], () => {}, async () => new Response("down", { status: 529 }));
  assert.deepEqual(failed, { recap: old, changed: false });
});

test("every answer reports the tokens it used", async () => {
  const { readAdvice, readDmHelp } = await import("../src/advice.js");
  const used = [];
  const usage = { input_tokens: 5000, output_tokens: 700, cache_read_input_tokens: 4000, cache_creation_input_tokens: 300 };
  await readAdvice(Response.json({ ...reply(), model: "claude-sonnet-5-5", usage }), value => used.push(value));
  await readDmHelp(Response.json({ model: "claude-sonnet-5-5", stop_reason: "end_turn", usage, content: [{ type: "text", text: JSON.stringify({ answer: "Yes.", ideas: [] }) }] }), value => used.push(value));
  assert.deepEqual(used[0], { model: "claude-sonnet-5-5", input_tokens: 5000, output_tokens: 700, cache_read: 4000, cache_write: 300 });
  assert.equal(used.length, 2);
});

test("local server: a long session is recapped once by the cheap model, and Ask Claude carries the recap", async () => {
  const env = { DB: openDatabase(), ANTHROPIC_API_KEY: "test-key" };
  const { post, host } = await room(env);
  for (let index = 0; index < 40; index++) await post("/scene", { text: "The vault hums, part " + index + ". " + "y".repeat(400) }, { "x-table-host": host });
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://api.anthropic.com/")) return realFetch(url, init);
    const body = JSON.parse(init.body);
    requests.push({ body });
    if (body.model === "claude-haiku-5-5") return Response.json({ model: body.model, stop_reason: "end_turn", content: [{ type: "text", text: "Recap: the party crept into the humming vault." }], usage: {} });
    return Response.json(reply());
  };
  const first = await post("/advise", { character: 0 });
  assert.equal(first.status, 200);
  assert.deepEqual(requests.map(request => request.body.model), ["claude-haiku-5-5", "claude-sonnet-5-5"]);
  assert.ok(requests[1].body.messages[0].content.some(block => /humming vault/.test(block.text)));
  // The next ask reuses the recap: no second recap call.
  await post("/advise", { character: 1 });
  assert.deepEqual(requests.map(request => request.body.model), ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-sonnet-5-5"]);
});

test("after a recap, an action between its cutoff and the next DM update still reaches Claude", async () => {
  const { claudeRequest, dmRequest, storySignature } = await import("../src/advice.js");
  const scenes = longScenes(6, 20);
  const cut = scenes[2].created;
  const recap = { text: "Earlier.", uptoAt: cut, sig: storySignature(scenes, [], cut) };
  const actions = [{ name: "JPeso", text: "casts Hold Monster", created: cut + 1 }, { name: "Roan the Last Shadow", text: "hides", created: scenes[5].created + 1 }];
  const text = body => JSON.parse(body).messages[0].content.map(block => block.text).join("\n");
  assert.match(text(claudeRequest("k", { name: "Arcturus", moves: "" }, scenes, "", actions, "", "", recap).body), /JPeso \(player\): casts Hold Monster/);
  assert.match(text(dmRequest("k", "dm", { scenes, actions, recap, prompt: "?" }).body), /JPeso \(player\): casts Hold Monster/);
});

test("editing or deleting a line the recap covers drops it, and the next recap starts over", async () => {
  const { claudeRequest, refreshRecap, storySignature } = await import("../src/advice.js");
  const scenes = longScenes(40);
  const cut = scenes[20].created;
  const recap = { text: "The mage is called Valerian.", uptoAt: cut, sig: storySignature(scenes, [], cut) };
  const edited = scenes.map(scene => scene.id === 3 ? { ...scene, text: "The mage is called Vael." } : scene);
  const text = list => JSON.parse(claudeRequest("k", { name: "Arcturus", moves: "" }, list, "", [], "", "", recap).body).messages[0].content.map(block => block.text).join("\n");
  assert.match(text(scenes), /Valerian/);
  assert.doesNotMatch(text(edited), /Valerian/);
  assert.match(text(edited), /called Vael/);
  assert.doesNotMatch(text(scenes.filter(scene => scene.id !== 3)), /Valerian/);
  // A rebuild folds from the start, without the stale recap.
  const sent = [];
  const fresh = await refreshRecap("k", edited, [], recap, [], () => {}, async (url, init) => {
    sent.push(JSON.parse(init.body));
    return Response.json({ stop_reason: "end_turn", content: [{ type: "text", text: "Rebuilt." }], usage: {} });
  });
  assert.equal(fresh.changed, true);
  assert.match(sent[0].messages[0].content, /RECAP SO FAR:\n\(none yet\)/);
  assert.match(sent[0].messages[0].content, /called Vael/);
  assert.equal(fresh.recap.sig, storySignature(edited, [], fresh.recap.uptoAt));
});
