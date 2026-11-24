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
  const more = createEnemies({ name: "Guard", hp: "12" }, 2, undefined, [guard]);
  assert.deepEqual(more.map(enemy => enemy.name), ["Guard 2", "Guard 3"]); // unique, for hit reports
  assert.equal(createEnemies({ name: "Guard", hp: "12" }, 1, undefined, [guard, ...more])[0].name, "Guard 4");
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
  // The current enemy goes down on its own turn: step on from its place.
  assert.deepEqual(nextTurn(order, "en:x", 1), { turn: "pc:1", round: 1 });
  const lastDown = combatOrder({ ...combat, party: { 0: 15, 1: 1, 2: 20 }, enemies: [shown, { id: "x", name: "Wolf", initiative: 0, status: "down", conditions: [] }] }, party);
  assert.equal(lastDown.at(-1).key, "en:x");
  assert.deepEqual(nextTurn(lastDown, "en:x", 1), { turn: "pc:2", round: 2 }); // last in order: new round
  assert.equal(upNext(lastDown, "en:x"), "pc:2");
});

test("3D dice are real polyhedra with every number once", async () => {
  const { describeSolid, percentileLabels } = await import("../src/dice3d.js");
  const shapes = { 4: 3, 6: 4, 8: 3, 10: 4, 12: 5, 20: 3 };
  for (const [kind, corners] of Object.entries(shapes)) {
    const solid = describeSolid(Number(kind));
    assert.equal(solid.faces, Number(kind), "d" + kind + " faces");
    assert.ok(solid.sides.every(count => count === corners), "d" + kind + " face shape");
    assert.deepEqual(solid.slots, Array.from({ length: Number(kind) }, (_, i) => i), "d" + kind + " numbers");
    assert.ok(solid.opposite, "d" + kind + " opposite faces");
  }
  assert.deepEqual(percentileLabels(84), { tens: "80", units: "4" });
  assert.deepEqual(percentileLabels(100), { tens: "00", units: "0" });
  assert.deepEqual(percentileLabels(7), { tens: "00", units: "7" });
});

test("party HP: sheet max, temp HP first, heal to max", async () => {
  const { maxHpFromSheet, changePartyHp, partyHpStatus } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const hpLine = name => Object.fromEntries(sheets[name].combat)["HP"];
  assert.equal(maxHpFromSheet(hpLine("The White Wizard")), 75);
  assert.equal(maxHpFromSheet(hpLine("Dum Dum")), 94);
  assert.equal(maxHpFromSheet(hpLine("Logan Ninefingers")), 115);
  assert.equal(maxHpFromSheet("current unknown"), null);
  const wizard = { hp: 63, max: 75, temp: 5 };
  assert.deepEqual(changePartyHp(wizard, -12), { hp: 56, max: 75, temp: 0 });
  assert.deepEqual(changePartyHp(wizard, -3), { hp: 63, max: 75, temp: 2 });
  assert.deepEqual(changePartyHp(wizard, 50), { hp: 75, max: 75, temp: 5 });
  assert.deepEqual(changePartyHp(wizard, -500), { hp: 0, max: 75, temp: 0 });
  assert.equal(partyHpStatus({ hp: 30, max: 75 }), "bloodied");
  assert.equal(partyHpStatus({ hp: 0, max: 75 }), "down");
  assert.equal(partyHpStatus(undefined), "unknown");
});

test("combat stats come from the sheet, with a confirmed AC on top", async () => {
  const { combatStats, concentrationDc } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const pick = (stats, label) => stats.find(stat => stat.label === label);
  const wizard = combatStats(sheets["The White Wizard"]);
  assert.equal(pick(wizard, "AC").value, "17");
  assert.equal(pick(wizard, "Speed").value, "30 ft");
  assert.equal(pick(wizard, "Passive Perc.").value, "19");
  assert.equal(pick(wizard, "Spell DC").value, "17");
  const dumDum = combatStats(sheets["Dum Dum"]);
  assert.equal(pick(dumDum, "AC").unconfirmed, true);
  assert.equal(pick(combatStats(sheets["Dum Dum"], { ac: 20 }), "AC").value, "20");
  assert.equal(pick(combatStats(sheets["Dum Dum"], { ac: 20 }), "AC").unconfirmed, false);
  assert.equal(pick(combatStats(sheets["Logan Ninefingers"]), "Initiative").value, "+2 adv.");
  assert.equal(concentrationDc(7), 10);
  assert.equal(concentrationDc(31), 15);
});

test("attacks against AC, hit reports, and death saves", async () => {
  const { attackOutcome, hitReportText, parseHitReport, deathSave } = await import("../src/encounter.js");
  assert.equal(attackOutcome({ total: 16, critical: false, fumble: false }, 16), "hit");
  assert.equal(attackOutcome({ total: 15, critical: false, fumble: false }, 16), "miss");
  assert.equal(attackOutcome({ total: 25, critical: false, fumble: true }, 16), "miss");
  assert.equal(attackOutcome({ total: 21, critical: true, fumble: false }, 30), "crit");
  assert.equal(attackOutcome({ total: 12, critical: false, fumble: false }, NaN), "unknown");

  const line = hitReportText("Bandit 2", 14);
  assert.equal(parseHitReport(line).enemy, "Bandit 2");
  assert.equal(parseHitReport(line).amount, 14);
  assert.equal(parseHitReport("hit Bandit 2 for 14 damage"), null);
  assert.equal(parseHitReport("🎯 hit the wall for lots damage"), null);

  let saves = deathSave(null, 12);
  assert.deepEqual(saves, { successes: 1, failures: 0, outcome: null });
  saves = deathSave(saves, 1);
  assert.deepEqual(saves, { successes: 1, failures: 2, outcome: null });
  assert.equal(deathSave(saves, 5).outcome, "dead");
  assert.equal(deathSave({ successes: 2, failures: 2 }, 10).outcome, "stable");
  assert.deepEqual(deathSave({ successes: 1, failures: 2 }, 20), { successes: 0, failures: 0, outcome: "revived" });
});

test("character attacks: options, crits, Brutal Critical, and the report line", async () => {
  const { critExpression } = await import("../src/dice.js");
  const { buildAttack, hitReportText, parseHitReport } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  assert.equal(critExpression("1d8+5"), "2d8+5");
  assert.equal(critExpression("1d12+4+3", 1), "3d12+4+3");
  assert.equal(critExpression("4d6+4d6"), "8d6+8d6");

  const logan = sheets["Logan Ninefingers"];
  const [rage, reckless, gwm] = logan.attackOptions;
  const greataxe = logan.attacks[0];
  assert.deepEqual(buildAttack(greataxe, [rage]), { save: null, toHit: "d20+8", hitBonus: 8, mode: "normal", damage: "1d12+4+3" });
  assert.equal(buildAttack(greataxe, [rage, reckless]).mode, "advantage");
  assert.equal(buildAttack(greataxe, [rage, gwm]).toHit, "d20+3");
  assert.equal(buildAttack(greataxe, [rage, gwm]).damage, "1d12+4+3+10");
  assert.equal(buildAttack(greataxe, [rage], { crit: true, extraCritDice: logan.critExtraDice }).damage, "3d12+4+3"); // matches the sheet's 3d12+7

  const fireball = sheets["The White Wizard"].attacks.find(attack => attack.name === "Fireball");
  const built = buildAttack(fireball, []);
  assert.equal(built.toHit, null);
  assert.equal(built.save, "Dex save, DC 17, half on a save");

  for (const sheet of Object.values(sheets)) {
    for (const attack of sheet.attacks) {
      assert.ok(attack.hit !== undefined || (attack.save && attack.dc), sheet.title + " " + attack.name);
      assert.ok(buildAttack(attack, sheet.attackOptions, { crit: true }).damage.match(/^\d+d\d+/), attack.name);
    }
  }

  const line = hitReportText("Bandit 2", 14, "with Greataxe, 19 to hit");
  assert.deepEqual(parseHitReport(line), { enemy: "Bandit 2", amount: 14, detail: "with Greataxe, 19 to hit", toHit: 19, crit: false, halfOnSave: false });
  assert.equal(parseHitReport(hitReportText("Guard 1", 30, "with Fireball, Dex save, DC 17, half on a save")).halfOnSave, true);
  assert.deepEqual(parseHitReport(hitReportText("Bandit 2", 7)), { enemy: "Bandit 2", amount: 7, detail: "", toHit: null, crit: false, halfOnSave: false });
});

test("attacks show their ability modifier, and the math adds up", async () => {
  const { abilityMods, attackBreakdown } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const logan = sheets["Logan Ninefingers"];
  assert.deepEqual(abilityMods(logan).find(entry => entry.ability === "STR"), { ability: "STR", score: 18, mod: 4, save: 8, proficient: true });
  assert.equal(abilityMods(sheets["The White Wizard"]).find(entry => entry.ability === "STR").save, -1);
  const [rage] = logan.attackOptions;
  const greataxe = attackBreakdown(logan.attacks[0], logan, [rage]);
  assert.equal(greataxe.hit, "d20 + STR +4 + Prof +4 = +8");
  assert.equal(greataxe.damage, "1d12 + STR +4 + Raging +3");
  const arcturus = sheets.Arcturus;
  assert.equal(attackBreakdown(arcturus.attacks[0], arcturus).hit, "d20 + DEX +5 + Prof +4 + Archery +2 = +11");
  const wizard = sheets["The White Wizard"];
  assert.equal(attackBreakdown(wizard.attacks.find(attack => attack.name === "Fireball"), wizard).dc, "DC 17 = 8 + WIS +5 + Prof +4");
  // Every attack's listed bonus matches ability + proficiency + bonuses, and
  // weapon damage includes the ability modifier.
  for (const sheet of Object.values(sheets)) {
    const prof = Number.parseInt(Object.fromEntries(sheet.combat).Proficiency, 10);
    for (const attack of sheet.attacks) {
      const mod = abilityMods(sheet).find(entry => entry.ability === attack.ability)?.mod;
      assert.ok(Number.isFinite(mod), attack.name + " has an ability");
      if (attack.save) assert.equal(attack.dc, 8 + mod + prof, attack.name + " DC");
      else assert.equal(attack.hit, mod + prof + (attack.bonus ?? []).reduce((sum, [, value]) => sum + value, 0), attack.name + " to hit");
      if (attack.addMod !== false) assert.ok(attack.damage.endsWith("+" + mod), attack.name + " damage includes " + attack.ability);
    }
  }
});

test("spell slots, rage, and rests", async () => {
  const { slotKey, resourceLeft, spendResource, rest, castableLevels, upcastAttack } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const wizard = sheets["The White Wizard"];
  const fireball = wizard.attacks.find(attack => attack.name === "Fireball");
  let state = {};
  assert.equal(resourceLeft(wizard, state, slotKey(3)), 3);
  assert.deepEqual(castableLevels(fireball, wizard, state), [3, 4, 5]);
  state = spendResource(wizard, state, slotKey(3), 3);
  assert.equal(resourceLeft(wizard, state, slotKey(3)), 0);
  assert.deepEqual(castableLevels(fireball, wizard, state), [4, 5]);
  assert.equal(upcastAttack(fireball, 4).damage, "9d6");
  assert.equal(upcastAttack(fireball, 3).damage, "8d6");
  assert.equal(upcastAttack(wizard.attacks.find(attack => attack.name === "Guiding Bolt"), 3).damage, "6d6");
  assert.deepEqual(castableLevels(wizard.attacks.find(attack => attack.name === "Sacred Flame"), wizard, state), []); // cantrip

  state = spendResource(wizard, state, "Channel Divinity", 2);
  assert.equal(resourceLeft(wizard, state, "Channel Divinity"), 0);
  state = rest(wizard, state, "short");
  assert.equal(resourceLeft(wizard, state, "Channel Divinity"), 2); // short rest
  assert.equal(resourceLeft(wizard, state, slotKey(3)), 0);         // slots wait for a long rest
  state = rest(wizard, state, "long");
  assert.equal(resourceLeft(wizard, state, slotKey(3)), 3);

  const logan = sheets["Logan Ninefingers"];
  let rage = { ...spendResource(logan, {}, "Rage"), raging: true };
  assert.equal(resourceLeft(logan, rage, "Rage"), 3);
  assert.equal(rest(logan, rage, "short").raging, false); // a rage lasts a minute, never through a rest
  assert.equal(resourceLeft(logan, rest(logan, rage, "short"), "Rage"), 3); // rages are per long rest
  assert.deepEqual(rest(logan, rage, "long"), { used: {}, raging: false });
  assert.equal(resourceLeft(logan, spendResource(logan, rage, "Rage", 10), "Rage"), 0);
});

test("a spent ability is never suggested, by Moves or to Claude", async () => {
  const { spentAbilities, spendResource, slotKey } = await import("../src/encounter.js");
  const { withoutSpent, recommend } = await import("../src/scene-options.js");
  const { sheetText } = await import("../src/advice.js");
  const { party, sheets } = await import("../src/campaign.js");
  const wizard = party.find(member => member.name === "The White Wizard");
  const sheet = sheets["The White Wizard"];
  assert.deepEqual(spentAbilities(wizard, sheet, {}), []);

  // Every 3rd-, 4th-, and 5th-level slot used, and Channel Divinity spent.
  let state = {};
  for (const level of [3, 4, 5]) state = spendResource(sheet, state, slotKey(level), 9);
  state = spendResource(sheet, state, "Channel Divinity", 2);
  const spent = spentAbilities(wizard, sheet, state);
  const names = spent.map(line => line.split(":")[0]);
  for (const name of ["Fireball", "Flame Strike", "Wall of Fire", "Spirit Guardians", "Radiance of the Dawn", "Turn Undead"]) assert.ok(names.includes(name), name + " is spent");
  for (const name of ["Sacred Flame", "Bless", "Healing Word"]) assert.ok(!names.includes(name), name + " still has slots or is a cantrip");
  assert.match(spent.find(line => line.startsWith("Fireball")), /no 3rd-level or higher spell slot left/);

  const usable = withoutSpent(wizard, spent);
  // A line listing several keeps the ones still usable.
  assert.ok(usable.moves.includes("combat | Bless, Spiritual Weapon — "), "grouped line trimmed");
  assert.ok(!usable.moves.includes("Spirit Guardians"));
  for (let id = 1; id <= 40; id++) {
    const scenes = [{ id, text: "Roll initiative! Guards open fire on the party." }];
    const { options } = recommend(usable, scenes);
    for (const option of options) {
      for (const name of ["Fireball", "Flame Strike", "Radiance of the Dawn", "Spirit Guardians"]) assert.ok(!option.includes(name), "suggested spent " + name + ": " + option);
    }
  }
  const text = sheetText({ ...wizard, spent });
  const [ready, rest] = text.split("SPENT right now");
  assert.ok(!/- Fireball/.test(ready), "Fireball is not READY");
  assert.match(rest, /- Fireball: no 3rd-level/);
  assert.match(ready, /- Sacred Flame/);

  const logan = party.find(member => member.name === "Logan Ninefingers");
  const noRage = spentAbilities(logan, sheets["Logan Ninefingers"], spendResource(sheets["Logan Ninefingers"], {}, "Rage", 4));
  assert.deepEqual(noRage, ["Rage: no Rage left until a long rest"]);
  assert.ok(!withoutSpent(logan, noRage).moves.includes("combat | Rage —"));
});

test("the DM's encounter: an unsaved change on this device is never replaced by the table's copy", async () => {
  const { pickEncounter } = await import("../src/encounter.js");
  const ogre = [{ id: 1, name: "Ogre", hp: 59 }];
  const hurt = [{ id: 1, name: "Ogre", hp: 40 }];
  // A save is still waiting to go: leave everything alone.
  assert.equal(pickEncounter({ cloud: { enemies: ogre, updated: 9e12 }, local: hurt, dirty: true, pending: true, savedHere: true }), "keep");
  // Reloaded before the save went out (or it failed): put this copy on the table,
  // however new the table's timestamp looks.
  assert.equal(pickEncounter({ cloud: { enemies: ogre, updated: 9e12 }, local: hurt, dirty: true, pending: false, savedHere: true }), "push");
  // Nothing unsaved here: the table's copy is the newest (the DM's other device).
  assert.equal(pickEncounter({ cloud: { enemies: hurt, updated: 1 }, local: ogre, dirty: false, pending: false, savedHere: true }), "cloud");
  assert.equal(pickEncounter({ cloud: { enemies: ogre, updated: 1 }, local: ogre, dirty: false, pending: false, savedHere: true }), "keep");
  // Nothing on the table yet.
  assert.equal(pickEncounter({ cloud: null, local: ogre, dirty: false, pending: false, savedHere: true }), "push");
  assert.equal(pickEncounter({ cloud: null, local: [], dirty: false, pending: false, savedHere: false }), "keep");
});

test("a sheet's \"adv.\" (Feral Instinct) rolls with advantage; nothing else does", async () => {
  const { rollModeFrom } = await import("../src/dice.js");
  assert.equal(rollModeFrom("+2 adv."), "advantage");
  assert.equal(rollModeFrom("+2 with advantage"), "advantage");
  assert.equal(rollModeFrom("+7"), "normal");
  assert.equal(rollModeFrom("Advanced"), "normal");
});

test("an unconfirmed AC is a range: rolls inside it are the DM's call", async () => {
  const { acRange, attackOutcome } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const dumDum = acRange(sheets["Dum Dum"], null);
  assert.deepEqual([dumDum.low, dumDum.high, dumDum.unconfirmed, dumDum.text], [18, 20, true, "18–20?"]);
  assert.equal(attackOutcome({ total: 19 }, dumDum), "unsure");
  assert.equal(attackOutcome({ total: 20 }, dumDum), "hit");
  assert.equal(attackOutcome({ total: 17 }, dumDum), "miss");
  // The DM's number on the Party HP card settles it.
  assert.equal(attackOutcome({ total: 19 }, acRange(sheets["Dum Dum"], { hp: 1, max: 9, ac: 18 })), "hit");
  const logan = acRange(sheets["Logan Ninefingers"], null);
  assert.deepEqual([logan.low, logan.high, logan.unconfirmed, logan.text], [16, 16, false, "16"]);
  assert.equal(attackOutcome({ total: 15 }, 16), "miss");
  assert.equal(attackOutcome({ total: 16 }, 16), "hit");
  assert.equal(attackOutcome({ total: 16 }, null), "unknown");
});
