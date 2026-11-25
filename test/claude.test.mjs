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
