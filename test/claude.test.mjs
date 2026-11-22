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
  const prompt = body.messages[0].content;
  assert.match(prompt, /The White Wizard/);
  assert.match(prompt, /LATEST: Roll initiative/);
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
