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

// ── Combat mode (shared with every phone) ──

// What players may see of an enemy: never HP, AC, or attacks.
export function publicEnemies(enemies) {
  return enemies.map(enemy => ({
    id: enemy.id,
    name: enemy.name,
    initiative: enemy.initiative,
    status: status(enemy),
    conditions: enemy.conditions ?? []
  }));
}

// One initiative order from the party (their recorded rolls) and the enemies.
// Highest first; ties go to the party; anyone who hasn't rolled goes last.
// Turn keys: "pc:<index>" and "en:<id>".
export function combatOrder(combat, party) {
  if (!combat) return [];
  const rolls = combat.party ?? {};
  const players = party.map((character, index) => ({
    key: "pc:" + index, kind: "pc", character: index, name: character.name,
    initiative: Number.isFinite(rolls[index]) ? rolls[index] : null, status: "ok", conditions: []
  }));
  const foes = (combat.enemies ?? []).map(enemy => ({
    key: "en:" + enemy.id, kind: "enemy", name: enemy.name,
    initiative: Number.isFinite(enemy.initiative) ? enemy.initiative : null,
    status: enemy.status ?? "ok", conditions: enemy.conditions ?? []
  }));
  const rank = entry => entry.initiative ?? -Infinity;
  return [...players, ...foes]
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => rank(b.entry) - rank(a.entry) || (a.entry.kind === "pc" ? -1 : 0) - (b.entry.kind === "pc" ? -1 : 0) || a.index - b.index)
    .map(({ entry }) => entry);
}

// The next turn after `turn`, skipping enemies that are down. Moving past the
// end of the order starts a new round. direction -1 steps back.
export function nextTurn(order, turn, round = 1, direction = 1) {
  const live = order.filter(entry => entry.status !== "down");
  if (!live.length) return { turn: null, round };
  const at = live.findIndex(entry => entry.key === turn);
  if (at < 0) return { turn: live[direction > 0 ? 0 : live.length - 1].key, round };
  let next = at + direction;
  if (next >= live.length) return { turn: live[0].key, round: round + 1 };
  if (next < 0) return round > 1 ? { turn: live[live.length - 1].key, round: round - 1 } : { turn: live[0].key, round };
  return { turn: live[next].key, round };
}

// Which turn comes after the current one (for the "you're up next" heads-up).
export function upNext(order, turn) {
  const live = order.filter(entry => entry.status !== "down");
  const at = live.findIndex(entry => entry.key === turn);
  return at < 0 ? null : live[(at + 1) % live.length]?.key ?? null;
}

// ── Party hit points ──

// Max HP from a sheet's "HP" line ("75 max with the cloak · …" → 75).
export function maxHpFromSheet(text) {
  const match = String(text ?? "").match(/\d+/);
  const value = match ? Number(match[0]) : NaN;
  return value >= 1 && value <= 999 ? value : null;
}

// Same rule as the database: damage (negative) uses temp HP first; healing
// stops at max.
export function changePartyHp(record, change) {
  if (change < 0) {
    return { ...record, temp: Math.max(0, record.temp + change), hp: Math.max(0, record.hp - Math.max(0, -change - record.temp)) };
  }
  return { ...record, hp: Math.min(record.max, record.hp + change) };
}

export function partyHpStatus(record) {
  if (!record) return "unknown";
  if (record.hp <= 0) return "down";
  if (record.hp <= record.max / 2) return "bloodied";
  return "ok";
}

// The combat numbers a player needs at a glance, read from their sheet
// (combat: [[label, text]], rolls: [[label, value]]). A confirmed AC saved
// with their HP replaces the sheet's.
export function combatStats(sheet, record) {
  const combat = Object.fromEntries(sheet?.combat ?? []);
  const rolls = Object.fromEntries(sheet?.rolls ?? []);
  const first = text => String(text ?? "").match(/[+-]?\d+/)?.[0] ?? null;
  const sheetAc = first(combat.AC);
  const unsure = /\bor\b|–|-\d|\bif\b|unconfirmed|TBD|\?/i.test(combat.AC ?? "") || /\*/.test(rolls.AC ?? "");
  const passive = String(combat.Passive ?? combat["Passive Perception"] ?? "").match(/(?:Perception\s*)?(\d+)/)?.[1] ?? null;
  const dcLabel = Object.keys(rolls).find(label => /\bDC\b/.test(label));
  const stats = [
    ["AC", record?.ac ? String(record.ac) : sheetAc, !record?.ac && unsure],
    ["Initiative", rolls.Initiative ?? combat.Initiative ?? null, false],
    ["Speed", first(combat.Speed) ? first(combat.Speed) + " ft" : null, false],
    ["Passive Perc.", passive, /if/i.test(combat["Passive Perception"] ?? "")],
    [dcLabel ? dcLabel.replace(/^Spell save DC$/, "Spell DC") : "Save DC", dcLabel ? rolls[dcLabel] : null, false],
    ["Proficiency", combat.Proficiency ?? null, false]
  ];
  return stats.filter(([, value]) => value).map(([label, value, unconfirmed]) => ({ label, value: String(value).replace(/\*$/, ""), unconfirmed }));
}

// 5e concentration save after damage: DC 10 or half the damage, if higher.
export const concentrationDc = damage => Math.max(10, Math.floor(damage / 2));
