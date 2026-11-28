import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, roll, normalize, poolExpression, rollableFrom, keepD20, tableRoll, tablePrompt } from "../src/dice.js";
import { templates, createEnemies, applyHp, status, standing, rollInitiative, hitPoints, parseHitReport as readHit, hitHandledText, riderText, attackAskText, parseAttackAsk, attackVerdictText, parseTypedToHit, chronicleLine, attacksFromNotes } from "../src/encounter.js";

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
  // A character sat out of the fight has no place in the order and no turn.
  const { sittingOut, isSittingOut } = await import("../src/encounter.js");
  const away = { ...combat, party: { 0: "out", 2: 20 } };
  assert.deepEqual(combatOrder(away, party).map(entry => entry.key), ["pc:2", "en:" + guard.id, "en:x", "pc:1"]);
  assert.deepEqual(sittingOut(away, party), [0]);
  assert.equal(isSittingOut(away, 0), true);
  assert.equal(isSittingOut(away, 1), false);
  assert.deepEqual(nextTurn(combatOrder(away, party), "pc:2", 1), { turn: "en:" + guard.id, round: 1 });
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
  assert.equal(pick(wizard, "Passive Perc.").value, "18");
  assert.equal(pick(wizard, "Spell DC").value, "16");
  const dumDum = combatStats(sheets["Dum Dum"]);
  assert.equal(pick(dumDum, "AC").value, "20");
  assert.equal(pick(dumDum, "AC").unconfirmed, false);
  // An unsure sheet AC is still flagged until the DM sets it.
  assert.equal(pick(combatStats({ combat: [["AC", "20 plate, or 18 half plate"]] }), "AC").unconfirmed, true);
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
  const [rage, reckless] = logan.attackOptions;
  const greataxe = logan.attacks[0];
  assert.deepEqual(buildAttack(greataxe, [rage]), { save: null, toHit: "d20+8", hitBonus: 8, mode: "normal", damage: "1d12+4+3" });
  assert.equal(buildAttack(greataxe, [rage, reckless]).mode, "advantage");
  assert.ok(!logan.attackOptions.some(option => option.name === "Great Weapon Master"), "Savage Attacker build: no Great Weapon Master");
  // An option with a to-hit change still works (any sheet could add one).
  const powerful = { name: "Test", hit: -5, damage: "+10" };
  assert.equal(buildAttack(greataxe, [rage, powerful]).toHit, "d20+3");
  assert.equal(buildAttack(greataxe, [rage, powerful]).damage, "1d12+4+3+10");
  assert.equal(buildAttack(greataxe, [rage], { crit: true, extraCritDice: logan.critExtraDice }).damage, "3d12+4+3"); // matches the sheet's 3d12+7

  const fireball = sheets["The White Wizard"].attacks.find(attack => attack.name === "Fireball");
  const built = buildAttack(fireball, []);
  assert.equal(built.toHit, null);
  assert.equal(built.save, "Dex save, DC 16, half on a save");

  for (const sheet of Object.values(sheets)) {
    for (const attack of sheet.attacks) {
      assert.ok(attack.hit !== undefined || (attack.save && attack.dc), sheet.title + " " + attack.name);
      assert.ok(buildAttack(attack, sheet.attackOptions, { crit: true }).damage.match(/^\d+d\d+/), attack.name);
    }
  }

  const line = hitReportText("Bandit 2", 14, "with Greataxe, 19 to hit");
  assert.deepEqual(parseHitReport(line), { enemy: "Bandit 2", amount: 14, detail: "with Greataxe, 19 to hit", toHit: 19, crit: false, halfOnSave: false, save: null, handled: false });
  assert.equal(parseHitReport(hitReportText("Guard 1", 30, "with Fireball, Dex save, DC 17, half on a save")).halfOnSave, true);
  assert.deepEqual(parseHitReport(hitReportText("Bandit 2", 7)), { enemy: "Bandit 2", amount: 7, detail: "", toHit: null, crit: false, halfOnSave: false, save: null, handled: false });
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
  assert.equal(attackBreakdown(wizard.attacks.find(attack => attack.name === "Fireball"), wizard).dc, "DC 16 = 8 + WIS +4 + Prof +4");
  const dumDum = sheets["Dum Dum"];
  assert.equal(attackBreakdown(dumDum.attacks[0], dumDum).damage, "1d8 + STR +4 + Dueling +2");
  // Every attack's listed bonus matches ability + proficiency + bonuses, and
  // weapon damage includes the ability modifier.
  for (const sheet of Object.values(sheets)) {
    const prof = Number.parseInt(Object.fromEntries(sheet.combat).Proficiency, 10);
    for (const attack of sheet.attacks) {
      const mod = abilityMods(sheet).find(entry => entry.ability === attack.ability)?.mod;
      assert.ok(Number.isFinite(mod), attack.name + " has an ability");
      if (attack.save) assert.equal(attack.dc, 8 + mod + prof, attack.name + " DC");
      else assert.equal(attack.hit, mod + prof + (attack.bonus ?? []).reduce((sum, [, value]) => sum + value, 0), attack.name + " to hit");
      const flat = mod + (attack.damageBonus ?? []).reduce((sum, [, value]) => sum + value, 0);
      if (attack.addMod !== false) assert.ok(attack.damage.endsWith("+" + flat), attack.name + " damage includes " + attack.ability + " and its bonuses");
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
  assert.ok(usable.moves.includes("combat | Bless, Command, Guiding Bolt, Spiritual Weapon — "), "grouped line trimmed");
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

test("a skill like \"+1 (disadvantage in scale mail)\" rolls with disadvantage, from its own dice", async () => {
  const { rollModeFrom, rollableFrom } = await import("../src/dice.js");
  assert.equal(rollModeFrom("+1 (disadvantage in scale mail)"), "disadvantage");
  assert.equal(rollableFrom("+1 (disadvantage in scale mail)"), "d20+1");
  // Skill values on the sheets: "+2", "−1" (a real minus sign), "+0".
  assert.equal(rollableFrom("+2"), "d20+2");
  assert.equal(rollableFrom("−1"), "d20-1");
  assert.equal(rollableFrom("+0"), "d20+0");
});

test("an unconfirmed AC is a range: rolls inside it are the DM's call", async () => {
  const { acRange, attackOutcome } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  // A sheet whose armor isn't settled (Dum Dum's was, before the defaults).
  const unsure = { combat: [["AC", "20 plate + shield, or 18 half plate + shield (unconfirmed)"]], rolls: [["AC", "18–20*"]] };
  const range = acRange(unsure, null);
  assert.deepEqual([range.low, range.high, range.unconfirmed, range.text], [18, 20, true, "18–20?"]);
  assert.equal(attackOutcome({ total: 19 }, range), "unsure");
  assert.equal(attackOutcome({ total: 20 }, range), "hit");
  assert.equal(attackOutcome({ total: 17 }, range), "miss");
  // The DM's number on the Party HP card settles it.
  assert.equal(attackOutcome({ total: 19 }, acRange(unsure, { hp: 1, max: 9, ac: 18 })), "hit");
  assert.deepEqual(acRange(sheets["Dum Dum"], null).text, "20");
  assert.deepEqual(acRange(sheets.Arcturus, null).text, "17");
  const logan = acRange(sheets["Logan Ninefingers"], null);
  assert.deepEqual([logan.low, logan.high, logan.unconfirmed, logan.text], [16, 16, false, "16"]);
  assert.equal(attackOutcome({ total: 15 }, 16), "miss");
  assert.equal(attackOutcome({ total: 16 }, 16), "hit");
  assert.equal(attackOutcome({ total: 16 }, null), "unknown");
});

test("enemy saves: stat blocks carry them, the form parses them, and a save halves the damage", async () => {
  const { templates, createEnemies, parseSaves, formatSaves, enemySave, saveBonus, parseHitReport, hitReportText } = await import("../src/encounter.js");
  for (const template of templates) assert.equal(template.saves?.length, 6, template.name + " has six save bonuses");
  assert.ok(templates.filter(template => /Gladiator|Troll|Giant|Assassin|Dragon|Oni|Wraith/.test(template.name)).length >= 6, "tougher foes for level 10");
  assert.deepEqual(parseSaves("Str +4, dex 2, CON −1"), [4, 2, -1, 0, 0, 0]);
  assert.equal(formatSaves([4, 2, -1, 0, 0, 0]), "Str +4, Dex +2, Con -1, Int +0, Wis +0, Cha +0");
  const [ogre] = createEnemies(templates.find(template => template.name === "Ogre"), 1, () => 0.5);
  assert.equal(saveBonus(ogre, "Dex"), -1);
  const [custom] = createEnemies({ name: "Vault Guardian", ac: 17, hp: "120" });
  assert.equal(saveBonus(custom, "Con"), 0);
  // d20 rolls 1 + (-1) = 0: fails, takes it all; d20 rolls 20 + (-1) = 19: saves, half.
  assert.deepEqual([enemySave(ogre, { ability: "Dex", dc: 17, amount: 31, half: true }, () => 0).saved, enemySave(ogre, { ability: "Dex", dc: 17, amount: 31, half: true }, () => 0).damage], [false, 31]);
  assert.equal(enemySave(ogre, { ability: "Dex", dc: 17, amount: 31, half: true }, () => 0.999).damage, 15);
  assert.equal(enemySave(ogre, { ability: "Dex", dc: 17, amount: 18, half: false }, () => 0.999).damage, 0);
  const report = parseHitReport(hitReportText("Vault Ogre 1", 31, "with Fireball (4th-level), Dex save, DC 17, half on a save"));
  assert.deepEqual(report.save, { ability: "Dex", dc: 17 });
  assert.equal(report.halfOnSave, true);
});

test("Hit Dice: from the sheet, spent one at a time, half back on a long rest", async () => {
  const { hitDice, HIT_DICE, resourceLeft, spendResource, rest } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const dumDum = sheets["Dum Dum"];
  assert.deepEqual(hitDice(dumDum), { max: 10, die: 10, con: 3, roll: "1d10+3" });
  let state = {};
  for (let n = 0; n < 7; n++) state = spendResource(dumDum, state, HIT_DICE);
  assert.equal(resourceLeft(dumDum, state, HIT_DICE), 3);
  assert.equal(resourceLeft(dumDum, rest(dumDum, state, "short"), HIT_DICE), 3); // a short rest gives none back
  assert.equal(resourceLeft(dumDum, rest(dumDum, state, "long"), HIT_DICE), 8);  // half of 10 back
  assert.deepEqual(hitDice(sheets["Roan the Last Shadow"]), { max: 10, die: 8, con: 4, roll: "1d8+4" });
  assert.equal(hitDice({ combat: [] }), null);
  assert.equal(sheets["The White Wizard"].heals[0].name, "Healing Word");
});

test("Roan's Shadow Energy gates his shadow moves, Death Mark at 2", async () => {
  const { spentAbilities } = await import("../src/encounter.js");
  const { party, sheets } = await import("../src/campaign.js");
  const roan = party.find(member => member.name === "Roan the Last Shadow");
  const sheet = sheets["Roan the Last Shadow"];
  const names = used => spentAbilities(roan, sheet, { used }).map(line => line.split(":")[0]);
  assert.deepEqual(names({}), []);
  assert.deepEqual(names({ "Shadow Energy": 5 }), ["Death Mark"], "one point left: not enough for Death Mark");
  assert.match(spentAbilities(roan, sheet, { used: { "Shadow Energy": 5 } })[0], /needs 2 Shadow Energy, 1 left/);
  assert.deepEqual(names({ "Shadow Energy": 6 }).sort(), ["Death Mark", "Living Shadow", "Shadow Slash"]);
  assert.ok(names({ "Death Mark": 1 }).includes("Death Mark"), "used this rest");
});

test("Primeval Awareness waits for a spell slot like a spell does", async () => {
  const { spentAbilities, spendResource, slotKey } = await import("../src/encounter.js");
  const { party, sheets } = await import("../src/campaign.js");
  const arcturus = party.find(member => member.name === "Arcturus");
  const sheet = sheets.Arcturus;
  let state = {};
  for (const level of [1, 2, 3]) state = spendResource(sheet, state, slotKey(level), 9);
  const names = spentAbilities(arcturus, sheet, state).map(line => line.split(":")[0]);
  assert.ok(names.includes("Primeval Awareness"), "no slots: no Primeval Awareness");
  assert.ok(!spentAbilities(arcturus, sheet, {}).some(line => line.startsWith("Primeval Awareness")));
});

test("a second d20 for advantage or disadvantage keeps the right roll", () => {
  const first = roll("d20+9", { random: faces(20, 6) });
  const crit = roll("d20+9", { random: faces(20, 20) });
  const low = roll("d20+9", { random: faces(20, 2) });
  // Roan's case: a 6 first, then a natural 20 with advantage is a crit.
  const kept = keepD20(first, crit, "advantage");
  assert.equal(kept.total, 29);
  assert.equal(kept.critical, true);
  assert.equal(kept.mode, "advantage");
  assert.equal(keepD20(crit, first, "advantage").critical, true);
  assert.equal(keepD20(first, low, "advantage").natural, 6);
  assert.equal(keepD20(first, low, "disadvantage").natural, 2);
  assert.equal(keepD20(crit, first, "disadvantage").critical, false);
});

test("a hit the DM applied is marked on the story line, once", () => {
  const line = "🎯 hit Goblin 1 for 9 damage — with Longbow, 18 to hit";
  assert.equal(readHit(line).handled, false);
  const applied = hitHandledText(line);
  assert.equal(applied, line + " · ✓ DM applied");
  assert.equal(readHit(applied).handled, true);
  assert.equal(readHit(applied).amount, 9);
  assert.equal(readHit(applied).toHit, 18);
  // Marking again replaces the mark instead of stacking it.
  assert.equal(hitHandledText(applied, "dismissed"), line + " · ✓ DM dismissed");
});

test("a maneuver's save is read as a rider: damage lands, the save decides the effect", () => {
  const trip = readHit("🎯 hit Vault Sentry 1 for 17 damage — with Longsword + Trip Attack (DC 16 Strength save or knocked prone (Large or smaller)), 22 to hit");
  assert.deepEqual(trip.save, { ability: "Str", dc: 16, rider: true, effect: "knocked prone" });
  assert.equal(trip.halfOnSave, false);
  // A spell's save is still the plain kind.
  const fireball = readHit("🎯 hit Ogre for 35 damage — with Fireball (4th-level), Dex save, DC 16, half on a save");
  assert.deepEqual(fireball.save, { ability: "Dex", dc: 16 });
});

test("the Assassin's poison rides on its attacks and survives building the enemy", () => {
  const assassin = templates.find(template => template.name === "Assassin");
  const [shortsword] = assassin.attacks;
  assert.deepEqual(shortsword[3], { damage: "7d6", type: "poison", save: "Con", dc: 15, half: true });
  assert.equal(riderText(shortsword[3]), "+7d6 poison (DC 15 Con save for half)");
  const [enemy] = createEnemies(assassin, 1);
  assert.deepEqual(enemy.attacks[0][3], shortsword[3]);
  assert.equal(enemy.attacks[0].length, 4);
  // Attacks without a rider stay three long.
  const [guard] = createEnemies(templates.find(template => template.name === "Guard"), 1);
  assert.equal(guard.attacks[0].length, 3);
  assert.equal(riderText({ save: "Str", dc: 11, effect: "knocked prone" }), "DC 11 Str save or knocked prone");
});

test("real dice at the table: the d20's face plus the modifier, crits included", () => {
  const hit = tableRoll("d20+9", 14);
  assert.equal(hit.total, 23);
  assert.equal(hit.natural, 14);
  assert.equal(hit.critical, false);
  assert.equal(hit.table, true);
  assert.equal(hit.breakdown, "table dice: 14 + 9");
  assert.equal(tableRoll("d20+9", 20).critical, true);
  assert.equal(tableRoll("d20+9", 1).fumble, true);
  assert.equal(tableRoll("d20+9", 20, "advantage").mode, "advantage");
  // A death save is a plain d20: the total is the face.
  assert.equal(tableRoll("d20", 12).total, 12);
  // Damage: the dice total, then the modifier.
  const damage = tableRoll("1d12+4", 9);
  assert.equal(damage.total, 13);
  assert.equal(damage.natural, null);
  assert.equal(tableRoll("1d6+5+5d6", 20).total, 25);
  // Numbers the dice can't show are refused.
  assert.equal(tableRoll("d20+9", 0), null);
  assert.equal(tableRoll("d20+9", 21), null);
  assert.equal(tableRoll("1d12+4", 13), null);
  assert.equal(tableRoll("2d6", 1), null);
  assert.equal(tableRoll("d20", ""), null);
  assert.equal(tableRoll("5", 3), null);
});

test("the real-dice prompt asks for the right number", () => {
  assert.equal(tablePrompt("d20+9"), "What does your d20 show? (the app adds +9)");
  assert.equal(tablePrompt("d20+9", "advantage"), "Roll two d20s, enter the higher (the app adds +9)");
  assert.equal(tablePrompt("1d12+4"), "Add up your dice (1d12) (the app adds +4)");
  assert.equal(tablePrompt("d20"), "What does your d20 show?");
  assert.equal(tablePrompt("1d6+5+5d6"), "Add up your dice (1d6 + 5d6) (the app adds +5)");
});

test("a to-hit roll waits for the DM's call, which the card then reads", () => {
  const ask = attackAskText("Vault Warden", "with Longsword, 23 to hit");
  assert.equal(ask, "🎯 attacks Vault Warden — with Longsword, 23 to hit");
  assert.deepEqual(parseAttackAsk(ask), { enemy: "Vault Warden", detail: "with Longsword, 23 to hit", toHit: 23, verdict: null });
  const hit = attackVerdictText(ask, "hit");
  assert.equal(hit, ask + " · ✓ DM: hit");
  assert.equal(parseAttackAsk(hit).verdict, "hit");
  assert.equal(parseAttackAsk(hit).toHit, 23);
  // Changing the call replaces it instead of stacking.
  assert.equal(attackVerdictText(hit, "miss"), ask + " · ✗ DM: miss");
  assert.equal(parseAttackAsk(attackVerdictText(hit, "miss")).verdict, "miss");
  // It is not a hit report, and a hit report is not an ask.
  assert.equal(readHit(ask), null);
  assert.equal(parseAttackAsk("🎯 hit Goblin 1 for 9 damage — with Longbow, 18 to hit"), null);
});

test("a to-hit roll typed into the story box is recognised", () => {
  assert.equal(parseTypedToHit("Rolled a 26 to hit"), 26);
  assert.equal(parseTypedToHit("23 to hit, does it hit?"), 23);
  assert.equal(parseTypedToHit("i got an 18 to hit"), 18);
  assert.equal(parseTypedToHit("rolled 15 on my attack"), 15);
  assert.equal(parseTypedToHit("I swing my axe at the warden"), null);
  assert.equal(parseTypedToHit("rolled 12 damage"), null);
  assert.equal(parseTypedToHit("Logan charges and rolled 20 to hit then shouts a long battle cry at everyone in the room"), null);
});

test("the TV board reads attack lines as plain sentences", () => {
  assert.deepEqual(chronicleLine("Logan Ninefingers", "🎯 hit Puppet Guard 1 for 16 damage — with Greataxe, 20 to hit · ✓ DM applied"),
    { kind: "hit", who: "Logan Ninefingers", enemy: "Puppet Guard 1", text: "Logan Ninefingers hits Puppet Guard 1 with Greataxe for 16 damage" });
  assert.equal(chronicleLine("The White Wizard", "🎯 hit Puppet Guard 2 for 28 damage — with Flame Strike (5th-level), Dex save, DC 16, half on a save").text,
    "White Wizard casts Flame Strike (5th-level) on Puppet Guard 2: 28 damage rolled, Dex save for half");
  assert.equal(chronicleLine("The White Wizard", "🎯 hit Puppet Guard 1 for 12 damage — with Sacred Flame, Dex save, DC 16, nothing on a save").text,
    "White Wizard casts Sacred Flame on Puppet Guard 1: 12 damage rolled, Dex save to avoid it");
  assert.equal(chronicleLine("Roan", "🎯 hit Spider for 12 damage — with Razor Shuriken (Q), 29 to hit, critical").text, "Roan lands a critical hit on Spider with Razor Shuriken (Q) for 12 damage");
  assert.equal(chronicleLine("Roan", "🎯 hit Spider for 12 damage — with Razor Shuriken (Q), 29 to hit · ✓ DM dismissed"), null);
  assert.equal(chronicleLine("Dum Dum", "🎯 attacks Spider — with Longsword, 10 to hit · ✗ DM: miss").text, "Dum Dum attacks Spider with Longsword and misses");
  assert.equal(chronicleLine("Dum Dum", "🎯 attacks Spider — with Longsword, 23 to hit · ✓ DM: hit").kind, "call");
  assert.equal(chronicleLine("Dum Dum", "🎯 attacks Spider — with Longsword, 23 to hit").text, "Dum Dum attacks Spider with Longsword…");
  assert.equal(chronicleLine("Dum Dum", "🎯 missed Spider with Longsword (natural 1)").text, "Dum Dum misses Spider with Longsword (rolled a 1)");
  assert.equal(chronicleLine("Logan", "⏭️ ends their turn").kind, "turn");
  assert.deepEqual(chronicleLine("Arcturus", "Keeping it G gobble gobble"), { kind: "action", who: "Arcturus", text: "Keeping it G gobble gobble" });
});

test("enemy attacks written in the notes become tappable attacks", () => {
  assert.deepEqual(attacksFromNotes("Musket +6 (2d8+2 piercing, range 80). Puppeted by the vault: no fear, no pain."), [["Musket", 6, "2d8+2"]]);
  assert.deepEqual(attacksFromNotes("Multiattack: two pincers +8 (2d8+4 slashing). Arcane Shock (recharge 5-6): DC 15 Dex save, 4d10 lightning."),
    [["Two pincers", 8, "2d8+4"]]);
  assert.deepEqual(attacksFromNotes("Claw +7 to hit (2d6 + 4) and bite +7 (1d6+4), then a tail +5 (1d8)"), [["Claw", 7, "2d6+4"], ["Bite", 7, "1d6+4"]]);
  assert.deepEqual(attacksFromNotes("Resistant to fire. Flees at half HP."), []);
});

test("roll requests: the DM's ask, the bonus from the sheet, and the answer line", async () => {
  const { rollAskText, parseRollAsk, rollAskLabel, rollAskVerdict, rollAskBonus } = await import("../src/encounter.js");
  const { sheets } = await import("../src/campaign.js");
  const dex = parseRollAsk(rollAskText("Dexterity check", { kind: "DC", value: 12 }, "slip through"));
  assert.deepEqual([dex.kind, dex.ability, dex.target.value, dex.note], ["check", "DEX", 12, "slip through"]);
  assert.equal(rollAskLabel(dex), "Dexterity check (DC 12)");
  assert.equal(rollAskBonus(dex, sheets["Roan the Last Shadow"]), 5);
  assert.equal(rollAskBonus(parseRollAsk(rollAskText("Charisma save", { kind: "DC", value: 15 })), sheets["Dum Dum"]), -1);
  assert.equal(rollAskBonus(parseRollAsk(rollAskText("Sleight of Hand")), sheets["Roan the Last Shadow"]), 9);
  assert.equal(rollAskVerdict(dex, 12), " · ✓ meets DC 12");
  assert.equal(rollAskVerdict(dex, 11), " · ✗ under DC 12");
  const attack = parseRollAsk(rollAskText("Attack roll", { kind: "AC", value: 12 }));
  assert.equal(attack.kind, "attack");
  assert.equal(rollAskLabel(attack), "Attack roll (AC 12)");
  assert.equal(parseRollAsk("🎲 Stealth (d20+9): 17"), null); // an answer is not an ask
  assert.equal(parseRollAsk(rollAskText("Perception")).target, null);
  // Asks typed by hand still get the sheet's bonus (round 6: these rolled bare d20s).
  const typed = text => parseRollAsk("🎲 DM asks: " + text);
  const str = typed("Strength saving throw, DC 14 — resist the rake's pull (fail: dragged 10 ft)");
  assert.deepEqual([str.kind, str.ability, str.target.value], ["save", "STR", 14]);
  assert.equal(rollAskLabel(str), "Strength saving throw (DC 14)"); // the answer line keeps the DM's words
  assert.equal(rollAskBonus(str, sheets["Logan Ninefingers"]), rollAskBonus(parseRollAsk(rollAskText("Strength save")), sheets["Logan Ninefingers"]));
  assert.equal(typed("Str save, DC 12").ability, "STR");
  const insight = typed("Wisdom (Insight) check, DC 14 — read the wheel's tell (add Guidance d4)");
  assert.deepEqual([insight.kind, insight.skill, insight.ability], ["skill", "Insight", "WIS"]);
  assert.equal(rollAskBonus(insight, sheets["The White Wizard"]), 8);
  assert.equal(typed("Insight check").skill, "Insight");
  assert.equal(typed("Sleight of Hand check").skill, "Sleight of Hand");
  assert.equal(typed("Dexterity").kind, "check");
  assert.equal(rollAskBonus(typed("Juggling"), sheets["Roan the Last Shadow"]), null); // unknown: a plain d20
});


test("TV board: the scene in screen-sized passages, and story lines as moments", async () => {
  const { scenePassages, boardMoment } = await import("../src/encounter.js");
  assert.deepEqual(scenePassages("One.\n\nTwo."), ["One.", "Two."]);
  const long = "The wheel spins. ".repeat(40).trim();
  const passages = scenePassages(long);
  assert.ok(passages.length > 1 && passages.every(passage => passage.length <= 320), "long paragraphs split");
  assert.ok(scenePassages("word ".repeat(200)).every(passage => passage.length <= 320), "a run-on breaks between words");
  assert.deepEqual(scenePassages(""), [""]);
  const roll = boardMoment("Dum Dum", "🎲 Dexterity check (DC 12): 17 (d20: 16 + 1) · ✓ meets DC 12");
  assert.deepEqual([roll.kind, roll.text, roll.total, roll.verdict], ["roll", "Dexterity check", 17, "success"]);
  assert.equal(boardMoment("Roan the Last Shadow", "🎲 Attack roll (AC 12) · Razor Shuriken (Q): 29 (d20: 20 + 9) · ✓ meets AC 12").natural, 20);
  assert.equal(boardMoment("Roan", "🎲 DM asks: Attack roll, AC 12 — cut the straps").kind, "ask");
  assert.equal(boardMoment("The White Wizard", "💚 heals Dum Dum for 8 HP (Cure Wounds)").text, "heals Dum Dum for 8 HP");
  assert.equal(boardMoment("Logan Ninefingers", "has Exhaustion level 1 🥵").text, "has Exhaustion level 1");
  assert.equal(boardMoment("Logan Ninefingers", "🎯 attacks Bandit — with Greataxe, 14 to hit · ✗ DM: miss").kind, "miss");
});

test("stock enemies: every one has a CR, rollable stats, and a tier for the party", async () => {
  const { templates, createEnemies, enemyTier, crValue, enemyRoutine, swingCount, TIERS } = await import("../src/encounter.js");
  const { parse } = await import("../src/dice.js");
  assert.ok(templates.length >= 40);
  assert.equal(new Set(templates.map(template => template.name)).size, templates.length, "no duplicate names");
  for (const template of templates) {
    assert.ok(crValue(template.cr) !== null, template.name + " has a CR");
    assert.ok(TIERS.includes(enemyTier(template, 10)), template.name + " sorts into a tier");
    assert.ok(parse(template.hp), template.name + " HP rolls");
    assert.equal(template.saves.length, 6, template.name + " has six saves");
    for (const [name, , damage] of template.attacks) assert.ok(parse(damage), template.name + ": " + name + " damage rolls");
    for (const index of template.routine ?? []) assert.ok(template.attacks[index], template.name + " routine points at an attack");
  }
  assert.equal(crValue("1/4"), 0.25);
  assert.equal(enemyTier({ cr: "1/2" }, 10), "Minions");
  assert.equal(enemyTier({ cr: "3" }, 10), "Soldiers");
  assert.equal(enemyTier({ cr: "6" }, 10), "Elites");
  assert.equal(enemyTier({ cr: "10" }, 10), "Bosses");
  assert.equal(enemyTier({ cr: "3" }, 3), "Bosses", "tiers follow the party's level");
  // A turn: the routine's attacks, each as many times as its (×N) says.
  const [dragon] = createEnemies(templates.find(template => template.name === "Young Red Dragon"), 1);
  assert.deepEqual(enemyRoutine(dragon).map(([[name], times]) => [name, times]), [["Claw (×2)", 2], ["Bite", 1]]);
  assert.deepEqual(enemyRoutine({ attacks: [["Brass Rake (x2)", 7, "1d10+4"], ["Thrown chip", 7, "2d6+3"]] }).map(([[name], times]) => [name, times]), [["Brass Rake (x2)", 2]]);
  assert.equal(swingCount("Bite"), 1);
  assert.deepEqual(enemyRoutine({ attacks: [] }), []);
});

test("group roll requests: each character's answer, with pass or fail", async () => {
  const { rollAskText, rollAskResults } = await import("../src/encounter.js");
  const ask = rollAskText("Strength save", { kind: "DC", value: 14 }, "the rakes");
  const actions = [
    { id: 1, character: 3, text: "🎲 Strength save (DC 14): 9 (d20+3: 6+3) · ✗ under DC 14" }, // before the ask: not counted
    { id: 2, character: 3, text: ask }, { id: 3, character: 4, text: ask }, { id: 4, character: 2, text: ask },
    { id: 5, character: 4, text: "🎲 Strength save (DC 14): 17 (d20+1: 16+1) · ✓ meets DC 14" },
    { id: 6, character: 3, text: "Dum Dum braces." },
    { id: 7, character: 3, text: "🎲 Strength save (DC 14): 11 (d20+3: 8+3) · ✗ under DC 14" },
    { id: 8, character: 3, text: "🎲 Strength save (DC 14): 20 (d20+3: 17+3) · ✓ meets DC 14" } // a reroll: the first answer counts
  ];
  assert.deepEqual(rollAskResults(actions, ask), [
    { character: 3, answered: true, total: 11, pass: false },
    { character: 4, answered: true, total: 17, pass: true },
    { character: 2, answered: false }
  ]);
  assert.deepEqual(rollAskResults(actions, "not an ask"), []);
  // The same request again, to Roan only: the earlier one's answers stay out.
  const again = [...actions, { id: 9, character: 4, text: ask }, { id: 10, character: 4, text: "🎲 Strength save (DC 14): 8 (d20+1: 7+1) · ✗ under DC 14" }];
  assert.deepEqual(rollAskResults(again, ask, { after: 8, who: [4] }), [{ character: 4, answered: true, total: 8, pass: false }]);
  // An attack roll's answer names the weapon.
  const attack = rollAskText("Attack roll", { kind: "AC", value: 15 });
  assert.deepEqual(rollAskResults([{ id: 1, character: 2, text: attack }, { id: 2, character: 2, text: "🎲 Attack roll (AC 15) · Greataxe: 18 (d20+9: 9+9) · ✓ meets AC 15" }], attack),
    [{ character: 2, answered: true, total: 18, pass: true }]);
});

test("split-party scenes: an update for some characters, and each phone's current scene", async () => {
  const { sceneAudience, addressScene, sceneFor, sceneIsFor } = await import("../src/encounter.js");
  const vault = addressScene("The wheel spins.", ["The White Wizard"]);
  assert.equal(vault, "🔒 To: The White Wizard\nThe wheel spins.");
  assert.deepEqual(sceneAudience(vault), { names: ["The White Wizard"], body: "The wheel spins." });
  assert.equal(sceneAudience("Everyone hears it."), null);
  assert.equal(addressScene(vault, ["Roan the Last Shadow", "Dum Dum"]), "🔒 To: Roan the Last Shadow, Dum Dum\nThe wheel spins.", "re-addressing replaces the line");
  assert.equal(addressScene(vault, []), "The wheel spins.", "to everyone: the line goes");
  const scenes = [{ id: 1, text: "The door booms shut." }, { id: 2, text: vault }, { id: 3, text: addressScene("Rakes come down.", ["Roan the Last Shadow", "Dum Dum", "Logan Ninefingers", "Arcturus"]) }];
  assert.equal(sceneFor(scenes, "The White Wizard").id, 2);
  assert.equal(sceneFor(scenes, "White Wizard").id, 2, "\"The\" is optional");
  assert.equal(sceneFor(scenes, "Logan Ninefingers").id, 3);
  assert.equal(sceneFor([{ id: 1, text: vault }], "Logan Ninefingers"), null);
  assert.equal(sceneIsFor(scenes[0], "anyone"), true);
});

test("speech fixes: misheard names are corrected as whole words, longest phrase first", async () => {
  const { correctTranscript, parseCorrections, formatCorrections, DEFAULT_CORRECTIONS } = await import("../src/encounter.js");
  // Lines from the Nov 27 transcript.
  assert.equal(correctTranscript("the maze floats down and reveals himself"), "the mage floats down and reveals himself");
  assert.equal(correctTranscript("as the white maze thinks this"), "as the White Wizard thinks this");
  assert.equal(correctTranscript("my name charges forward, dumb dumb is caught by the Maze"), "my name charges forward, Dum Dum is caught by the mage");
  assert.equal(correctTranscript("or Terrace unleashes an arrow"), "or Arcturus unleashes an arrow");
  assert.equal(correctTranscript("Jay peso rolls a failed check"), "JPeso rolls a failed check");
  assert.equal(correctTranscript("the maze's orb glows"), "the mage's orb glows");
  // Never inside other words.
  assert.equal(correctTranscript("amazed by the mazes on the terraces"), "amazed by the mazes on the terraces");
  // The DM's own list, in the editor's format.
  const mine = parseCorrections("valerian → Vaelarian\nbad line\nour tourist -> Arcturus\n = nothing");
  assert.deepEqual(mine, [["valerian", "Vaelarian"], ["our tourist", "Arcturus"]]);
  assert.equal(correctTranscript("our  tourist sees valerian", mine), "Arcturus sees Vaelarian");
  assert.deepEqual(parseCorrections(formatCorrections(DEFAULT_CORRECTIONS)), DEFAULT_CORRECTIONS);
  assert.equal(correctTranscript("the maze", []), "the maze");
});

test("Claude's text is tidied: missing spaces put back, a runaway tail of tiny sentences cut", async () => {
  const { tidyModelText } = await import("../src/encounter.js");
  // The host note from the first AI DM practice table (Nov 28).
  const note = "Investigation DC 14 finds the warm mirror door.Practice table, nothing saved.Don't forget the amulet backlash rule.Mirror gallery next.Keep pace brisk.Tone eerie.Counting dark.Secrets intact.Hold.Light next.Go.Enjoy.End.Done.Fine.Okay.Yes.Sure.Right.Good.Ok.Alright.Thanks.Bye.Stop.";
  assert.equal(tidyModelText(note), "Investigation DC 14 finds the warm mirror door. Practice table, nothing saved. Don't forget the amulet backlash rule. Mirror gallery next. Keep pace brisk.");
  for (const fine of ["The door groans. \"Who goes there?\" A guard steps out. Run!", "Roll Perception, DC 13.", ""]) assert.equal(tidyModelText(fine), fine);
  assert.equal(tidyModelText("Mr. Vey waits at 3.5 paces."), "Mr. Vey waits at 3.5 paces.");
});

test("the AI DM autopilot answers requested rolls at once and doesn't wait on a quiet player", async () => {
  const { aiDmReady } = await import("../src/encounter.js");
  const present = ["Roan", "The White Wizard", "Arcturus"];
  // Nothing new: says what it's waiting for.
  assert.match(aiDmReady({ present }).wait, /players to act/);
  assert.match(aiDmReady({ present, owed: [{ who: "Roan", label: "Perception (DC 12)", age: 5000 }] }).wait, /Roan's Perception \(DC 12\)/);
  // A roll still owed holds the turn, even with posts in.
  const posted = [{ name: "Arcturus", roll: false, age: 20000 }];
  assert.equal(aiDmReady({ present, fresh: posted, owed: [{ who: "Roan", label: "Perception", age: 10000 }] }).go, false);
  // ...until it's been owed too long (Quick: 2 minutes).
  assert.equal(aiDmReady({ present, fresh: [{ name: "Arcturus", roll: false, age: 20000 }], owed: [{ who: "Roan", label: "Perception", age: 130000 }] }).go, false); // others not in yet
  // The rolls it asked for are in: goes after a 3-second beat, without the others.
  const rolls = [{ name: "Roan", roll: true, age: 4000 }];
  assert.deepEqual(aiDmReady({ present, fresh: rolls, asked: ["Roan"] }), { go: true, why: "The rolls are in: took a DM turn." });
  assert.match(aiDmReady({ present, fresh: [{ name: "Roan", roll: true, age: 1000 }], asked: ["Roan"] }).wait, /answering in a moment/);
  assert.equal(aiDmReady({ present, fresh: rolls, asked: ["Roan"], pace: "patient" }).go, false); // Patient waits for everyone
  // Two asked, one in: keeps waiting for the quiet ones.
  assert.match(aiDmReady({ present, fresh: rolls, asked: ["Roan", "Arcturus"] }).wait, /White Wizard, Arcturus to act/);
  // A few posts (3 on Quick) are enough, even if someone hasn't posted.
  const three = [{ name: "Roan", age: 5000 }, { name: "Roan", age: 4000 }, { name: "Arcturus", age: 4000 }];
  assert.equal(aiDmReady({ present, fresh: three }).go, true);
  assert.equal(aiDmReady({ present, fresh: three, pace: "patient" }).go, false);
  // Everyone has posted, or the wait for the others ran out.
  assert.equal(aiDmReady({ present: ["Roan"], fresh: [{ name: "Roan", age: 4000 }] }).go, true);
  assert.equal(aiDmReady({ present, fresh: [{ name: "Roan", age: 31000 }] }).go, true);
  assert.equal(aiDmReady({ present, fresh: [{ name: "Roan", age: 31000 }], pace: "patient" }).go, false);
});

test("AI DM difficulty: a self-explaining TABLE STATE line, and who the autopilot's enemies attack", async () => {
  const { AI_DM_DIFFICULTIES, enemyTargetIndex } = await import("../src/encounter.js");
  assert.deepEqual(Object.keys(AI_DM_DIFFICULTIES), ["easy", "medium", "hard"]);
  for (const [name, line] of Object.entries(AI_DM_DIFFICULTIES)) {
    assert.match(line, new RegExp("^DIFFICULTY: " + name, "i"));
    assert.match(line, /DCs \d+ to \d+/);
  }
  const party = [{ hp: 40, max: 40 }, { hp: 6, max: 30 }, { hp: 20, max: 24 }];
  assert.equal(enemyTargetIndex(party, "hard", 0.99), 1); // the most wounded
  for (const r of [0, 0.4, 0.99]) assert.notEqual(enemyTargetIndex(party, "easy", r), 1); // leaves the bloodied one alone
  assert.equal(enemyTargetIndex([{ hp: 3, max: 30 }], "easy", 0.5), 0); // unless nobody else is standing
  assert.deepEqual([0, 0.5, 0.99].map(r => enemyTargetIndex(party, "medium", r)), [0, 1, 2]);
  assert.equal(enemyTargetIndex([], "hard"), -1);
  // The AI DM prompt tells Claude to follow it.
  const { aiDmSystem } = await import("../src/advice.js");
  assert.match(aiDmSystem, /DIFFICULTY line set by the host/);
});

test("AI DM fight narration: after a few attacks, or at once for a big moment", async () => {
  const { fightBeats, fightNarrationDue } = await import("../src/encounter.js");
  const posts = [
    { name: "Roan", text: "🎯 hit Bandit 1 for 9 damage — with Longbow, 17 to hit · ✓ DM applied" },
    { name: "Arcturus", text: "🎯 missed Bandit 2 with Shortsword" },
    { name: "The White Wizard", text: "🩸 takes 6 damage" },
    { name: "The White Wizard", text: "🩸 takes 3 more damage from the same hit" },
    { name: "Roan", text: "I duck behind the cart" }
  ];
  assert.deepEqual(fightBeats(posts), { attacks: 3, crits: 0, deathSaves: 0 });
  assert.equal(fightNarrationDue({ beats: fightBeats(posts), every: 3 }), "3 attacks since the last update");
  assert.equal(fightNarrationDue({ beats: fightBeats(posts.slice(0, 2)), every: 3 }), "");
  assert.equal(fightNarrationDue({ beats: fightBeats(posts), every: 0 }), ""); // rounds only
  const crit = fightBeats([{ name: "Roan", text: "🎯 hit Bandit 1 for 22 damage — critical hit, with Longbow" }]);
  assert.equal(crit.crits, 1);
  assert.equal(fightNarrationDue({ beats: crit, every: 5 }), "a critical hit");
  assert.equal(fightNarrationDue({ beats: fightBeats([{ name: "Roan", text: "💀 death save 4: 1 ✗" }]), every: 5 }), "a death save");
  assert.equal(fightNarrationDue({ beats: fightBeats([]), every: 3, newlyDown: ["Bandit 2"] }), "Bandit 2 is down");
  assert.equal(fightNarrationDue({ beats: fightBeats([]), every: 3, newlyDown: ["The White Wizard", "Bandit 1"] }), "White Wizard and Bandit 1 are down");
});
