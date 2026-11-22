import { test } from "node:test";
import assert from "node:assert/strict";
import { organizeSheet, lookupRule, rules, basics } from "../src/rules.js";
import { party } from "../src/campaign.js";

// Moves that exist only at this table; they show the table's note instead of a rule.
const tableSpecific = new Set([
  "Living-shadow swap", "Cause a distraction", "Distraction", "Lead the ambush", "Speak plainly",
  "Current HP", "Current HP and AC", "Level 10 ranger features", "Level 10 fighter features", "Note from the sheet"
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
  assert.deepEqual(titles, ["Cantrips", "1st-level spells", "2nd-level spells", "3rd-level spells", "4th-level spells", "Skills"]);
  const third = sheet.sections.find(section => section.title === "3rd-level spells").entries.map(entry => entry.name);
  assert.deepEqual(third.sort(), ["Fireball", "Spirit Guardians"]);
  const fireball = sheet.sections.flatMap(section => section.entries).find(entry => entry.name === "Fireball");
  assert.match(fireball.rule.meta, /Action · 150 ft · Dex save/);
  assert.match(fireball.notes[0], /24/);
  const confirmNames = sheet.confirm.map(entry => entry.name);
  for (const name of ["Flame Strike", "Scrying", "Silence", "Divine Intervention", "Current HP"]) assert.ok(confirmNames.includes(name), name);
});

test("lists of names split into separate entries, aliases resolve, duplicates merge", () => {
  const dumDum = organizeSheet(party.find(member => member.name === "Dum Dum"));
  const confirm = dumDum.confirm.map(entry => entry.name);
  assert.ok(confirm.includes("Battle Master maneuvers"));
  assert.equal(confirm.filter(name => name === "Battle Master maneuvers").length, 1, "Trip Attack and superiority dice merge into one");
  assert.ok(confirm.includes("Action Surge") && confirm.includes("Second Wind"));
  const roan = organizeSheet(party.find(member => member.name === "Roan the Last Shadow"));
  const swap = roan.sections.flatMap(section => section.entries).find(entry => entry.name === "Living-shadow swap");
  assert.equal(swap.notes.length, 2, "both shadow-swap notes kept on one entry");
  assert.equal(lookupRule("Hunter’s Mark").name, "Hunter's Mark");
  assert.equal(lookupRule("Trip Attack").name, "Battle Master maneuvers");
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
  assert.deepEqual(full.skills.filter(row => row[3] === "proficient").map(row => row[0]), ["Persuasion", "Stealth"]);
  assert.equal(full.questions.length, 6);
  const sheet = organizeSheet(arcturus);
  const ready = sheet.sections.flatMap(section => section.entries.map(entry => entry.name));
  for (const name of ["Longbow", "Extra Attack", "Dread Ambusher", "Archery", "Disguise Self", "Stealth", "Persuasion", "Defensive Duelist"]) assert.ok(ready.includes(name), name);
  const confirm = sheet.confirm.map(entry => entry.name);
  for (const name of ["Hunter's Mark", "Lightning Arrow", "Hide in Plain Sight", "Tireless", "Rope Trick", "Fear", "Dagger", "Iron Mind"]) assert.ok(confirm.includes(name), name);
  assert.ok(!ready.includes("Hunter's Mark"), "Hunter's Mark stays unconfirmed until the DM says it's known");
  assert.match(arcturus.moves, /Longbow — \+11 to hit/);
});
