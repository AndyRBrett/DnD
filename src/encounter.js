// DM encounter tracker: enemy templates and pure helpers. The live encounter
// is kept on the DM's device (localStorage), never sent to players.
import { roll, parse, critExpression } from "./dice.js";
import { lookupRule } from "./rules.js";

// Standard 5e (SRD 5.1) stat lines, summarized. attacks: [name, to-hit,
// damage, rider?]. A rider is what else a hit does: extra damage, a save the
// target makes, or both ({ damage, type, save, dc, half, effect }).
// saves: saving throw bonuses in the order Str, Dex, Con, Int, Wis, Cha.
const ASSASSIN_POISON = { damage: "7d6", type: "poison", save: "Con", dc: 15, half: true };
export const templates = [
  { name: "Guard", ac: 16, hp: "2d8+2", init: 1, speed: 30, saves: [1, 1, 1, 0, 0, 0], attacks: [["Spear", 3, "1d6+1"]],
    abilities: "Chain shirt and shield. Spear can be thrown (20/60 ft)." },
  { name: "Bandit", ac: 12, hp: "2d8+2", init: 1, speed: 30, saves: [0, 1, 1, 0, 0, 0], attacks: [["Scimitar", 3, "1d6+1"], ["Light crossbow", 3, "1d8+1"]],
    abilities: "Crossbow range 80/320 ft." },
  { name: "Thug", ac: 11, hp: "5d8+10", init: 0, speed: 30, saves: [2, 0, 2, 0, 0, 0], attacks: [["Mace (×2)", 4, "1d6+2"], ["Heavy crossbow", 2, "1d10"]],
    abilities: "Multiattack: two mace attacks. Pack Tactics: advantage when an ally is within 5 ft of the target." },
  { name: "Bandit Captain", ac: 15, hp: "10d8+20", init: 3, speed: 30, saves: [4, 5, 2, 2, 2, 2], attacks: [["Scimitar (×2)", 5, "1d6+3"], ["Dagger", 5, "1d4+3"]],
    abilities: "Multiattack: two scimitars and a dagger. Parry (reaction): +2 AC against one melee hit it can see." },
  { name: "Spy", ac: 12, hp: "6d8", init: 2, speed: 30, saves: [0, 2, 0, 1, 2, 3], attacks: [["Shortsword (×2)", 4, "1d6+2"], ["Hand crossbow", 4, "1d6+2"]],
    abilities: "Cunning Action: Dash, Disengage, or Hide as a bonus action. Sneak Attack +2d6 once per turn with advantage or an ally adjacent." },
  { name: "Veteran", ac: 17, hp: "9d8+18", init: 1, speed: 30, saves: [3, 1, 2, 0, 0, 0], attacks: [["Longsword (×2)", 5, "1d8+3"], ["Heavy crossbow", 3, "1d10+1"]],
    abilities: "Multiattack: two longsword attacks (plus a shortsword if drawn)." },
  { name: "Mage", ac: 12, hp: "9d8", init: 2, speed: 30, saves: [-1, 2, 0, 6, 4, 0], attacks: [["Dagger", 5, "1d4+2"], ["Fire Bolt (spell)", 6, "2d10"]],
    abilities: "Spell DC 14, +6. Mage Armor (AC 15). Spells: Misty Step, Counterspell, Fireball (8d6, Dex save), Ice Storm, Greater Invisibility, Cone of Cold (8d8, Con save)." },
  { name: "Goblin", ac: 15, hp: "2d6", init: 2, speed: 30, saves: [-1, 2, 0, 0, -1, -1], attacks: [["Scimitar", 4, "1d6+2"], ["Shortbow", 4, "1d6+2"]],
    abilities: "Nimble Escape: Disengage or Hide as a bonus action." },
  { name: "Wolf", ac: 13, hp: "2d8+2", init: 2, speed: 40, saves: [1, 2, 1, -4, 1, -2], attacks: [["Bite", 4, "2d4+2", { save: "Str", dc: 11, effect: "knocked prone" }]],
    abilities: "Bite: DC 11 Strength save or knocked prone. Pack Tactics. Keen Hearing and Smell." },
  { name: "Ogre", ac: 11, hp: "7d10+21", init: -1, speed: 40, saves: [4, -1, 3, -3, -2, -2], attacks: [["Greatclub", 6, "2d8+4"], ["Javelin", 6, "2d6+4"]],
    abilities: "Large. Javelin range 30/120 ft." },
  // Tougher foes for a level 10 party (challenge 5 to 8).
  { name: "Gladiator", ac: 16, hp: "15d8+45", init: 2, speed: 30, saves: [7, 5, 6, 0, 1, 2], attacks: [["Spear (×3)", 7, "2d6+4"], ["Shield Bash", 7, "2d4+4", { save: "Str", dc: 15, effect: "knocked prone" }]],
    abilities: "Multiattack: three melee attacks (or two ranged spear throws, 20/60 ft). Shield Bash: DC 15 Strength save or knocked prone. Parry (reaction): +3 AC against one melee hit it can see." },
  { name: "Troll", ac: 15, hp: "8d10+40", init: 1, speed: 30, saves: [4, 1, 5, -2, -1, -2], attacks: [["Claw (×2)", 7, "2d6+4"], ["Bite", 7, "1d6+4"]],
    abilities: "Large. Multiattack: a bite and two claws. Regeneration: regains 10 HP at the start of its turn unless it took acid or fire damage since its last turn; it only dies at 0 HP if it doesn't regenerate. Keen Smell." },
  { name: "Hill Giant", ac: 13, hp: "10d12+40", init: -1, speed: 40, saves: [5, -1, 4, -3, -1, -2], attacks: [["Greatclub (×2)", 8, "3d8+5"], ["Rock", 8, "3d10+5"]],
    abilities: "Huge. Multiattack: two greatclub attacks. Rock range 60/240 ft." },
  { name: "Wraith", ac: 13, hp: "9d8+27", init: 3, speed: 60, saves: [-2, 3, 3, 1, 2, 2], attacks: [["Life Drain", 6, "4d8+3", { save: "Con", dc: 14, effect: "max HP drops by the damage until a long rest" }]],
    abilities: "Flies (60 ft) and moves through creatures and objects. Life Drain is necrotic: DC 14 Constitution save or the target's max HP drops by the damage until a long rest. Resists most nonmagical weapon damage; immune to necrotic and poison. Sunlight: disadvantage on attacks and Perception." },
  { name: "Oni", ac: 16, hp: "13d10+39", init: 0, speed: 30, saves: [4, 3, 6, 2, 4, 5], attacks: [["Glaive (×2)", 7, "2d10+4"]],
    abilities: "Large; flies 30 ft. Multiattack: two glaive attacks. Regenerates 10 HP a turn while above 0 HP. Innate spells (DC 13): darkness, invisibility, charm person, cone of cold (8d8, Con save), gaseous form, sleep. Can change shape." },
  { name: "Stone Giant", ac: 17, hp: "11d12+55", init: 2, speed: 40, saves: [6, 5, 8, 0, 4, -1], attacks: [["Greatclub (×2)", 9, "3d8+6"], ["Rock", 9, "4d10+6", { save: "Str", dc: 17, effect: "knocked prone" }]],
    abilities: "Huge. Multiattack: two greatclub attacks. Rock (60/240 ft): DC 17 Strength save or knocked prone. Rock Catching (reaction): DC 10 Dex save to catch a thrown rock." },
  { name: "Assassin", ac: 15, hp: "12d8+24", init: 3, speed: 30, saves: [0, 6, 2, 4, 0, 0], attacks: [["Shortsword (×2)", 6, "1d6+3", ASSASSIN_POISON], ["Light crossbow", 6, "1d8+3", ASSASSIN_POISON]],
    abilities: "Multiattack: two shortsword attacks. Each hit also deals 7d6 poison (DC 15 Constitution save for half). Sneak Attack +4d6 once a turn. Assassinate: advantage against anyone who hasn't acted yet, and any hit on a surprised creature is a critical. Evasion." },
  { name: "Young Green Dragon", ac: 18, hp: "16d10+48", init: 1, speed: 40, saves: [4, 4, 6, 3, 4, 5], attacks: [["Claw (×2)", 7, "2d6+4"], ["Bite", 7, "2d10+4", { damage: "2d6", type: "poison" }]],
    abilities: "Large; flies 80 ft, swims 40 ft. Multiattack: a bite and two claws; the bite adds 2d6 poison. Poison Breath (recharge 5–6): 30-ft cone, DC 14 Constitution save, 12d6 poison, half on a save. Amphibious. Immune to poison." }
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
// Names stay unique in the encounter (a second "Bandit" becomes "Bandit 2"),
// because players report hits by name.
export function createEnemies(stats, count = 1, random, existing = []) {
  const total = Math.max(1, Math.min(30, Math.floor(Number(count) || 1)));
  const taken = new Set(existing.map(enemy => enemy.name));
  const nextName = () => {
    if (total === 1 && !taken.has(stats.name)) return stats.name;
    let number = 1;
    while (taken.has(stats.name + " " + number) || (number === 1 && taken.has(stats.name))) number++;
    return stats.name + " " + number;
  };
  return Array.from({ length: total }, () => {
    const max = hitPoints(stats.hp, random);
    const name = nextName();
    taken.add(name);
    return {
      id: newId(),
      name,
      ac: Number(stats.ac) || 10,
      hp: max,
      maxHp: max,
      init: Number(stats.init) || 0,
      speed: Number(stats.speed) || 30,
      attacks: (stats.attacks ?? []).filter(([name]) => name).map(([name, hit, damage, rider]) =>
        rider ? [String(name), Number(hit) || 0, String(damage || ""), rider] : [String(name), Number(hit) || 0, String(damage || "")]),
      abilities: String(stats.abilities ?? ""),
      saves: normalizeSaves(stats.saves),
      initiative: null
    };
  });
}

// ── Enemy saving throws ──
export const SAVE_ABILITIES = ["Str", "Dex", "Con", "Int", "Wis", "Cha"];
// Six bonuses (an array in Str…Cha order, or { Dex: 2, … }), missing ones +0.
export function normalizeSaves(saves) {
  if (Array.isArray(saves)) return SAVE_ABILITIES.map((_, index) => Math.round(Number(saves[index]) || 0));
  return SAVE_ABILITIES.map(ability => Math.round(Number(saves?.[ability]) || 0));
}
// "Dex +2, Con +5" ↔ the six bonuses (anything not named is +0).
export function parseSaves(text) {
  const found = {};
  for (const match of String(text ?? "").matchAll(/\b(str|dex|con|int|wis|cha)\w*\s*([+\-−]?\s*\d+)/gi)) {
    const ability = match[1][0].toUpperCase() + match[1].slice(1, 3).toLowerCase();
    found[ability] = Number(match[2].replace(/[\s]/g, "").replace("−", "-"));
  }
  return normalizeSaves(found);
}
export const formatSaves = saves => normalizeSaves(saves).map((value, index) => SAVE_ABILITIES[index] + " " + (value >= 0 ? "+" : "") + value).join(", ");
export const saveBonus = (enemy, ability) => normalizeSaves(enemy?.saves)[SAVE_ABILITIES.indexOf(ability)] ?? 0;

// An enemy's save against a player's spell: d20 + bonus against the DC.
// Damage: all of it on a failure; half (or none) on a success.
export function enemySave(enemy, { ability, dc, amount, half }, random) {
  const bonus = saveBonus(enemy, ability);
  const result = roll("d20" + (bonus >= 0 ? "+" : "") + bonus, random ? { random } : {});
  const saved = result.total >= dc;
  return { total: result.total, natural: result.natural, bonus, saved, damage: saved ? (half ? Math.floor(amount / 2) : 0) : amount };
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
// A character the DM has sat out of this fight (elsewhere in the story) is
// stored as "out" in place of an initiative: no turn, no initiative prompt.
export const SITTING_OUT = "out";
export const isSittingOut = (combat, index) => combat?.party?.[index] === SITTING_OUT;
export function sittingOut(combat, party) {
  return party.map((_, index) => index).filter(index => isSittingOut(combat, index));
}

export function combatOrder(combat, party) {
  if (!combat) return [];
  const rolls = combat.party ?? {};
  const players = party.map((character, index) => ({
    key: "pc:" + index, kind: "pc", character: index, name: character.name,
    initiative: Number.isFinite(rolls[index]) ? rolls[index] : null, status: "ok", conditions: []
  })).filter(entry => rolls[entry.character] !== SITTING_OUT);
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
  // Find the current turn in the full order, so a combatant who just went
  // down still marks the place to step from.
  const at = order.findIndex(entry => entry.key === turn);
  if (at < 0) return { turn: live[direction > 0 ? 0 : live.length - 1].key, round };
  let index = at;
  for (let step = 0; step < order.length; step++) {
    index += direction;
    if (index >= order.length) { index = 0; round += 1; }
    if (index < 0) {
      if (round <= 1) return { turn: live[0].key, round: 1 };
      index = order.length - 1;
      round -= 1;
    }
    if (order[index].status !== "down") return { turn: order[index].key, round };
  }
  return { turn: live[0].key, round };
}

// Which turn comes after the current one (for the "you're up next" heads-up).
export function upNext(order, turn) {
  const at = order.findIndex(entry => entry.key === turn);
  if (at < 0) return null;
  for (let step = 1; step <= order.length; step++) {
    const entry = order[(at + step) % order.length];
    if (entry.status !== "down") return entry.key;
  }
  return null;
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

// ── Attacks against the party ──

// A character's AC for the DM: the number set on the Party HP card, or the
// sheet's. An unconfirmed sheet AC ("20 plate + shield, or 18 half plate") is
// a range, low to high, shown with a "?" so nobody takes it as fact.
export function acRange(sheet, record) {
  if (record?.ac) return { low: record.ac, high: record.ac, unconfirmed: false, text: String(record.ac) };
  const stat = combatStats(sheet).find(entry => entry.label === "AC");
  const first = Number.parseInt(stat?.value ?? "", 10);
  if (!Number.isFinite(first)) return null;
  if (!stat.unconfirmed) return { low: first, high: first, unconfirmed: false, text: String(first) };
  const source = String(Object.fromEntries(sheet?.combat ?? []).AC ?? "") + " " + String(Object.fromEntries(sheet?.rolls ?? []).AC ?? "");
  const numbers = [first, ...[...source.matchAll(/\d+/g)].map(match => Number(match[0])).filter(value => value >= 10 && value <= 30)];
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return { low, high, unconfirmed: true, text: (low === high ? String(low) : low + "–" + high) + "?" };
}

// Did an enemy's attack hit? A natural 20 always hits (a critical); a
// natural 1 always misses; otherwise it hits if the total meets the AC. With
// an unconfirmed AC range, a total inside the range is "unsure": the DM decides.
export function attackOutcome(toHit, ac) {
  if (toHit.critical) return "crit";
  if (toHit.fumble) return "miss";
  const range = typeof ac === "object" && ac ? ac : { low: ac, high: ac };
  if (!Number.isFinite(range.low) || !Number.isFinite(range.high)) return "unknown";
  if (toHit.total >= range.high) return "hit";
  if (toHit.total < range.low) return "miss";
  return "unsure";
}

// Players tell the DM about damage they dealt through a story line in this
// exact shape, which the DM's phone reads back to offer "Apply".
// The optional detail says how ("with Greataxe, 19 to hit" or "with
// Fireball, DC 17 Dex save, half on a save").
export const hitReportText = (enemy, amount, detail = "") =>
  ("🎯 hit " + enemy + " for " + amount + " damage" + (detail ? " — " + detail : "")).slice(0, 300);
// A to-hit roll waiting for the DM's call, as at the table: "🎯 attacks
// Vault Warden — with Longsword, 23 to hit". The DM's tap appends the call
// ("· ✓ DM: hit" or "· ✗ DM: miss"), which the player's card reads to go on
// to damage or stop.
const VERDICT = / · (✓ DM: hit|✗ DM: miss)$/u;
export const attackAskText = (enemy, detail) => ("🎯 attacks " + enemy + " — " + detail).slice(0, 300);
export function parseAttackAsk(text) {
  const raw = String(text ?? "");
  const verdict = raw.match(VERDICT)?.[1];
  const match = raw.replace(VERDICT, "").match(/^🎯 attacks (.+?) — (.+)$/u);
  if (!match) return null;
  const toHit = match[2].match(/(\d+) to hit/);
  return { enemy: match[1], detail: match[2], toHit: toHit ? Number(toHit[1]) : null,
    verdict: verdict ? (verdict.startsWith("✓") ? "hit" : "miss") : null };
}
export const attackVerdictText = (text, verdict) =>
  String(text ?? "").replace(VERDICT, "") + (verdict === "hit" ? " · ✓ DM: hit" : " · ✗ DM: miss");

// A to-hit roll typed into the story box ("rolled a 25 to hit", "23 to hit,
// does it hit?") instead of rolled on the Attack card. Returns the total so
// the card can send it to the DM to call, or null for anything else.
export function parseTypedToHit(text) {
  const match = String(text ?? "").trim().match(/^(?:i\s+)?(?:rolled?\s+|got\s+)?(?:an?\s+)?(\d{1,2})\s*(?:to\s+hit|on\s+(?:the|my)\s+attack)\b[\s\S]{0,40}$/i);
  return match ? Number(match[1]) : null;
}

// The DM's phone marks a hit it applied (or dismissed) on the story line
// itself, so a second DM screen at the same table never applies it again.
const HANDLED_MARK = / · ✓ DM (applied|dismissed)$/u;
export const hitHandledText = (text, how = "applied") => String(text ?? "").replace(HANDLED_MARK, "") + " · ✓ DM " + how;
export function parseHitReport(text) {
  const handled = HANDLED_MARK.test(String(text ?? ""));
  const match = String(text ?? "").replace(HANDLED_MARK, "").match(/^🎯 hit (.+?) for (\d{1,3}) damage(?: — (.+))?$/u);
  if (!match) return null;
  const detail = match[3] ?? "";
  const toHit = detail.match(/(\d+) to hit/);
  return {
    enemy: match[1], amount: Number(match[2]), detail, handled,
    toHit: toHit ? Number(toHit[1]) : null,
    crit: /critical/i.test(detail),
    halfOnSave: /half on a save/i.test(detail),
    // "Dex save, DC 17": the enemy's save against a spell, which the DM can
    // roll in one tap. "DC 16 Strength save or knocked prone" (a maneuver):
    // the damage lands either way and the save only decides the effect.
    save: (() => {
      const found = detail.match(/\b(Str|Dex|Con|Int|Wis|Cha) save, DC (\d+)/i);
      if (found) return { ability: found[1][0].toUpperCase() + found[1].slice(1).toLowerCase(), dc: Number(found[2]) };
      const rider = detail.match(/\bDC (\d+) (Str|Dex|Con|Int|Wis|Cha)[a-z]* save(?: or ([^(),]+))?/i);
      return rider ? { ability: rider[2][0].toUpperCase() + rider[2].slice(1).toLowerCase(), dc: Number(rider[1]), rider: true, effect: rider[3]?.trim() ?? "" } : null;
    })()
  };
}

// Attacks written into an enemy's notes ("Musket +6 (2d8+2 piercing, range
// 80)", "two pincers +8 (2d8+4 slashing)") when the attack fields were left
// empty, so the DM's turn card still has an attack to tap. Up to two.
export function attacksFromNotes(text) {
  const found = [];
  const pattern = /([A-Za-z][A-Za-z' ]{1,30}?)\s*\+(\d{1,2})(?:\s*to hit)?\s*\((\d*d\d+(?:\s*[+-]\s*\d+)?)/g;
  for (const match of String(text ?? "").matchAll(pattern)) {
    const name = match[1].trim().replace(/^(?:and|or|with|a|an)\s+/i, "");
    if (!name) continue;
    found.push([name[0].toUpperCase() + name.slice(1), Number(match[2]), match[3].replace(/\s+/g, "")]);
    if (found.length === 2) break;
  }
  return found;
}

// A story line as a reader at the TV board should see it: a plain sentence
// for the attack bookkeeping ("🎯 attacks X — with Y, 18 to hit · ✓ DM: hit"),
// or null for lines nobody needs to read (a dismissed hit). kind sorts the
// look: hit, miss, call (a to-hit the DM called a hit; its damage line usually
// follows), pending (waiting for the DM), turn, or action (anything else).
export function chronicleLine(name, text) {
  const who = String(name ?? "").replace(/^The /, "");
  const raw = String(text ?? "");
  if (/^⏭️/u.test(raw)) return { kind: "turn", who, text: who + " ends their turn" };
  const ask = parseAttackAsk(raw);
  if (ask) {
    const weapon = ask.detail.match(/^with (.+?), \d+ to hit/)?.[1] ?? "";
    const how = weapon ? " with " + weapon : "";
    if (ask.verdict === "miss") return { kind: "miss", who, enemy: ask.enemy, text: who + " attacks " + ask.enemy + how + " and misses" };
    if (ask.verdict === "hit") return { kind: "call", who, enemy: ask.enemy, text: who + " hits " + ask.enemy + how };
    return { kind: "pending", who, enemy: ask.enemy, text: who + " attacks " + ask.enemy + how + "…" };
  }
  if (/ · ✓ DM dismissed$/u.test(raw)) return null;
  const hit = parseHitReport(raw);
  if (hit) {
    const weapon = hit.detail.match(/^with ([^,]+)/)?.[1] ?? "";
    // A spell with a save: the DM decides what lands (half, or none), so say
    // what was rolled, not what was dealt.
    if (hit.save && !hit.save.rider) {
      return { kind: "hit", who, enemy: hit.enemy, text: who + " casts " + (weapon || "a spell") + " on " + hit.enemy + ": " + hit.amount
        + " damage rolled, " + hit.save.ability + " save " + (hit.halfOnSave ? "for half" : "to avoid it") };
    }
    return { kind: "hit", who, enemy: hit.enemy,
      text: who + (hit.crit ? " lands a critical hit on " : " hits ") + hit.enemy + (weapon ? " with " + weapon : "") + " for " + hit.amount + " damage" };
  }
  const missed = raw.match(/^🎯 missed (.+?) with (.+?)(?: \((.+)\))?$/u);
  if (missed) return { kind: "miss", who, enemy: missed[1], text: who + " misses " + missed[1] + " with " + missed[2] + (missed[3] === "natural 1" ? " (rolled a 1)" : "") };
  return { kind: "action", who, text: raw };
}

// One of a character's attacks with the options they've switched on: the
// to-hit roll (or the save the target makes), and the damage dice, doubled
// on a critical hit.
export function buildAttack(attack, options = [], { crit = false, extraCritDice = 0 } = {}) {
  const usable = attack.hit === undefined || attack.hit === null ? [] : options; // options are for attack rolls
  const hit = (attack.hit ?? 0) + usable.reduce((sum, option) => sum + (option.hit ?? 0), 0);
  const mode = usable.some(option => option.mode === "advantage") ? "advantage" : "normal";
  const base = attack.damage + usable.map(option => option.damage ?? "").join("");
  return {
    save: attack.save ? attack.save + " save, DC " + attack.dc + (attack.half ? ", half on a save" : ", nothing on a save") : null,
    toHit: attack.save ? null : "d20" + (hit >= 0 ? "+" : "") + hit,
    hitBonus: attack.save ? null : hit,
    mode,
    damage: crit ? critExpression(base, extraCritDice) : base
  };
}

// ── Death saves (5e): d20, 10+ succeeds; a 1 counts as two failures; a 20
// brings the character back with 1 HP. Three successes: stable. Three
// failures: dead. ──
export function deathSave(saves, natural) {
  const current = { successes: saves?.successes ?? 0, failures: saves?.failures ?? 0 };
  if (natural === 20) return { successes: 0, failures: 0, outcome: "revived" };
  const next = natural >= 10
    ? { ...current, successes: Math.min(3, current.successes + 1) }
    : { ...current, failures: Math.min(3, current.failures + (natural === 1 ? 2 : 1)) };
  return { ...next, outcome: next.failures >= 3 ? "dead" : next.successes >= 3 ? "stable" : null };
}

// ── Ability modifiers ──

// The six abilities from a sheet: score, modifier, and saving throw.
export function abilityMods(sheet) {
  const saves = Object.fromEntries((sheet?.saves ?? []).map(([ability, value, note]) => [ability, { value, proficient: Boolean(note) }]));
  return (sheet?.abilities ?? []).map(([ability, score, mod]) => {
    const save = Number.parseInt(String(saves[ability]?.value ?? "").replace("−", "-"), 10);
    return { ability, score, mod, save: Number.isFinite(save) ? save : mod, proficient: saves[ability]?.proficient ?? false };
  });
}

const signed = value => (value >= 0 ? "+" : "−") + Math.abs(value);
const proficiencyOf = sheet => Number.parseInt(Object.fromEntries(sheet?.combat ?? []).Proficiency ?? "0", 10) || 0;

// How an attack's numbers are made: "d20 + STR +4 + Prof +4 = +8" and
// "1d12 + STR +4". Options switched on are added at the end.
export function attackBreakdown(attack, sheet, options = []) {
  const mod = abilityMods(sheet).find(entry => entry.ability === attack.ability)?.mod ?? 0;
  const parts = attack.ability ? [[attack.ability, mod]] : [];
  if (attack.save) {
    return {
      hit: null,
      dc: "DC " + attack.dc + " = 8 + " + (attack.ability ?? "") + " " + signed(mod) + " + Prof " + signed(proficiencyOf(sheet)),
      damage: attack.damage + (attack.addMod === false || !attack.ability ? "" : " (includes " + attack.ability + " " + signed(mod) + ")")
    };
  }
  parts.push(["Prof", proficiencyOf(sheet)], ...(attack.bonus ?? []));
  const extraHit = options.filter(option => option.hit);
  const total = parts.reduce((sum, [, value]) => sum + value, 0) + extraHit.reduce((sum, option) => sum + option.hit, 0);
  const dice = attack.damage.match(/^\d*d\d+(?:\+\d*d\d+)*/)?.[0] ?? attack.damage;
  const flat = attack.damage.slice(dice.length);
  const damageParts = [dice];
  if (attack.addMod !== false && attack.ability) damageParts.push(attack.ability + " " + signed(mod));
  else if (flat) damageParts.push(flat.replace(/^\+/, "+"));
  for (const [name, value] of attack.damageBonus ?? []) damageParts.push(name + " " + signed(value));
  for (const option of options.filter(option => option.damage)) damageParts.push(option.name.replace(/ \(.*\)$/, "") + " " + option.damage);
  return {
    hit: "d20 + " + [...parts, ...extraHit.map(option => [option.name, option.hit])].map(([name, value]) => name + " " + signed(value)).join(" + ") + " = " + signed(total),
    dc: null,
    damage: damageParts.join(" + ")
  };
}

// ── Limited resources: spell slots and per-rest features ──
// State: { used: { "slot:3": 1, "Rage": 2, … }, raging: false }.
// Spell slots: a leveled spell uses a slot of its level or higher; cantrips
// are free; all slots come back on a long rest.

export const slotKey = level => "slot:" + level;

// Hit Dice from the sheet's combat line ("10d10"), healing d10 + Con each.
export const HIT_DICE = "Hit Dice";
export function hitDice(sheet) {
  const found = String(Object.fromEntries(sheet?.combat ?? [])[HIT_DICE] ?? "").match(/(\d+)\s*d\s*(\d+)/i);
  if (!found) return null;
  const con = abilityMods(sheet).find(entry => entry.ability === "CON")?.mod ?? 0;
  return { max: Number(found[1]), die: Number(found[2]), con, roll: "1d" + found[2] + (con ? (con > 0 ? "+" : "") + con : "") };
}

export function resourceMax(sheet, key) {
  if (key === HIT_DICE) return hitDice(sheet)?.max ?? 0;
  for (const resource of sheet?.resources ?? []) {
    if (resource.slots && key.startsWith("slot:")) return resource.slots[key.slice(5)] ?? 0;
    if (resource.name === key) return resource.max;
  }
  return 0;
}

export const resourceLeft = (sheet, state, key) => Math.max(0, resourceMax(sheet, key) - (state?.used?.[key] ?? 0));

export function spendResource(sheet, state, key, amount = 1) {
  const used = { ...(state?.used ?? {}) };
  used[key] = Math.max(0, Math.min(resourceMax(sheet, key), (used[key] ?? 0) + amount));
  return { ...state, used };
}

// A short rest refills "per short rest" features; a long rest refills
// everything (spell slots too) and gives back half your Hit Dice (at least
// one). Either ends a rage: it lasts a minute at most.
export function rest(sheet, state, kind) {
  const used = { ...(state?.used ?? {}) };
  const dice = hitDice(sheet);
  if (kind === "long" && dice && used[HIT_DICE]) {
    used[HIT_DICE] = Math.max(0, used[HIT_DICE] - Math.max(1, Math.floor(dice.max / 2)));
    if (!used[HIT_DICE]) delete used[HIT_DICE];
  }
  for (const resource of sheet?.resources ?? []) {
    if (resource.per === "never") continue; // potions, javelins: only the DM gives more
    if (kind !== "long" && resource.per !== "short") continue;
    if (resource.slots) for (const level of Object.keys(resource.slots)) delete used[slotKey(level)];
    else delete used[resource.name];
  }
  return { ...state, used, raging: false };
}

// The slot levels a spell can be cast with right now (its own level or higher, with a slot left).
export function castableLevels(attack, sheet, state) {
  if (!attack?.slot) return [];
  const slots = (sheet?.resources ?? []).find(resource => resource.slots)?.slots ?? {};
  return Object.keys(slots).map(Number).filter(level => level >= attack.slot && resourceLeft(sheet, state, slotKey(level)) > 0);
}

// Casting at a higher level: extra damage dice per level above the spell's own.
export function upcastAttack(attack, level) {
  const extra = attack?.upcast && level > attack.slot ? level - attack.slot : 0;
  if (!extra) return attack;
  const [, count, sides] = attack.upcast.match(/(\d*)d(\d+)/);
  return { ...attack, damage: attack.damage.replace(/^(\d*)d(\d+)/, (_, base, baseSides) =>
    baseSides === sides ? (Number(base || 1) + extra * Number(count || 1)) + "d" + sides : _ + "+" + extra * Number(count || 1) + "d" + sides) };
}

// The sheet abilities a character can't use right now, as "Name: why" lines:
// leveled spells with no slot of that level or higher left, and features
// whose uses are spent (resource.covers lists which abilities need them).
const ORDINALS = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", 6: "6th", 7: "7th", 8: "8th", 9: "9th" };
export function moveNames(character) {
  return String(character?.moves ?? "").split("\n")
    .filter(line => line.trim() && !/^check\s*\|/i.test(line))
    .flatMap(line => (line.includes("|") ? line.slice(line.indexOf("|") + 1) : line).split(" — ")[0].split(/,\s*/))
    .map(name => name.trim()).filter(Boolean);
}
export function spentAbilities(character, sheet, state) {
  const spent = new Map();
  const slots = (sheet?.resources ?? []).find(resource => resource.slots)?.slots;
  if (slots) {
    for (const name of moveNames(character)) {
      const rule = lookupRule(name);
      // A leveled spell, or a feature that spends a slot (Primeval Awareness: slot 1).
      const needs = rule?.section === "spells" ? rule.level : rule?.slot;
      if (!(needs > 0)) continue;
      const open = Object.keys(slots).map(Number).some(level => level >= needs && resourceLeft(sheet, state, slotKey(level)) > 0);
      if (!open) spent.set(name, name + ": no " + ORDINALS[needs] + "-level or higher spell slot left");
    }
  }
  // covers: the abilities a resource pays for; an entry can be [name, cost]
  // when one use takes more than one (Death Mark: 2 Shadow Energy).
  for (const resource of sheet?.resources ?? []) {
    if (resource.slots) continue;
    const left = resourceLeft(sheet, state, resource.name);
    const back = resource.per === "never" ? "until the DM gives more" : "until a " + (resource.per === "short" ? "short or long" : "long") + " rest";
    for (const cover of resource.covers ?? [resource.name]) {
      const [name, cost = 1] = Array.isArray(cover) ? cover : [cover];
      if (left >= cost) continue;
      spent.set(name, name + ": " + (left ? "needs " + cost + " " + resource.name + ", " + left + " left" : "no " + resource.name + " left") + " " + back);
    }
  }
  return [...spent.values()];
}

// The DM's encounter after loading the copy saved with the table. A change on
// this device that the table hasn't confirmed ("dirty", or a save still
// waiting to go) always wins; otherwise the table's copy is the newest (it may
// come from the DM's other device). Clocks are never compared: a phone's clock
// can be minutes off the server's.
// Returns "keep" (nothing to do), "push" (save this device's copy) or "cloud".
export function pickEncounter({ cloud, local, dirty, pending, savedHere }) {
  if (pending) return "keep";
  if (dirty) return "push";
  if (cloud && Array.isArray(cloud.enemies)) {
    return JSON.stringify(cloud.enemies) === JSON.stringify(local ?? []) ? "keep" : "cloud";
  }
  return savedHere ? "push" : "keep";
}

// What a rider adds to a hit, in words: "+7d6 poison (DC 15 Con save for
// half)" or "DC 11 Str save or knocked prone".
export function riderText(rider) {
  if (!rider) return "";
  const save = rider.save ? "DC " + rider.dc + " " + rider.save + " save" : "";
  if (rider.damage) return "+" + rider.damage + " " + (rider.type ?? "") + (save ? " (" + save + (rider.half ? " for half" : " or none") + ")" : "");
  return save + (rider.effect ? " or " + rider.effect : "");
}

// ── Roll requests outside combat ─────────────────────────────────────────
// The DM asks a character for a roll; it rides in the story as that
// character's line ("🎲 DM asks: Dexterity check, DC 12"), so it works on
// both backends with no new table. The player's phone answers it with one
// tap ("🎲 Dexterity check (DC 12): 17 …").
export const SKILLS = [
  ["Acrobatics", "DEX"], ["Animal Handling", "WIS"], ["Arcana", "INT"], ["Athletics", "STR"], ["Deception", "CHA"],
  ["History", "INT"], ["Insight", "WIS"], ["Intimidation", "CHA"], ["Investigation", "INT"], ["Medicine", "WIS"],
  ["Nature", "INT"], ["Perception", "WIS"], ["Performance", "CHA"], ["Persuasion", "CHA"], ["Religion", "INT"],
  ["Sleight of Hand", "DEX"], ["Stealth", "DEX"], ["Survival", "WIS"]
];
export const ABILITY_FULL = { STR: "Strength", DEX: "Dexterity", CON: "Constitution", INT: "Intelligence", WIS: "Wisdom", CHA: "Charisma" };
const ASK = /^🎲 DM asks: (.+?)(?:, (DC|AC) (\d+))?(?: — (.+))?$/u;

// roll: a skill name, "Dexterity check", "Wisdom save", or "Attack roll".
export function rollAskText(roll, target = null, note = "") {
  const goal = target?.value ? ", " + (target.kind === "AC" ? "AC" : "DC") + " " + Number(target.value) : "";
  return "🎲 DM asks: " + roll + goal + (note ? " — " + String(note).trim() : "");
}
// Reads the DM tool's wording ("Strength save", "Dexterity check", "Insight")
// and the ways a DM types it by hand: "Strength saving throw", "Str save",
// "Wisdom (Insight) check", "Insight check", so the phone fills in the bonus.
const abilityNamed = word => Object.entries(ABILITY_FULL)
  .find(([short, full]) => full.toLowerCase() === word.toLowerCase() || short.toLowerCase() === word.toLowerCase())?.[0] ?? null;
const skillNamed = name => SKILLS.find(([skill]) => skill.toLowerCase() === String(name).trim().toLowerCase()) ?? null;
export function parseRollAsk(text) {
  const match = String(text ?? "").match(ASK);
  if (!match) return null;
  const roll = match[1].trim();
  const target = match[2] ? { kind: match[2], value: Number(match[3]) } : null;
  const note = match[4] ?? "";
  if (/^attack roll$/i.test(roll)) return { roll, kind: "attack", ability: null, target, note };
  const save = roll.match(/^(\w+) sav(?:e|ing throw)$/i);
  if (save && abilityNamed(save[1])) return { roll, kind: "save", ability: abilityNamed(save[1]), target, note };
  // "Wisdom (Insight) check", "Insight check", "Sleight of Hand check", or just "Insight".
  const paren = roll.match(/^\w+ \(([^)]+)\)(?: check)?$/i);
  const skill = skillNamed(paren?.[1] ?? roll.replace(/ check$/i, ""));
  if (skill) return { roll, kind: "skill", skill: skill[0], ability: skill[1], target, note };
  const check = roll.match(/^(\w+)(?: check)?$/i);
  if (check && abilityNamed(check[1])) return { roll, kind: "check", ability: abilityNamed(check[1]), target, note };
  return { roll, kind: "skill", ability: null, target, note };
}
// The roll's label on the answer line, and whether it beat the DC or AC.
export const rollAskLabel = ask => ask.roll + (ask.target ? " (" + ask.target.kind + " " + ask.target.value + ")" : "");
export function rollAskVerdict(ask, total) {
  if (!ask?.target) return "";
  return total >= ask.target.value ? " · ✓ meets " + ask.target.kind + " " + ask.target.value : " · ✗ under " + ask.target.kind + " " + ask.target.value;
}
// A character's bonus for an ask, from the full sheet: a skill, a check
// (ability modifier), or a save. null when the sheet doesn't say.
export function rollAskBonus(ask, sheet) {
  if (!ask || !sheet) return null;
  const mods = abilityMods(sheet);
  if (ask.kind === "save") return mods.find(entry => entry.ability === ask.ability)?.save ?? null;
  if (ask.kind === "check") return mods.find(entry => entry.ability === ask.ability)?.mod ?? null;
  if (ask.kind === "skill") {
    const skill = (sheet.skills ?? []).find(([name]) => name.toLowerCase() === (ask.skill ?? ask.roll).toLowerCase());
    const bonus = skill ? Number.parseInt(String(skill[2]).replace("−", "-"), 10) : NaN;
    if (Number.isFinite(bonus)) return bonus;
    return ask.ability ? mods.find(entry => entry.ability === ask.ability)?.mod ?? null : null;
  }
  return null;
}

// ── TV board ─────────────────────────────────────────────────────────────
// The DM's post in screen-sized passages, read like captions: paragraphs,
// with a long one split at sentence ends so no passage runs off the screen.
export function scenePassages(text, max = 320) {
  const passages = [];
  for (const paragraph of String(text ?? "").split(/\n\s*\n|\n/).map(part => part.trim()).filter(Boolean)) {
    if (paragraph.length <= max) { passages.push(paragraph); continue; }
    let current = "";
    const sentences = (paragraph.match(/[^.!?]+[.!?]+["”’)]*\s*|[^.!?]+$/g) ?? [paragraph])
      // A sentence longer than a passage breaks between words.
      .flatMap(sentence => sentence.length <= max ? [sentence] : sentence.match(new RegExp(".{1," + max + "}(\\s|$)", "g")) ?? [sentence]);
    for (const sentence of sentences) {
      if (current && (current + sentence).length > max) { passages.push(current.trim()); current = ""; }
      current += sentence;
    }
    if (current.trim()) passages.push(current.trim());
  }
  return passages.length ? passages : [""];
}
// One story line as a moment on the board: what a spectator wants to see
// ("Roan · Dexterity check · 24 ✓"), not the bookkeeping behind it.
export function boardMoment(name, text) {
  const who = String(name ?? "").replace(/^The /, "");
  const raw = String(text ?? "");
  const ask = raw.match(/^🎲 DM asks: (.+?)(?:, (DC|AC) (\d+))?(?: — (.+))?$/u);
  if (ask) return { kind: "ask", who, text: ask[1] + (ask[2] ? " · " + ask[2] + " " + ask[3] : ""), note: ask[4] ?? "" };
  const roll = raw.match(/^🎲 (.+?): (\d+) \((.*?)\)(?: · (✓|✗) (?:meets|under) (DC|AC) (\d+))?$/u);
  if (roll) {
    const label = roll[1].replace(/ \((?:DC|AC) \d+\)/, "").replace(/ \(d\d+[^)]*\)$/, "").replace(/^Attack roll · /, "");
    return { kind: "roll", who, text: label, total: Number(roll[2]), natural: /d20: 20\b/.test(roll[3]) ? 20 : /d20: 1\b/.test(roll[3]) ? 1 : null,
      verdict: roll[4] === "✓" ? "success" : roll[4] === "✗" ? "fail" : null };
  }
  const heal = raw.match(/^💚 (?:regains (\d+) HP|heals (.+?) for (\d+) HP) \((.+)\)$/u);
  if (heal) return { kind: "heal", who, text: heal[1] ? "regains " + heal[1] + " HP" : "heals " + heal[2].replace(/^The /, "") + " for " + heal[3] + " HP", note: heal[4] };
  if (/^(😤|✨|⚡|🧠|🥵|is |has |🛌|💤)/u.test(raw) || /^is no longer /.test(raw)) return { kind: "status", who, text: raw.replace(/\s*[\p{Extended_Pictographic}\u{FE0F}]+\s*$/u, "") };
  return chronicleLine(name, text);
}
