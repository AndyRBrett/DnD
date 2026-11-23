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

test("combat: host starts it, players add initiative, enemy HP never stored", async () => {
  const { code, host } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  assert.equal((await call(room)).body.combat, null);
  assert.equal((await post(room + "/initiative", { character: 1, value: 12 })).status, 400); // not started
  const enemies = [{ id: "g1", name: "Guard 1", initiative: 14, status: "bloodied", hp: 3, maxHp: 13, ac: 16, conditions: ["Prone"] }];
  assert.equal((await post(room + "/combat", { round: 1, turn: null, enemies, reset: true })).status, 403);
  assert.equal((await post(room + "/combat", { round: 1, turn: null, enemies, reset: true }, { "x-table-host": host })).status, 200);
  assert.equal((await post(room + "/initiative", { character: 1, value: 17 })).status, 200);
  assert.equal((await post(room + "/initiative", { character: 1, value: 99 })).status, 400);
  assert.equal((await post(room + "/combat", { round: 2, turn: "pc:1", enemies }, { "x-table-host": host })).status, 200);
  const { combat } = (await call(room)).body;
  assert.deepEqual(combat, { round: 2, turn: "pc:1", party: { 1: 17 },
    enemies: [{ id: "g1", name: "Guard 1", initiative: 14, status: "bloodied", conditions: ["Prone"] }] });
  assert.equal((await post(room + "/combat", { end: true }, { "x-table-host": host })).status, 200);
  assert.equal((await call(room)).body.combat, null);
});

test("the host can edit and delete any story update", async () => {
  const { code, host } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  for (const text of ["The vault door creaks.", "A guard shouts."]) await post(room + "/scene", { text }, { "x-table-host": host });
  const [opening, first, second] = (await call(room)).body.scenes;
  assert.equal((await post(room + "/scene", { id: first.id, text: "The vault door groans open." }, { "x-table-host": host })).status, 200);
  assert.equal((await post(room + "/scene", { id: opening.id, delete: true })).status, 403);
  assert.equal((await post(room + "/scene", { id: opening.id, delete: true }, { "x-table-host": host })).status, 200);
  assert.deepEqual((await call(room)).body.scenes.map(scene => scene.text), ["The vault door groans open.", second.text]);
});

test("party HP: anyone at the table sets and adjusts it, temp HP first", async () => {
  const { code } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  assert.equal((await post(room + "/hp-adjust", { character: 0, change: -5 })).status, 400); // no max yet
  assert.equal((await post(room + "/hp", { character: 0, hp: 63, max: 75, temp: 5 })).status, 200);
  assert.equal((await post(room + "/hp-adjust", { character: 0, change: -12 })).status, 200);
  assert.deepEqual((await call(room)).body.hp["The White Wizard"], { hp: 56, max: 75, temp: 0 });
  assert.equal((await post(room + "/hp-adjust", { character: 0, change: 100 })).status, 200);
  assert.equal((await call(room)).body.hp["The White Wizard"].hp, 75);
  assert.equal((await post(room + "/hp", { character: 0, hp: 10, max: 0 })).status, 400);
  assert.equal((await post(room + "/hp", { character: 0, hp: 75, max: 75, ac: 19 })).status, 200);
  assert.equal((await post(room + "/hp", { character: 0, hp: 60, max: 75 })).status, 200); // AC kept
  assert.deepEqual((await call(room)).body.hp["The White Wizard"], { hp: 60, max: 75, temp: 0, ac: 19 });
  assert.equal((await post(room + "/hp", { character: 0, hp: 60, max: 75, ac: 99 })).status, 400);
});

test("party resources are shared through the room", async () => {
  const { code } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  assert.deepEqual((await call(room)).body.resources, {});
  assert.equal((await post(room + "/resources", { character: 2, state: { used: { Rage: 1, "slot:3": "x" }, raging: true } })).status, 200);
  assert.deepEqual((await call(room)).body.resources["Logan Ninefingers"], { used: { Rage: 1 }, raging: true });
  assert.equal((await post(room + "/resources", { character: 2, state: [] })).status, 400);
  assert.equal((await post(room + "/resources", { character: 9, state: { used: {} } })).status, 400);
});
