import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend, characterAbilities, coachingPrompt } from "../src/scene-options.js";

const cleric = { name: "The White Wizard", role: "Half-Elf Light Domain cleric", moves: [
  "combat | Sacred Flame — cantrip.",
  "combat | Fireball — slot.",
  "aid | Healing Word — bonus action.",
  "check | Divine Intervention — confirm."
].join("\n") };
const shadow = { name: "Roan the Last Shadow", role: "Living-shadow abilities", moves: [
  "explore | Living-shadow swap — swap places with the shadow.",
  "check | Confirm the shadow feature."
].join("\n") };
const scenes = texts => texts.map((text, index) => ({ id: index + 1, text, created: index }));

test("every situation yields exactly two distinct suggestions", () => {
  const cases = [
    ["Roll initiative. The guards draw their muskets."],
    ["Logan is unconscious and bleeding."],
    ["The bartender says the vault is downstairs."],
    ["The door is locked."],
    ["Footsteps approach from the hall."],
    ["You find a quiet room with a desk."],
    []
  ];
  for (const texts of cases) for (const character of [cleric, shadow]) {
    const { options } = recommend(character, scenes(texts));
    assert.equal(options.length, 2, texts.join(" ") + " / " + character.name);
    assert.notEqual(options[0], options[1]);
  }
});

test("combat stays active until the DM ends it", () => {
  const during = recommend(cleric, scenes(["Roll initiative.", "The captain says nothing and glares."]));
  assert.equal(during.situation, "Combat");
  const after = recommend(cleric, scenes(["Roll initiative.", "The fight is over.", "The bartender says hello."]));
  assert.equal(after.situation, "Someone can be questioned");
});

test("an ally down overrides combat", () => {
  const result = recommend(cleric, scenes(["Roll initiative.", "Logan is unconscious."]));
  assert.equal(result.situation, "An ally needs help");
  assert.match(result.options[0], /Healing Word/);
});

test("unconfirmed abilities are listed but never suggested", () => {
  const { ready, check } = characterAbilities(cleric);
  assert.equal(check.length, 1);
  assert.ok(!ready.some(move => move.includes("Divine Intervention")));
  for (const text of ["Roll initiative.", "The door is locked.", "Logan is unconscious."]) {
    const { options } = recommend(cleric, scenes([text]));
    assert.ok(!options.join(" ").includes("Divine Intervention"));
  }
});

test("the cleric's sheet ability is not repeated by the class tactic", () => {
  for (const texts of [["The guards attack!"], ["Roll initiative.", "The guards attack!"]]) {
    const { options } = recommend(cleric, scenes(texts));
    const name = options[0].match(/available: ([^—]+) —/)[1].trim();
    assert.doesNotMatch(options[1], new RegExp(name));
  }
});

test("the coaching prompt carries character and the last five updates", () => {
  const prompt = coachingPrompt(shadow, scenes(["a", "b", "c", "d", "e", "f"]));
  assert.match(prompt, /Roan the Last Shadow/);
  assert.doesNotMatch(prompt, /^- a$/m);
  assert.match(prompt, /^- f$/m);
});
