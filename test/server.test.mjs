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
  const font = await worker.fetch(new Request("http://local/fonts/barlow-400-latin.woff2"), env);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/woff2");
  assert.equal(new TextDecoder().decode((await font.arrayBuffer()).slice(0, 4)), "wOF2");
  const icon = await worker.fetch(new Request("http://local/icons/icon-192.png"), env);
  assert.equal(icon.headers.get("content-type"), "image/png");
  for (const name of ["manifest.json", "sw.js"]) assert.equal((await worker.fetch(new Request("http://local/" + name), env)).status, 200, name);
});

test("room lifecycle: create, read, publish, correct, edit party, close", async () => {
  assert.equal((await call("/api/rooms", { method: "POST" })).status, 400);
  const created = await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } });
  assert.equal(created.status, 200);
  const { code, host } = created.body;
  const room = "/api/rooms/" + code;

  const first = await call(room);
  assert.equal(first.body.party.length, 6);
  assert.deepEqual(first.body.party.map(member => member.name),
    ["The White Wizard", "Arcturus", "Logan Ninefingers", "Dum Dum", "Roan the Last Shadow", "JPeso"]);
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
  assert.equal((await post(room + "/party", { party: [] }, { "x-table-host": host })).status, 400);
  assert.equal((await post(room + "/party", { party: [...party, ...party] }, { "x-table-host": host })).status, 400, "up to eight");

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
  // The DM sits a character out of the fight, and brings them back.
  assert.equal((await post(room + "/combat", { sitOut: { character: 0, out: true } })).status, 403);
  assert.equal((await post(room + "/combat", { sitOut: { character: 9, out: true } }, { "x-table-host": host })).status, 400);
  assert.equal((await post(room + "/combat", { sitOut: { character: 0, out: true } }, { "x-table-host": host })).status, 200);
  assert.deepEqual((await call(room)).body.combat.party, { 0: "out", 1: 17 });
  assert.equal((await post(room + "/combat", { sitOut: { character: 0, out: false } }, { "x-table-host": host })).status, 200);
  assert.deepEqual((await call(room)).body.combat.party, { 1: 17 });
  assert.equal((await post(room + "/combat", { end: true }, { "x-table-host": host })).status, 200);
  assert.equal((await call(room)).body.combat, null);
  assert.equal((await post(room + "/combat", { sitOut: { character: 0, out: true } }, { "x-table-host": host })).status, 400); // no fight
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

test("the player whose turn it is can pass it, in initiative order", async () => {
  const { code, host } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  const enemies = [{ id: "a", name: "Bandit 1", initiative: 15 }, { id: "b", name: "Bandit 2", initiative: 12 }, { id: "c", name: "Bandit 3", initiative: 20, status: "down" }];
  await post(room + "/combat", { round: 1, turn: "pc:0", enemies, reset: true }, { "x-table-host": host });
  await post(room + "/initiative", { character: 0, value: 18 });
  await post(room + "/initiative", { character: 2, value: 12 });
  assert.equal((await post(room + "/pass-turn", { character: 1 })).status, 400); // not your turn
  assert.deepEqual((await post(room + "/pass-turn", { character: 0 })).body, { turn: "en:a", round: 1 }); // skips downed Bandit 3
  await post(room + "/combat", { round: 1, turn: "pc:2", enemies }, { "x-table-host": host });
  assert.deepEqual((await post(room + "/pass-turn", { character: 2 })).body, { turn: "en:b", round: 1 }); // party first on ties
  await post(room + "/combat", { round: 3, turn: "pc:5", enemies }, { "x-table-host": host });
  assert.deepEqual((await post(room + "/pass-turn", { character: 5 })).body, { turn: "pc:0", round: 4 }); // new round
  assert.equal((await call(room)).body.combat.turn, "pc:0");
  // A character sitting out is skipped.
  await post(room + "/combat", { sitOut: { character: 0, out: true } }, { "x-table-host": host });
  await post(room + "/combat", { round: 4, turn: "pc:5", enemies }, { "x-table-host": host });
  assert.deepEqual((await post(room + "/pass-turn", { character: 5 })).body, { turn: "en:a", round: 5 });
});

test("tables stay open while there's activity, and close after 3 idle days", async () => {
  const { code, host } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  const hour = 60 * 60 * 1000;
  env.DB.sql.prepare("UPDATE rooms SET created = ?, last_active = ? WHERE code = ?").run(Date.now() - 20 * hour, Date.now() - 20 * hour, code);
  assert.equal((await call(room)).status, 200, "idle overnight: still open, the game picks up where it stopped");
  env.DB.sql.prepare("UPDATE rooms SET created = ?, last_active = ? WHERE code = ?").run(Date.now() - 80 * hour, Date.now() - 80 * hour, code);
  env.DB.sql.prepare("UPDATE scenes SET created = ? WHERE code = ?").run(Date.now() - 80 * hour, code);
  assert.equal((await call(room)).status, 404, "no activity for over 3 days: closed");
  env.DB.sql.prepare("UPDATE rooms SET last_active = ? WHERE code = ?").run(Date.now() - hour, code);
  assert.equal((await call(room)).status, 200, "activity an hour ago keeps it open");
  assert.equal((await post(room + "/scene", { text: "Roll initiative." }, { "x-table-host": host })).status, 200);
  const latest = (await call(room)).body.scenes.at(-1);
  assert.equal((await post(room + "/scene", { delete: true, id: latest.id }, { "x-table-host": host })).status, 200);
  assert.equal((await call(room)).status, 200, "deleting the newest scene doesn't end the table");
});

test("enemy-only updates keep the turn and never reopen an ended fight", async () => {
  const { code, host } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  const enemies = [{ id: "a", name: "Orc", initiative: 5, status: "ok", conditions: [] }];
  await post(room + "/combat", { round: 1, turn: null, enemies, reset: true }, { "x-table-host": host });
  await post(room + "/initiative", { character: 0, value: 18 });
  await post(room + "/combat", { round: 1, turn: "pc:0", enemies }, { "x-table-host": host });
  await post(room + "/pass-turn", { character: 0 }); // the player passes...
  const hurt = [{ ...enemies[0], status: "bloodied" }];
  await post(room + "/combat", { enemies: hurt, enemiesOnly: true }, { "x-table-host": host }); // ...as the DM updates the orc
  const combat = (await call(room)).body.combat;
  assert.equal(combat.turn, "en:a");
  assert.equal(combat.enemies[0].status, "bloodied");
  await post(room + "/combat", { end: true }, { "x-table-host": host });
  assert.equal((await post(room + "/combat", { enemies: hurt, enemiesOnly: true }, { "x-table-host": host })).status, 200);
  assert.equal((await call(room)).body.combat, null);
});

test("two players rolling initiative at once both count", async () => {
  const { code, host } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  assert.equal((await post(room + "/initiative", { character: 0, value: 12 })).status, 400); // no fight yet
  await post(room + "/combat", { round: 1, turn: null, enemies: [], reset: true }, { "x-table-host": host });
  await Promise.all([post(room + "/initiative", { character: 0, value: 12 }), post(room + "/initiative", { character: 1, value: 7 })]);
  assert.deepEqual((await call(room)).body.combat.party, { 0: 12, 1: 7 });
});

test("a practice table keeps its own HP; the campaign's carries between tables", async () => {
  const create = practice => call("/api/rooms", { method: "POST", headers: { "x-table-action": "create", ...(practice ? { "x-table-practice": "1" } : {}) } });
  const real = "/api/rooms/" + (await create(false)).body.code;
  const next = "/api/rooms/" + (await create(false)).body.code;
  const practice = "/api/rooms/" + (await create(true)).body.code;
  assert.match((await call(practice)).body.scenes[0].text, /^PRACTICE TABLE/);
  await post(real + "/hp", { character: 1, hp: 60, max: 60 });
  await post(practice + "/hp", { character: 1, hp: 60, max: 60 });
  await post(practice + "/hp-adjust", { character: 1, change: -10 });
  const name = (await call(real)).body.party[1].name;
  assert.equal((await call(practice)).body.hp[name].hp, 50);
  assert.equal((await call(real)).body.hp[name].hp, 60, "practice damage stays on the practice table");
  assert.equal((await call(next)).body.hp[name].hp, 60, "campaign HP carries to the next table");
});

test("who's at the table: phones check in by character, never keep the table open, and death saves share", async () => {
  const { code } = (await call("/api/rooms", { method: "POST", headers: { "x-table-action": "create" } })).body;
  const room = "/api/rooms/" + code;
  assert.deepEqual((await call(room)).body.here, []);
  assert.equal((await post(room + "/here", { character: 2, phone: "phone-a" })).status, 200);
  assert.equal((await post(room + "/here", { character: 4, phone: "phone-b" })).status, 200);
  assert.equal((await post(room + "/here", { character: 3, phone: "phone-a" })).status, 200); // switched characters
  assert.deepEqual((await call(room)).body.here.map(entry => entry.character), [3, 4]);
  assert.equal((await post(room + "/here", { character: 9, phone: "phone-a" })).status, 400);
  assert.equal((await post(room + "/here", { character: 1 })).status, 400);
  // Death saves ride in the shared resources record.
  assert.equal((await post(room + "/resources", { character: 2, state: { used: { "Death successes": 1, "Death failures": 2 }, raging: false } })).status, 200);
  assert.deepEqual((await call(room)).body.resources["Logan Ninefingers"].used, { "Death successes": 1, "Death failures": 2 });
});
