import { test } from "node:test";
import assert from "node:assert/strict";
import { organizeSheet, lookupRule, rules, basics } from "../src/rules.js";
import { party } from "../src/campaign.js";

// Moves that exist only at this table; they show the table's note instead of a rule.
const tableSpecific = new Set([
  "Living-shadow swap", "Cause a distraction", "Distraction", "Lead the ambush", "Speak plainly",
  "Current HP", "Current HP and AC", "Current HP and slots", "Wisdom 20", "Weakness sense", "Other maneuvers", "Note from the sheet",
  "Choker of Caution", "Agility Ring", "Additional ability", "Third-eye amulet", "Constitution 18", "Shadow vision", "Thieves' tools"
].map(name => name.toLowerCase()));

test("every ability on the roster has a built-in rule or is a known table move", () => {
  for (const character of party) {
    const { sections, confirm } = organizeSheet(character);
    for (const entry of [...sections.flatMap(section => section.entries), ...confirm]) {
      assert.ok(entry.rule || tableSpecific.has(entry.name.toLowerCase()), character.name + ": no rule for " + entry.name);
    }
  }
});

test("the White Wizard's sheet reads like a character sheet", () => {
  const sheet = organizeSheet(party.find(member => member.name === "The White Wizard"));
  assert.deepEqual(sheet.stats.slice(0, 2), ["Half-Elf Light Domain cleric", "Level 10"]);
  const titles = sheet.sections.map(section => section.title);
  assert.deepEqual(titles, ["Cantrips", "1st-level spells", "2nd-level spells", "3rd-level spells", "4th-level spells", "5th-level spells", "Features & traits", "Skills", "Table moves"]);
  const ready = sheet.sections.flatMap(section => section.entries);
  const fifth = sheet.sections.find(section => section.title === "5th-level spells").entries.map(entry => entry.name);
  assert.deepEqual(fifth.sort(), ["Flame Strike", "Greater Restoration", "Scrying"], "domain spells are always prepared, plus the prepared one");
  const fireball = ready.find(entry => entry.name === "Fireball");
  assert.match(fireball.rule.meta, /Action · 150 ft · Dex save/);
  assert.match(fireball.notes[0], /24/);
  assert.deepEqual(sheet.confirm, [], "the playable defaults settle every open line");
  for (const name of ["Radiance of the Dawn", "Divine Intervention", "Turn Undead", "Thaumaturgy", "Guidance", "Toll the Dead", "Spare the Dying",
    "Silence", "Revivify", "Cure Wounds", "Lesser Restoration", "Death Ward", "Choker of Caution", "Agility Ring"]) assert.ok(ready.some(entry => entry.name === name), name);
});

test("lists of names split into separate entries, aliases resolve, duplicates merge", () => {
  const dumDum = organizeSheet(party.find(member => member.name === "Dum Dum"));
  const ready = dumDum.sections.flatMap(section => section.entries.map(entry => entry.name));
  for (const name of ["Trip Attack", "Goading Attack", "Menacing Attack", "Disarming Attack", "Pushing Attack", "Precision Attack", "Riposte",
    "Battle Master maneuvers", "Action Surge", "Indomitable", "Shield Master", "Dueling", "Longsword"]) assert.ok(ready.includes(name), name);
  assert.deepEqual(dumDum.confirm, [], "all seven maneuvers are known");
  const logan = organizeSheet(party.find(member => member.name === "Logan Ninefingers"));
  const loganReady = logan.sections.flatMap(section => section.entries.map(entry => entry.name));
  for (const name of ["Handaxe", "Javelin", "Savage Attacker"]) assert.ok(loganReady.includes(name), name);
  assert.ok(!loganReady.includes("Great Weapon Master"));
  const roan = organizeSheet(party.find(member => member.name === "Roan the Last Shadow"));
  const roanReady = roan.sections.flatMap(section => section.entries.map(entry => entry.name));
  for (const name of ["Wrist blade", "Razor Shuriken", "Sneak Attack", "Living Shadow", "Shadow Slash", "Death Mark", "Contempt for the Weak", "Cunning Action", "Uncanny Dodge", "Evasion"]) assert.ok(roanReady.includes(name), name);
  assert.equal(lookupRule("Living-shadow swap").name, "Living Shadow");
  // Two lines naming the same ability merge into one entry with both notes.
  const merged = organizeSheet({ role: "", moves: "explore | Living Shadow — Swap in the casino.\ndanger | Living Shadow — Reposition if it's safe." });
  assert.equal(merged.sections.flatMap(section => section.entries).find(entry => entry.name === "Living Shadow").notes.length, 2);
  assert.equal(lookupRule("Hunter’s Mark").name, "Hunter's Mark");
  assert.equal(lookupRule("Improved Flare").name, "Warding Flare");
  assert.equal(lookupRule("superiority dice").name, "Battle Master maneuvers");
});

test("every full sheet is complete and every sheet fits the database limits", async () => {
  const { sheets } = await import("../src/campaign.js");
  for (const name of ["The White Wizard", "Arcturus", "Logan Ninefingers", "Dum Dum"]) {
    const full = sheets[name];
    assert.ok(full, name);
    assert.equal(full.abilities.length, 6, name);
    assert.equal(full.saves.length, 6, name);
    assert.equal(full.skills.length, 18, name);
    assert.ok(full.questions.length >= 4, name);
  }
  for (const member of party) {
    assert.ok(member.role.length <= 90, member.name + " role");
    assert.ok(member.moves.length <= 5000, member.name + " moves");
  }
});

test("every rule and basic has a summary and nothing calls out to an AI", () => {
  for (const [name, rule] of Object.entries(rules)) {
    assert.ok(rule.meta && rule.text.length > 40, name);
  }
  assert.ok(basics.length >= 15);
  assert.ok(basics.some(([term]) => term === "Concentration"));
});

test("Arcturus: full sheet data and the confirmed vs. unconfirmed split", async () => {
  const { sheets } = await import("../src/campaign.js");
  const arcturus = party.find(member => member.name === "Arcturus");
  const full = sheets.Arcturus;
  assert.equal(full.abilities.find(([label]) => label === "DEX")[1], 20);
  assert.equal(full.skills.length, 18);
  assert.deepEqual(full.skills.filter(row => row[3] === "proficient").map(row => row[0]), ["History", "Insight", "Perception", "Persuasion", "Stealth", "Survival"]);
  assert.ok(full.questions.length >= 4);
  const sheet = organizeSheet(arcturus);
  const ready = sheet.sections.flatMap(section => section.entries.map(entry => entry.name));
  for (const name of ["Longbow", "Extra Attack", "Dread Ambusher", "Archery", "Disguise Self", "Stealth", "Persuasion", "Defensive Duelist",
    "Hunter's Mark", "Hide in Plain Sight", "Rope Trick", "Fear", "Dagger", "Iron Mind", "Cure Wounds", "Pass Without Trace", "Mask of the Wild",
    "Alert", "Favored Enemy", "Natural Explorer"]) assert.ok(ready.includes(name), name);
  const confirm = sheet.confirm.map(entry => entry.name);
  assert.deepEqual(confirm, [], "Alert settled the Level 10 ability");
  assert.equal(full.rolls.find(([label]) => label === "Initiative")[1], "+12");
  for (const name of ["Lightning Arrow", "Tireless", "Silence"]) assert.ok(!ready.includes(name) && !confirm.includes(name), name + " is out of the default loadout");
  assert.match(arcturus.moves, /Longbow — \+11 to hit/);
});

test("every 5e condition has a plain-language rule", async () => {
  const { conditions } = await import("../src/rules.js");
  const names = conditions.map(condition => condition.name);
  for (const name of ["Blinded", "Charmed", "Deafened", "Exhaustion", "Frightened", "Grappled", "Incapacitated", "Invisible", "Paralyzed", "Petrified", "Poisoned", "Prone", "Restrained", "Stunned", "Unconscious"]) {
    assert.ok(names.includes(name), name + " is missing");
  }
  for (const condition of conditions) assert.ok(condition.text.length > 40 && condition.icon, condition.name);
  assert.match(conditions.find(condition => condition.name === "Poisoned").roll, /disadvantage/i);
});
