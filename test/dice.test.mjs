import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, roll, normalize, poolExpression, rollableFrom } from "../src/dice.js";
import { templates, createEnemies, applyHp, status, standing, rollInitiative, hitPoints } from "../src/encounter.js";

// A fixed random source: returns the given faces (1-based) for the next rolls.
const faces = (sides, ...values) => { const queue = [...values]; return () => (queue.shift() - 1) / sides + 1e-9; };

test("parses common dice expressions and rejects junk", () => {
  assert.deepEqual(parse("2d8+5"), { dice: [{ count: 2, sides: 8, sign: 1 }], modifier: 5 });
  assert.deepEqual(parse("d20-1"), { dice: [{ count: 1, sides: 20, sign: 1 }], modifier: -1 });
  assert.equal(normalize("+11"), "d20+11");
  assert.equal(normalize("−1"), "d20-1");
  for (const bad of ["", "hello", "2d", "d1", "500d6", "1d6++2"]) assert.equal(parse(bad), null, bad);
});

test("rolls totals with breakdowns, crits, and fumbles", () => {
  const hit = roll("+11", { random: faces(20, 7) });
  assert.equal(hit.total, 18);
  assert.equal(hit.natural, 7);
  assert.match(hit.breakdown, /d20: 7 \+ 11/);
  assert.ok(roll("d20+5", { random: faces(20, 20) }).critical);
  assert.ok(roll("d20+5", { random: faces(20, 1) }).fumble);
  const damage = roll("2d8+5", { random: faces(8, 3, 6) });
  assert.equal(damage.total, 14);
  assert.equal(damage.natural, null);
});

test("advantage keeps the higher d20, disadvantage the lower", () => {
  assert.equal(roll("d20+3", { mode: "advantage", random: faces(20, 4, 15) }).total, 18);
  const low = roll("d20+3", { mode: "disadvantage", random: faces(20, 4, 15) });
  assert.equal(low.total, 7);
  assert.equal(low.dropped, 15);
  assert.equal(roll("2d6", { mode: "advantage", random: faces(6, 2, 3) }).mode, "normal", "only a single d20 rolls twice");
});

test("pool expressions and rollable sheet values", () => {
  assert.equal(poolExpression({ 20: 1 }, 9), "d20+9");
  assert.equal(poolExpression({ 6: 2, 8: 1 }, -1), "d8+2d6-1");
  assert.equal(poolExpression({}, 3), "");
  assert.equal(rollableFrom("+11"), "d20+11");
  assert.equal(rollableFrom("+2 adv."), "d20+2");
  assert.equal(rollableFrom("2d8+5"), "2d8+5");
  assert.equal(rollableFrom("+9*"), "d20+9");
  assert.equal(rollableFrom("17"), null, "a DC isn't rolled");
  assert.equal(rollableFrom("16–17*"), null);
});

test("encounter: templates create numbered enemies with rolled or fixed HP", () => {
  const guard = templates.find(template => template.name === "Guard");
  const guards = createEnemies(guard, 3, faces(8, 4, 5, 1, 1, 8, 8));
  assert.deepEqual(guards.map(enemy => enemy.name), ["Guard 1", "Guard 2", "Guard 3"]);
  assert.deepEqual(guards.map(enemy => enemy.maxHp), [11, 4, 18]);
  assert.equal(createEnemies({ name: "Boss", hp: "45", ac: 15 }, 1)[0].name, "Boss");
  assert.equal(hitPoints("45"), 45);
  for (const template of templates) {
    assert.ok(parse(template.hp), template.name + " hp");
    for (const [, , damage] of template.attacks) assert.ok(parse(damage), template.name + " " + damage);
  }
});

test("encounter: damage, healing, status, count, initiative order", () => {
  let [enemy] = createEnemies({ name: "Thug", hp: "32", ac: 11, init: 0 }, 1);
  enemy = applyHp(enemy, -20);
  assert.equal(status(enemy), "bloodied");
  enemy = applyHp(enemy, -50);
  assert.equal(enemy.hp, 0);
  assert.equal(status(enemy), "down");
  enemy = applyHp(enemy, 100);
  assert.equal(enemy.hp, 32, "healing caps at max");
  const group = [...createEnemies({ name: "A", hp: "5", init: 0 }, 2), { ...enemy, hp: 0 }];
  assert.equal(standing(group), 2);
  const order = rollInitiative(createEnemies({ name: "B", hp: "5", init: 2 }, 3), faces(20, 3, 18, 10));
  assert.deepEqual(order.map(enemy => enemy.initiative), [20, 12, 5]);
});

test("combat order, turns, and what players may see", async () => {
  const { publicEnemies, combatOrder, nextTurn, upNext, createEnemies, applyHp } = await import("../src/encounter.js");
  const [guard] = createEnemies({ name: "Guard", ac: 16, hp: "12", attacks: [["Spear", 3, "1d6+1"]] }, 1);
  const hurt = { ...applyHp(guard, -7), initiative: 15, conditions: ["Prone"] };
  const shown = publicEnemies([hurt])[0];
  assert.deepEqual(Object.keys(shown).sort(), ["conditions", "id", "initiative", "name", "status"]);
  assert.equal(shown.status, "bloodied");

  const party = [{ name: "Logan" }, { name: "Dum Dum" }, { name: "Arcturus" }];
  const combat = { round: 1, turn: null, party: { 0: 15, 2: 20 }, enemies: [shown, { id: "x", name: "Wolf", initiative: 8, status: "down", conditions: [] }] };
  const order = combatOrder(combat, party);
  assert.deepEqual(order.map(entry => entry.key), ["pc:2", "pc:0", "en:" + guard.id, "en:x", "pc:1"]);
  assert.deepEqual(nextTurn(order, null, 1), { turn: "pc:2", round: 1 });
  assert.deepEqual(nextTurn(order, "en:" + guard.id, 1), { turn: "pc:1", round: 1 }); // skips the downed wolf
  assert.deepEqual(nextTurn(order, "pc:1", 1), { turn: "pc:2", round: 2 });
  assert.deepEqual(nextTurn(order, "pc:2", 2, -1), { turn: "pc:1", round: 1 });
  assert.equal(upNext(order, "pc:0"), "en:" + guard.id);
});
