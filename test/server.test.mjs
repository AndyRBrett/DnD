// Drives the built worker (dist/server/index.js) against an in-memory SQLite
// database, the same way scripts/local.mjs serves it. Run via `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../dist/server/index.js";
import { openDatabase } from "../scripts/sqlite-db.mjs";

const env = { DB: openDatabase() };
const call = async (path, init = {}) => {
  const response = await worker.fetch(new Request("http://localhost" + path, init), env);
  const type = response.headers.get("content-type") ?? "";
  return { status: response.status, body: type.includes("json") ? await response.json() : await response.text() };
};
const post = (path, body, headers = {}) => call(path, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body)
});

test("serves the app shell and assets", async () => {
  for (const path of ["/", "/app.js", "/scene-options.js", "/style.css"]) {
    assert.equal((await call(path)).status, 200, path);
  }
  assert.equal((await call("/secret")).status, 404);
});

test("room lifecycle: create, read, publish, correct, edit party, close", async () => {
  assert.equal((await call("/api/rooms", { method: "POST" })).status, 400);
  const created = await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } });
  assert.equal(created.status, 200);
  const { code, host } = created.body;
  const room = "/api/rooms/" + code;

  const first = await call(room);
  assert.equal(first.body.party.length, 5);
  assert.deepEqual(first.body.party.map(member => member.name),
    ["The White Wizard", "Arcturus", "Logan Ninefingers", "Dum Dum", "Roan the Last Shadow"]);
  assert.equal(first.body.scenes.length, 1);

  assert.equal((await post(room + "/scene", { text: "Roll initiative." })).status, 403);
  assert.equal((await post(room + "/scene", { text: "Roll initiative." }, { "x-table-host": host })).status, 200);
  const published = (await call(room)).body.scenes.at(-1);
  assert.equal(published.text, "Roll initiative.");

  await post(room + "/scene", { text: "Roll for initiative.", id: published.id }, { "x-table-host": host });
  const corrected = (await call(room)).body.scenes;
  assert.equal(corrected.length, 2);
  assert.equal(corrected.at(-1).text, "Roll for initiative.");

  assert.equal((await post(room + "/scene", { text: "" }, { "x-table-host": host })).status, 400);
  assert.equal((await post(room + "/scene", { text: "x".repeat(1501) }, { "x-table-host": host })).status, 400);

  const party = first.body.party.map(member => ({ ...member }));
  party[3].moves += "\ncombat | Grapple — confirmed by the DM.";
  assert.equal((await post(room + "/party", { party }, { "x-table-host": host })).status, 200);
  assert.match((await call(room)).body.party[3].moves, /Grapple/);
  assert.equal((await post(room + "/party", { party: party.slice(0, 4) }, { "x-table-host": host })).status, 400);

  assert.equal((await post(room + "/close", {}, { "x-table-host": host })).status, 200);
  assert.equal((await call(room)).status, 404);
});

test("rejects malformed room links", async () => {
  assert.equal((await call("/api/rooms/not-a-room")).status, 404);
});
