// DM encounter tracker: enemy templates and pure helpers. The live encounter
// is kept on the DM's device (localStorage), never sent to players.
import { roll, parse } from "./dice.js";

// Standard 5e (SRD 5.1) stat lines, summarized. attacks: [name, to-hit, damage].
export const templates = [
  { name: "Guard", ac: 16, hp: "2d8+2", init: 1, speed: 30, attacks: [["Spear", 3, "1d6+1"]],
    abilities: "Chain shirt and shield. Spear can be thrown (20/60 ft)." },
  { name: "Bandit", ac: 12, hp: "2d8+2", init: 1, speed: 30, attacks: [["Scimitar", 3, "1d6+1"], ["Light crossbow", 3, "1d8+1"]],
    abilities: "Crossbow range 80/320 ft." },
  { name: "Thug", ac: 11, hp: "5d8+10", init: 0, speed: 30, attacks: [["Mace (×2)", 4, "1d6+2"], ["Heavy crossbow", 2, "1d10"]],
    abilities: "Multiattack: two mace attacks. Pack Tactics: advantage when an ally is within 5 ft of the target." },
  { name: "Bandit Captain", ac: 15, hp: "10d8+20", init: 3, speed: 30, attacks: [["Scimitar (×2)", 5, "1d6+3"], ["Dagger", 5, "1d4+3"]],
    abilities: "Multiattack: two scimitars and a dagger. Parry (reaction): +2 AC against one melee hit it can see." },
  { name: "Spy", ac: 12, hp: "6d8", init: 2, speed: 30, attacks: [["Shortsword (×2)", 4, "1d6+2"], ["Hand crossbow", 4, "1d6+2"]],
    abilities: "Cunning Action: Dash, Disengage, or Hide as a bonus action. Sneak Attack +2d6 once per turn with advantage or an ally adjacent." },
  { name: "Veteran", ac: 17, hp: "9d8+18", init: 1, speed: 30, attacks: [["Longsword (×2)", 5, "1d8+3"], ["Heavy crossbow", 3, "1d10+1"]],
    abilities: "Multiattack: two longsword attacks (plus a shortsword if drawn)." },
  { name: "Mage", ac: 12, hp: "9d8", init: 2, speed: 30, attacks: [["Dagger", 5, "1d4+2"], ["Fire Bolt (spell)", 6, "2d10"]],
    abilities: "Spell DC 14, +6. Mage Armor (AC 15). Spells: Misty Step, Counterspell, Fireball (8d6, Dex save), Ice Storm, Greater Invisibility, Cone of Cold (8d8, Con save)." },
  { name: "Goblin", ac: 15, hp: "2d6", init: 2, speed: 30, attacks: [["Scimitar", 4, "1d6+2"], ["Shortbow", 4, "1d6+2"]],
    abilities: "Nimble Escape: Disengage or Hide as a bonus action." },
  { name: "Wolf", ac: 13, hp: "2d8+2", init: 2, speed: 40, attacks: [["Bite", 4, "2d4+2"]],
    abilities: "Bite: DC 11 Strength save or knocked prone. Pack Tactics. Keen Hearing and Smell." },
  { name: "Ogre", ac: 11, hp: "7d10+21", init: -1, speed: 40, attacks: [["Greatclub", 6, "2d8+4"], ["Javelin", 6, "2d6+4"]],
    abilities: "Large. Javelin range 30/120 ft." }
];

// Rolls (or reads) hit points: "2d8+2" is rolled per enemy, "11" is fixed.
export function hitPoints(value, random) {
  const text = String(value).trim();
  if (/^\d+$/.test(text)) return Math.max(1, Number(text));
  const result = parse(text) && roll(text, random ? { random } : {});
  return result ? Math.max(1, result.total) : 1;
}

let counter = 0;
const newId = () => Date.now().toString(36) + "-" + (counter++).toString(36);

// Creates `count` enemies from a stat line: "Guard 1", "Guard 2"… (no number
// when there's only one).
export function createEnemies(stats, count = 1, random) {
  const total = Math.max(1, Math.min(30, Math.floor(Number(count) || 1)));
  return Array.from({ length: total }, (_, index) => {
    const max = hitPoints(stats.hp, random);
    return {
      id: newId(),
      name: total > 1 ? stats.name + " " + (index + 1) : stats.name,
      ac: Number(stats.ac) || 10,
      hp: max,
      maxHp: max,
      init: Number(stats.init) || 0,
      speed: Number(stats.speed) || 30,
      attacks: (stats.attacks ?? []).filter(([name]) => name).map(([name, hit, damage]) => [String(name), Number(hit) || 0, String(damage || "")]),
      abilities: String(stats.abilities ?? ""),
      initiative: null
    };
  });
}

export function applyHp(enemy, change) {
  const hp = Math.max(0, Math.min(enemy.maxHp, enemy.hp + change));
  return { ...enemy, hp };
}

export function status(enemy) {
  if (enemy.hp <= 0) return "down";
  if (enemy.hp <= enemy.maxHp / 2) return "bloodied";
  return "ok";
}

export function standing(enemies) {
  return enemies.filter(enemy => enemy.hp > 0).length;
}

// Rolls initiative for every enemy and returns them sorted high to low.
export function rollInitiative(enemies, random) {
  return enemies
    .map(enemy => ({ ...enemy, initiative: roll("d20" + (enemy.init >= 0 ? "+" : "") + enemy.init, random ? { random } : {}).total }))
    .sort((a, b) => b.initiative - a.initiative || b.init - a.init);
}
