import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend, characterAbilities, coachingPrompt, partyPrompt } from "../src/scene-options.js";

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

test("the coaching prompt carries character, the last twenty updates, and asks for the bigger picture", () => {
  const prompt = coachingPrompt(shadow, scenes(Array.from({ length: 25 }, (_, index) => "u" + index)));
  assert.match(prompt, /Roan the Last Shadow/);
  assert.doesNotMatch(prompt, /^- u4$/m);
  assert.match(prompt, /^- u5$/m);
  assert.match(prompt, /^- u24$/m);
  assert.match(prompt, /what you think the DM is building toward/);
});

test("the whole-party prompt carries every sheet and the whole session, DM and players in order", () => {
  const story = [{ id: 1, text: "u0", created: 0 }, ...scenes(Array.from({ length: 30 }, (_, index) => "u" + (index + 1))).map(scene => ({ ...scene, created: scene.created + 1 })),
    { id: 99, text: "🔒 To: Roan the Last Shadow\nA whisper only Roan hears", created: 40 }];
  const actions = [{ id: 1, name: "The White Wizard", text: "casts Detect Magic", created: 5 }];
  const me = { ...shadow, moves: "combat | Shadow Slash — only mine" };
  const prompt = partyPrompt(me, [cleric, shadow], story, actions);
  assert.match(prompt, /^### The White Wizard \(Half-Elf Light Domain cleric\)$/m);
  assert.match(prompt, /^### Roan the Last Shadow .*\(this is me\)$/m);
  assert.match(prompt, /only mine/);
  assert.match(prompt, /^- DM: u0$/m);
  assert.match(prompt, /- DM: u5\n- The White Wizard: casts Detect Magic\n- DM: u6/);
  assert.match(prompt, /^- DM: \(only to Roan the Last Shadow\) A whisper only Roan hears$/m);
  assert.match(prompt, /what you think the DM is building toward/);
  assert.match(prompt, /leave outcomes to the DM/);
});

test("the whole-party prompt says so when it only has the latest updates", () => {
  const prompt = partyPrompt(shadow, [shadow], scenes(["u0"]), [], { partial: true });
  assert.match(prompt, /earlier updates aren't included/);
  assert.doesNotMatch(partyPrompt(shadow, [shadow], scenes(["u0"])), /earlier updates aren't included/);
});

test("everyday combat narration from real sessions reads as combat", () => {
  for (const text of [
    "The monster starts attacking everyone",
    "It swoops down at Logan",
    "The guard hits you for 6 damage",
    "Everyone roll initiative",
    "The fighting spills into the street"
  ]) assert.equal(recommend(cleric, scenes([text])).situation, "Combat", text);
});

test("a creature showing up reads as something approaching, not exploration", () => {
  assert.equal(recommend(cleric, scenes(["And they encounter a one eyed flying purple people eater"])).situation, "Something is approaching");
});

test("combat continues through transcript fragments", () => {
  const result = recommend(cleric, scenes(["The monster starts attacking everyone", "People eat that's purple"]));
  assert.equal(result.situation, "Combat");
});

test("the Level 10 roster: every character gets two suggestions and no check line is suggested", async () => {
  const { party } = await import("../src/campaign.js");
  for (const character of party) {
    const checks = characterAbilities(character).check.map(line => line.split(" — ")[0]);
    for (const text of ["Roll initiative.", "The door is locked.", "Logan is unconscious.", "The bartender says hello.", "Footsteps approach.", "You enter a quiet hall."]) {
      const { options } = recommend(character, scenes([text]));
      assert.equal(options.length, 2, character.name + ": " + text);
      for (const name of checks) assert.ok(!options.join(" ").includes(name + " —"), character.name + " suggested " + name);
    }
  }
});

test("Dum Dum's fighter role gets the melee tactics", async () => {
  const { party } = await import("../src/campaign.js");
  const dumDum = party.find(member => member.name === "Dum Dum");
  const { options } = recommend({ ...dumDum, moves: "" }, scenes(["The guards attack!"]));
  assert.match(options[0], /Approach an enemy you can reach/);
});

test("live session 2: moving to the tavern and hunting a shady figure change the suggestions", async () => {
  const { party } = await import("../src/campaign.js");
  const lines = [
    "take the party out of the casino and across the way to the tavern",
    "have them look for a shady looking individual",
    "take the party out of Casino across the way to the tavern have them look for a shady individual"
  ];
  const results = lines.map((_, index) => recommend(party[0], scenes(lines.slice(0, index + 1))));
  assert.deepEqual(results.map(result => result.situation), ["On the move", "Looking for someone", "Looking for someone"]);
  assert.notDeepEqual(results[0].options, results[1].options);
});

test("a single shared word doesn't pin the same sheet ability every update", async () => {
  const { party } = await import("../src/campaign.js");
  const seen = new Set();
  for (let id = 1; id <= 6; id++) {
    const { options } = recommend(party[0], [{ id, text: "You look around the casino.", created: 0 }]);
    seen.add(options[0]);
  }
  assert.ok(seen.size > 1);
});
