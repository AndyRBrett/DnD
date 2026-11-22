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
      { action: "Move behind the bar.", why: "Cover from muskets." }, { action: "extra", why: "dropped" }],
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

test("a player can ask; the request respects the sheet and the answer is trimmed to two", async () => {
  const { call, post } = await room({ DB: openDatabase(), ANTHROPIC_API_KEY: "test-key" });
  assert.equal((await call("")).body.ai, true);
  const result = await post("/advise", { character: 0 });
  assert.equal(result.status, 200);
  assert.equal(result.body.options.length, 2);
  assert.equal(result.body.question, "Can I see the guard?");

  const [{ init, body }] = requests;
  assert.equal(init.headers["x-api-key"], "test-key");
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.output_config.format.type, "json_schema");
  const prompt = body.messages[0].content.map(block => block.text).join("\n");
  assert.ok(!body.messages[0].content.some(block => block.text.startsWith("CAMPAIGN HISTORY")), "no history block when the campaign has none");
  assert.match(prompt, /The White Wizard/);
  assert.match(prompt, /LATEST DM UPDATE:\nRoll initiative/);
  assert.match(prompt, /THIS SESSION SO FAR[\s\S]*Last time: the party reached the casino/);
  const [ready, unconfirmed] = prompt.split("UNCONFIRMED");
  assert.match(ready, /Sacred Flame/);
  assert.doesNotMatch(ready, /Divine Intervention/);
  assert.match(unconfirmed, /Divine Intervention/);
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
