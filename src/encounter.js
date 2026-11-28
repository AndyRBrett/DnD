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
  { name: "Guard", cr: "1/8", ac: 16, hp: "2d8+2", init: 1, speed: 30, saves: [1, 1, 1, 0, 0, 0], attacks: [["Spear", 3, "1d6+1"]],
    abilities: "Chain shirt and shield. Spear can be thrown (20/60 ft)." },
  { name: "Bandit", cr: "1/8", ac: 12, hp: "2d8+2", init: 1, speed: 30, saves: [0, 1, 1, 0, 0, 0], attacks: [["Scimitar", 3, "1d6+1"], ["Light crossbow", 3, "1d8+1"]],
    abilities: "Crossbow range 80/320 ft." },
  { name: "Thug", cr: "1/2", ac: 11, hp: "5d8+10", init: 0, speed: 30, saves: [2, 0, 2, 0, 0, 0], attacks: [["Mace (×2)", 4, "1d6+2"], ["Heavy crossbow", 2, "1d10"]],
    abilities: "Multiattack: two mace attacks. Pack Tactics: advantage when an ally is within 5 ft of the target." },
  { name: "Bandit Captain", routine: [0, 1], cr: "2", ac: 15, hp: "10d8+20", init: 3, speed: 30, saves: [4, 5, 2, 2, 2, 2], attacks: [["Scimitar (×2)", 5, "1d6+3"], ["Dagger", 5, "1d4+3"]],
    abilities: "Multiattack: two scimitars and a dagger. Parry (reaction): +2 AC against one melee hit it can see." },
  { name: "Spy", cr: "1", ac: 12, hp: "6d8", init: 2, speed: 30, saves: [0, 2, 0, 1, 2, 3], attacks: [["Shortsword (×2)", 4, "1d6+2"], ["Hand crossbow", 4, "1d6+2"]],
    abilities: "Cunning Action: Dash, Disengage, or Hide as a bonus action. Sneak Attack +2d6 once per turn with advantage or an ally adjacent." },
  { name: "Veteran", cr: "3", ac: 17, hp: "9d8+18", init: 1, speed: 30, saves: [3, 1, 2, 0, 0, 0], attacks: [["Longsword (×2)", 5, "1d8+3"], ["Heavy crossbow", 3, "1d10+1"]],
    abilities: "Multiattack: two longsword attacks (plus a shortsword if drawn)." },
  { name: "Mage", cr: "6", ac: 12, hp: "9d8", init: 2, speed: 30, saves: [-1, 2, 0, 6, 4, 0], attacks: [["Dagger", 5, "1d4+2"], ["Fire Bolt (spell)", 6, "2d10"]],
    abilities: "Spell DC 14, +6. Mage Armor (AC 15). Spells: Misty Step, Counterspell, Fireball (8d6, Dex save), Ice Storm, Greater Invisibility, Cone of Cold (8d8, Con save)." },
  { name: "Goblin", cr: "1/4", ac: 15, hp: "2d6", init: 2, speed: 30, saves: [-1, 2, 0, 0, -1, -1], attacks: [["Scimitar", 4, "1d6+2"], ["Shortbow", 4, "1d6+2"]],
    abilities: "Nimble Escape: Disengage or Hide as a bonus action." },
  { name: "Wolf", cr: "1/4", ac: 13, hp: "2d8+2", init: 2, speed: 40, saves: [1, 2, 1, -4, 1, -2], attacks: [["Bite", 4, "2d4+2", { save: "Str", dc: 11, effect: "knocked prone" }]],
    abilities: "Bite: DC 11 Strength save or knocked prone. Pack Tactics. Keen Hearing and Smell." },
  { name: "Ogre", cr: "2", ac: 11, hp: "7d10+21", init: -1, speed: 40, saves: [4, -1, 3, -3, -2, -2], attacks: [["Greatclub", 6, "2d8+4"], ["Javelin", 6, "2d6+4"]],
    abilities: "Large. Javelin range 30/120 ft." },
  // Tougher foes for a level 10 party (challenge 5 to 8).
  { name: "Gladiator", cr: "5", ac: 16, hp: "15d8+45", init: 2, speed: 30, saves: [7, 5, 6, 0, 1, 2], attacks: [["Spear (×3)", 7, "2d6+4"], ["Shield Bash", 7, "2d4+4", { save: "Str", dc: 15, effect: "knocked prone" }]],
    abilities: "Multiattack: three melee attacks (or two ranged spear throws, 20/60 ft). Shield Bash: DC 15 Strength save or knocked prone. Parry (reaction): +3 AC against one melee hit it can see." },
  { name: "Troll", routine: [0, 1], cr: "5", ac: 15, hp: "8d10+40", init: 1, speed: 30, saves: [4, 1, 5, -2, -1, -2], attacks: [["Claw (×2)", 7, "2d6+4"], ["Bite", 7, "1d6+4"]],
    abilities: "Large. Multiattack: a bite and two claws. Regeneration: regains 10 HP at the start of its turn unless it took acid or fire damage since its last turn; it only dies at 0 HP if it doesn't regenerate. Keen Smell." },
  { name: "Hill Giant", cr: "5", ac: 13, hp: "10d12+40", init: -1, speed: 40, saves: [5, -1, 4, -3, -1, -2], attacks: [["Greatclub (×2)", 8, "3d8+5"], ["Rock", 8, "3d10+5"]],
    abilities: "Huge. Multiattack: two greatclub attacks. Rock range 60/240 ft." },
  { name: "Wraith", cr: "5", ac: 13, hp: "9d8+27", init: 3, speed: 60, saves: [-2, 3, 3, 1, 2, 2], attacks: [["Life Drain", 6, "4d8+3", { save: "Con", dc: 14, effect: "max HP drops by the damage until a long rest" }]],
    abilities: "Flies (60 ft) and moves through creatures and objects. Life Drain is necrotic: DC 14 Constitution save or the target's max HP drops by the damage until a long rest. Resists most nonmagical weapon damage; immune to necrotic and poison. Sunlight: disadvantage on attacks and Perception." },
  { name: "Oni", cr: "7", ac: 16, hp: "13d10+39", init: 0, speed: 30, saves: [4, 3, 6, 2, 4, 5], attacks: [["Glaive (×2)", 7, "2d10+4"]],
    abilities: "Large; flies 30 ft. Multiattack: two glaive attacks. Regenerates 10 HP a turn while above 0 HP. Innate spells (DC 13): darkness, invisibility, charm person, cone of cold (8d8, Con save), gaseous form, sleep. Can change shape." },
  { name: "Stone Giant", cr: "7", ac: 17, hp: "11d12+55", init: 2, speed: 40, saves: [6, 5, 8, 0, 4, -1], attacks: [["Greatclub (×2)", 9, "3d8+6"], ["Rock", 9, "4d10+6", { save: "Str", dc: 17, effect: "knocked prone" }]],
    abilities: "Huge. Multiattack: two greatclub attacks. Rock (60/240 ft): DC 17 Strength save or knocked prone. Rock Catching (reaction): DC 10 Dex save to catch a thrown rock." },
  { name: "Assassin", cr: "8", ac: 15, hp: "12d8+24", init: 3, speed: 30, saves: [0, 6, 2, 4, 0, 0], attacks: [["Shortsword (×2)", 6, "1d6+3", ASSASSIN_POISON], ["Light crossbow", 6, "1d8+3", ASSASSIN_POISON]],
    abilities: "Multiattack: two shortsword attacks. Each hit also deals 7d6 poison (DC 15 Constitution save for half). Sneak Attack +4d6 once a turn. Assassinate: advantage against anyone who hasn't acted yet, and any hit on a surprised creature is a critical. Evasion." },
  { name: "Young Green Dragon", routine: [0, 1], cr: "8", ac: 18, hp: "16d10+48", init: 1, speed: 40, saves: [4, 4, 6, 3, 4, 5], attacks: [["Claw (×2)", 7, "2d6+4"], ["Bite", 7, "2d10+4", { damage: "2d6", type: "poison" }]],
    abilities: "Large; flies 80 ft, swims 40 ft. Multiattack: a bite and two claws; the bite adds 2d6 poison. Poison Breath (recharge 5–6): 30-ft cone, DC 14 Constitution save, 12d6 poison, half on a save. Amphibious. Immune to poison." },
  // More standard foes, so the DM can pick one and add a group in one tap.
  { name: "Skeleton", cr: "1/4", ac: 13, hp: "2d8+4", init: 2, speed: 30, saves: [0, 2, 2, -2, -1, -3], attacks: [["Shortsword", 4, "1d6+2"], ["Shortbow", 4, "1d6+2"]],
    abilities: "Undead. Vulnerable to bludgeoning; immune to poison. Shortbow range 80/320 ft." },
  { name: "Zombie", cr: "1/4", ac: 8, hp: "3d8+9", init: -2, speed: 20, saves: [1, -2, 3, -4, 0, -3], attacks: [["Slam", 3, "1d6+1"]],
    abilities: "Undead Fortitude: dropped to 0 by anything but radiant damage or a critical hit, it makes a Con save (DC 5 + the damage) and stays at 1 HP on a success. Immune to poison." },
  { name: "Orc", cr: "1/2", ac: 13, hp: "2d8+6", init: 1, speed: 30, saves: [3, 1, 3, -2, 0, 0], attacks: [["Greataxe", 5, "1d12+3"], ["Javelin", 5, "1d6+3"]],
    abilities: "Aggressive: bonus action to move up to its speed toward an enemy it can see. Javelin range 30/120 ft." },
  { name: "Hobgoblin", cr: "1/2", ac: 18, hp: "2d8+2", init: 1, speed: 30, saves: [1, 1, 1, 0, 0, -1], attacks: [["Longsword", 3, "1d8+1"], ["Longbow", 3, "1d8+1"]],
    abilities: "Martial Advantage: once a turn, +2d6 damage to a creature that's within 5 ft of one of its allies. Longbow range 150/600 ft." },
  { name: "Ghoul", cr: "1", ac: 12, hp: "5d8", init: 2, speed: 30, saves: [1, 2, 0, -2, 0, -2], attacks: [["Claws", 4, "2d4+2", { save: "Con", dc: 10, effect: "paralyzed for 1 minute (repeat the save at the end of each turn); elves are immune" }], ["Bite", 2, "2d6+2"]],
    abilities: "Undead. Claws: DC 10 Constitution save or paralyzed. Immune to poison and to being charmed." },
  { name: "Bugbear", cr: "1", ac: 16, hp: "5d8+5", init: 2, speed: 30, saves: [2, 2, 1, -1, 0, -1], attacks: [["Morningstar", 4, "2d8+2"], ["Javelin", 4, "1d6+2"]],
    abilities: "Surprise Attack: +2d6 damage to a surprised creature on the first round. Long-limbed: melee reach counts as 5 ft more on its turn. Sneaky (Stealth +6)." },
  { name: "Dire Wolf", cr: "1", ac: 14, hp: "5d10+10", init: 2, speed: 50, saves: [3, 2, 2, -4, 1, -2], attacks: [["Bite", 5, "2d6+3", { save: "Str", dc: 13, effect: "knocked prone" }]],
    abilities: "Large. Bite: DC 13 Strength save or knocked prone. Pack Tactics. Keen Hearing and Smell." },
  { name: "Berserker", cr: "2", ac: 13, hp: "9d8+27", init: 1, speed: 30, saves: [3, 1, 3, -1, 0, -1], attacks: [["Greataxe", 5, "1d12+3"]],
    abilities: "Reckless: at the start of its turn it can attack with advantage, but attacks against it have advantage until its next turn." },
  { name: "Priest", cr: "2", ac: 13, hp: "5d8+5", init: 0, speed: 30, saves: [0, 0, 1, 1, 3, 1], attacks: [["Mace", 2, "1d6"], ["Guiding Bolt (spell)", 5, "4d6"]],
    abilities: "Spell DC 13, +5. Sacred Flame (2d8 radiant, Dex save), Spirit Guardians (3d8 radiant, Wis save for half, 15-ft aura), Cure Wounds, Lesser Restoration. Divine Eminence: +3d6 radiant on a melee hit by spending a slot." },
  { name: "Cult Fanatic", cr: "2", ac: 13, hp: "6d8+6", init: 2, speed: 30, saves: [0, 2, 1, 0, 1, 2], attacks: [["Dagger (×2)", 4, "1d4+2"], ["Inflict Wounds (spell)", 3, "3d10"]],
    abilities: "Multiattack: two dagger attacks. Spell DC 11, +3: Hold Person, Spiritual Weapon (1d8+1 force), Shield of Faith, Command. Dark Devotion: advantage on saves against being charmed or frightened." },
  { name: "Knight", cr: "3", ac: 18, hp: "8d8+16", init: 0, speed: 30, saves: [3, 0, 4, 0, 2, 2], attacks: [["Greatsword (×2)", 5, "2d6+3"], ["Heavy crossbow", 2, "1d10"]],
    abilities: "Multiattack: two greatsword attacks. Brave: advantage on saves against being frightened. Parry (reaction): +2 AC against one melee hit it can see. Leadership (1/rest): allies within 30 ft add 1d4 to attacks and saves for 1 minute." },
  { name: "Minotaur", routine: [0, 1], cr: "3", ac: 14, hp: "9d10+27", init: 0, speed: 40, saves: [4, 0, 3, -2, 3, -1], attacks: [["Greataxe", 6, "2d12+4"], ["Gore", 6, "2d8+4"]],
    abilities: "Large. Charge: moving 10 ft straight before a gore adds 2d8 piercing, and the target makes a DC 14 Strength save or is pushed 10 ft and knocked prone. Reckless. Labyrinthine Recall." },
  { name: "Owlbear", routine: [0, 1], cr: "3", ac: 13, hp: "7d10+21", init: 1, speed: 40, saves: [5, 1, 3, -4, 1, -2], attacks: [["Claws", 7, "2d8+5"], ["Beak", 7, "1d10+5"]],
    abilities: "Large. Multiattack: a beak and a claws attack. Keen Sight and Smell." },
  { name: "Werewolf", routine: [0, 1], cr: "3", ac: 12, hp: "9d8+18", init: 1, speed: 40, saves: [2, 1, 2, 0, 0, 0], attacks: [["Claws", 4, "2d4+2"], ["Bite", 4, "1d8+2", { save: "Con", dc: 12, effect: "cursed with werewolf lycanthropy" }]],
    abilities: "Hybrid form: Multiattack, a bite and a claws attack. Immune to bludgeoning, piercing and slashing from nonmagical, non-silvered weapons. Keen Hearing and Smell." },
  { name: "Wight", cr: "3", ac: 14, hp: "6d8+18", init: 2, speed: 30, saves: [2, 2, 3, 0, 1, 2], attacks: [["Longsword (×2)", 4, "1d8+2"], ["Life Drain", 4, "1d6+2", { save: "Con", dc: 13, effect: "max HP drops by the damage until a long rest" }]],
    abilities: "Undead. Multiattack: two longsword attacks, or one plus Life Drain (necrotic). Resists nonmagical weapon damage and necrotic; immune to poison. Sunlight Sensitivity." },
  { name: "Mummy", cr: "3", ac: 11, hp: "9d8+27", init: -1, speed: 20, saves: [3, -1, 2, -2, 2, 1], attacks: [["Rotting Fist", 5, "2d6+3", { damage: "3d6", type: "necrotic", save: "Con", dc: 12, effect: "cursed with mummy rot (no healing; max HP drops 3d6 every 24 hours)" }]],
    abilities: "Undead. Multiattack: Dreadful Glare (DC 11 Wis save or frightened; fail by 5+ and paralyzed) and one Rotting Fist. Vulnerable to fire; resists nonmagical weapon damage; immune to necrotic and poison." },
  { name: "Hell Hound", cr: "3", ac: 15, hp: "7d8+14", init: 1, speed: 50, saves: [3, 1, 2, -2, 1, -2], attacks: [["Bite", 5, "1d8+3", { damage: "2d6", type: "fire" }]],
    abilities: "Fire Breath (recharge 5–6): 15-ft cone, DC 12 Dexterity save, 6d6 fire, half on a save. Pack Tactics. Immune to fire." },
  { name: "Vampire Spawn", routine: [0, 1], cr: "5", ac: 15, hp: "11d8+33", init: 3, speed: 30, saves: [3, 6, 3, 0, 3, 1], attacks: [["Claws", 6, "2d4+3"], ["Bite", 6, "1d6+3", { damage: "3d6", type: "necrotic" }]],
    abilities: "Undead. Multiattack: two attacks, only one a bite (the bite needs a grappled, willing or incapacitated target; its necrotic lowers max HP). Regenerates 10 HP a turn unless hit by radiant or in sunlight. Spider Climb. Resists necrotic and nonmagical weapons." },
  { name: "Earth Elemental", cr: "5", ac: 17, hp: "12d10+60", init: -1, speed: 30, saves: [5, -1, 5, -3, 0, -3], attacks: [["Slam (×2)", 8, "2d8+5"]],
    abilities: "Large. Multiattack: two slams. Earth Glide: burrows through earth and stone. Siege Monster. Vulnerable to thunder; resists nonmagical weapon damage; immune to poison." },
  { name: "Fire Elemental", cr: "5", ac: 13, hp: "12d10+36", init: 3, speed: 50, saves: [0, 3, 3, -2, 0, -2], attacks: [["Touch (×2)", 6, "2d6+3"]],
    abilities: "Large. Multiattack: two touches (fire). A creature or flammable object it touches ignites: 1d10 fire at the start of each turn until doused. Fire Form: touching or hitting it in melee deals 1d10 fire. Immune to fire and poison; resists nonmagical weapons." },
  { name: "Flesh Golem", cr: "5", ac: 9, hp: "11d8+44", init: -1, speed: 30, saves: [4, -1, 4, -3, 0, -3], attacks: [["Slam (×2)", 7, "2d8+4"]],
    abilities: "Multiattack: two slams. Berserk below 40 HP (recharge each turn on a 6). Fire makes it flinch (disadvantage until its next turn); lightning heals it. Magic Resistance. Immune to lightning, poison and nonmagical non-adamantine weapons." },
  { name: "Chimera", routine: [0, 1, 2], cr: "6", ac: 14, hp: "12d10+48", init: 0, speed: 30, saves: [4, 0, 4, -4, 2, 0], attacks: [["Bite", 7, "2d6+4"], ["Horns", 7, "1d12+4"], ["Claws", 7, "2d6+4"]],
    abilities: "Large; flies 60 ft. Multiattack: bite, horns and claws. Fire Breath (recharge 5–6): 15-ft cone, DC 15 Dexterity save, 7d8 fire, half on a save." },
  { name: "Cyclops", cr: "6", ac: 14, hp: "12d12+60", init: 0, speed: 30, saves: [6, 0, 5, -1, 0, 0], attacks: [["Greatclub (×2)", 9, "3d8+6"], ["Rock", 9, "4d10+6"]],
    abilities: "Huge. Multiattack: two greatclub attacks. Poor Depth Perception: disadvantage on attacks against targets more than 30 ft away. Rock range 30/120 ft." },
  { name: "Frost Giant", cr: "8", ac: 15, hp: "12d12+60", init: -1, speed: 40, saves: [6, -1, 8, -1, 3, 4], attacks: [["Greataxe (×2)", 9, "3d12+6"], ["Rock", 9, "4d10+6"]],
    abilities: "Huge. Multiattack: two greataxe attacks. Rock range 60/240 ft. Immune to cold." },
  { name: "Hydra", cr: "8", ac: 15, hp: "15d12+75", init: 1, speed: 30, saves: [5, 1, 5, -4, 0, -1], attacks: [["Bite (×5)", 8, "1d10+5"]],
    abilities: "Huge; swims 30 ft. Five heads, one bite each. 25+ damage in one turn severs a head; at the end of its turn two grow back for each lost unless it took fire damage, and it heals 10 per head regrown. Dies with no heads. Extra reaction per head beyond one." },
  { name: "Fire Giant", cr: "9", ac: 18, hp: "13d12+78", init: -1, speed: 30, saves: [7, 3, 10, 0, 2, 5], attacks: [["Greatsword (×2)", 11, "6d6+7"], ["Rock", 11, "4d10+7"]],
    abilities: "Huge. Multiattack: two greatsword attacks. Rock range 60/240 ft. Immune to fire." },
  { name: "Young Red Dragon", routine: [0, 1], cr: "10", ac: 18, hp: "17d10+85", init: 0, speed: 40, saves: [6, 4, 9, 1, 4, 8], attacks: [["Claw (×2)", 10, "2d6+6"], ["Bite", 10, "2d10+6", { damage: "1d6", type: "fire" }]],
    abilities: "Large; flies 80 ft. Multiattack: a bite and two claws. Fire Breath (recharge 5–6): 30-ft cone, DC 17 Dexterity save, 16d6 fire, half on a save. Immune to fire. Blindsight 30 ft." },
  { name: "Stone Golem", cr: "10", ac: 17, hp: "17d10+85", init: -1, speed: 30, saves: [6, -1, 5, -4, 0, -5], attacks: [["Slam (×2)", 10, "3d8+6"]],
    abilities: "Large. Multiattack: two slams. Slow (recharge 5–6): DC 17 Wisdom save or slowed for 1 minute. Magic Resistance. Immune to poison, psychic and nonmagical non-adamantine weapons." },
  { name: "Vampire", cr: "13", ac: 16, hp: "17d8+68", init: 4, speed: 30, saves: [4, 9, 4, 3, 7, 9], attacks: [["Unarmed Strike (×2)", 9, "1d8+4"], ["Bite", 9, "1d6+4", { damage: "3d6", type: "necrotic" }]],
    abilities: "Boss. Multiattack: two attacks, only one a bite (lowers max HP; the target needs to be grappled, willing or incapacitated). Charm: DC 17 Wis save. Regenerates 20 HP a turn unless hit by radiant or in sunlight. Legendary Resistance 3/day; 3 legendary actions (move, unarmed strike, bite). Resists necrotic and nonmagical weapons." }
];

// How tough a stock enemy is for the party: from its challenge rating
// against the party's level (one of four groups in the quick-add list).
export function crValue(cr) {
  const [top, bottom] = String(cr ?? "").split("/").map(Number);
  return bottom ? top / bottom : Number.isFinite(top) ? top : null;
}
export const TIERS = ["Minions", "Soldiers", "Elites", "Bosses"];
export function enemyTier(template, partyLevel = 10) {
  const cr = crValue(template?.cr);
  if (cr === null) return null;
  const share = cr / Math.max(1, partyLevel);
  return share <= 0.1 ? "Minions" : share <= 0.35 ? "Soldiers" : share <= 0.75 ? "Elites" : "Bosses";
}

// One enemy turn: which attacks it makes, each as many times as its "(×2)"
// says. A stat block's routine names them (a dragon's claws and bite);
// otherwise it's the first attack. Returns [[attack, times], …].
export function swingCount(label) {
  return Number(String(label).match(/\([×x](\d)\)/i)?.[1] ?? 1);
}
export function enemyRoutine(enemy) {
  const attacks = enemy?.attacks ?? [];
  const picks = (Array.isArray(enemy?.routine) && enemy.routine.length ? enemy.routine : [0]).filter(index => attacks[index]);
  return [...new Set(picks)].map(index => [attacks[index], swingCount(attacks[index][0])]);
}

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
      ...(Array.isArray(stats.routine) ? { routine: stats.routine.filter(Number.isInteger) } : {}),
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
// A group request's results: for each character asked (with this exact
// line), their first answer after it, its total and whether it beat the DC.
// actions: the story's player lines ({ id, character, text }), oldest first.
// request (optional): { after, who } for one request: only ask lines after
// that story id, for those characters, count, so an identical earlier request
// (or another group) doesn't mix in. An attack roll's answer names the weapon
// ("🎲 Attack roll (AC 15) · Greataxe: 18").
export function rollAskResults(actions, askText, request = null) {
  const ask = parseRollAsk(askText);
  if (!ask) return [];
  const head = "🎲 " + rollAskLabel(ask);
  const after = Number(request?.after ?? -Infinity);
  const who = Array.isArray(request?.who) ? new Set(request.who.map(Number)) : null;
  const results = new Map();
  for (const action of actions ?? []) {
    const text = String(action.text ?? "");
    if (text === askText) {
      if (Number(action.id) > after && (!who || who.has(Number(action.character)))) results.set(action.character, { character: action.character, answered: false });
      continue;
    }
    const entry = results.get(action.character);
    if (!entry || entry.answered || !text.startsWith(head)) continue;
    const rest = text.slice(head.length);
    if (!rest.startsWith(":") && !rest.startsWith(" · ")) continue; // another roll that starts the same way
    const total = Number(rest.slice(rest.indexOf(":") + 1).match(/-?\d+/)?.[0]);
    Object.assign(entry, { answered: true, total: Number.isFinite(total) ? total : null,
      pass: /✓ meets/u.test(text) ? true : /✗ under/u.test(text) ? false : null });
  }
  return [...results.values()];
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

// ── Split-party scenes ───────────────────────────────────────────────────
// A DM update for part of the party starts with "🔒 To: The White Wizard"
// (names comma-separated) on its own line. It needs no new storage, reads
// plainly in the campaign history and to Claude, and each phone shows the
// newest update meant for its character (or for everyone) as its scene.
export const AUDIENCE_PREFIX = "🔒 To: ";
const plainName = name => String(name ?? "").trim().toLowerCase().replace(/^the\s+/, "");
export function sceneAudience(text) {
  const value = String(text ?? "");
  if (!value.startsWith(AUDIENCE_PREFIX)) return null;
  const end = value.indexOf("\n");
  const names = value.slice(AUDIENCE_PREFIX.length, end < 0 ? undefined : end).split(",").map(name => name.trim()).filter(Boolean);
  return names.length ? { names, body: end < 0 ? "" : value.slice(end + 1).trim() } : null;
}
export function addressScene(text, names) {
  const body = String(sceneAudience(text)?.body ?? text).trim();
  return names?.length ? AUDIENCE_PREFIX + names.join(", ") + "\n" + body : body;
}
export const sceneIsFor = (scene, name) => {
  const audience = sceneAudience(scene?.text);
  return !audience || audience.names.some(entry => plainName(entry) === plainName(name));
};
// The newest scene this character should see; null if none yet.
export function sceneFor(scenes, name) {
  for (let index = (scenes ?? []).length - 1; index >= 0; index--) if (sceneIsFor(scenes[index], name)) return scenes[index];
  return null;
}

// ── Speech fixes: names the browser's speech-to-text keeps mishearing ──
// Applied on the DM's phone to each update before it's posted. Whole words
// or phrases only, any case, longest first, in one pass (so "white maze"
// becomes "White Wizard", not "white mage"); "maze's" becomes "mage's".
export const DEFAULT_CORRECTIONS = [
  ["white maze", "White Wizard"],
  ["white may", "White Wizard"],
  ["dumb dumb", "Dum Dum"],
  ["dumdum", "Dum Dum"],
  ["jay peso", "JPeso"],
  ["j peso", "JPeso"],
  ["terrace", "Arcturus"],
  ["maze", "mage"]
];
// "heard → meant" lines (→, ->, or =), one per line, as the DM edits them.
export function parseCorrections(text) {
  return String(text ?? "").split("\n").map(line => line.split(/\s*(?:→|->|=)\s*/))
    .filter(parts => parts.length === 2 && parts[0].trim() && parts[1].trim())
    .map(([heard, meant]) => [heard.trim(), meant.trim()]);
}
export const formatCorrections = list => list.map(([heard, meant]) => heard + " → " + meant).join("\n");
export function correctTranscript(text, corrections = DEFAULT_CORRECTIONS) {
  const pairs = corrections.filter(([heard, meant]) => String(heard).trim() && String(meant).trim())
    .map(([heard, meant]) => [String(heard).trim().toLowerCase().replace(/\s+/g, " "), String(meant).trim()])
    .sort((a, b) => b[0].length - a[0].length);
  if (!pairs.length) return String(text ?? "");
  const meant = new Map(pairs);
  const escape = phrase => phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  const pattern = new RegExp("(?<![\\p{L}\\p{N}'])(?:" + pairs.map(([heard]) => escape(heard)).join("|") + ")(?![\\p{L}\\p{N}])", "giu");
  return String(text ?? "").replace(pattern, match => meant.get(match.toLowerCase().replace(/\s+/g, " ")) ?? match);
}

// Claude's text for the table, tidied: a missing space after a sentence
// ("door.Practice") is put back, and a runaway tail of one- or two-word
// sentences ("Go.Enjoy.End.Done.Fine.Okay.") is cut off.
export function tidyModelText(text) {
  const spaced = String(text ?? "").replace(/([a-z\)\]])\.(?=[A-Z])/g, "$1. ").trim();
  const sentences = spaced.match(/[^.!?]+[.!?]+["”']?\s*|[^.!?]+$/g) ?? [];
  const short = sentence => sentence.trim().split(/\s+/).length <= 2;
  for (let start = 0; start < sentences.length; start++) {
    let run = 0;
    while (start + run < sentences.length && short(sentences[start + run])) run += 1;
    if (run >= 4) return sentences.slice(0, start).join("").trim();
    start += run;
  }
  return spaced;
}

// AI DM autopilot pace (out of a fight). Quick is the default: the DM
// answers as soon as the rolls it asked for are in, or once a few posts have
// come in, after a short beat. Patient waits for everyone at the table.
export const AI_DM_PACES = {
  quick: { others: 30000, beat: 3000, rollWait: 120000, posts: 3, rollsFirst: true },
  normal: { others: 60000, beat: 6000, rollWait: 180000, posts: 4, rollsFirst: true },
  patient: { others: 90000, beat: 12000, rollWait: 180000, posts: Infinity, rollsFirst: false }
};
// What the autopilot does now. owed: rolls still owed, each { who, label, age }
// (ms since it was asked); fresh: new posts since the last DM turn, each
// { name, roll, age } (roll: it answers a roll request); asked: who the last
// DM turn asked to roll; present: who's at the table.
// Returns { go: true, why } or { go: false, wait } (a line for the card).
export function aiDmReady({ fresh = [], owed = [], asked = [], present = [], pace = "quick" }) {
  const p = AI_DM_PACES[pace] ?? AI_DM_PACES.quick;
  const short = name => String(name).replace(/^The /, "");
  if (!fresh.length) {
    return { go: false, wait: owed.length ? "waiting for " + owed.map(o => short(o.who) + "'s " + o.label).join(", ") + "." : "waiting for the players to act." };
  }
  const holding = owed.filter(o => o.age < p.rollWait);
  if (holding.length) return { go: false, wait: "waiting for " + holding.map(o => short(o.who) + "'s " + o.label).join(", ") + "." };
  const newest = Math.min(...fresh.map(post => post.age));
  const oldest = Math.max(...fresh.map(post => post.age));
  const settle = why => newest >= p.beat ? { go: true, why } : { go: false, wait: why.replace(/:.*/, "") + ": answering in a moment." };
  // The rolls it asked for are all in: answer them now.
  const rolled = new Set(fresh.filter(post => post.roll).map(post => post.name));
  if (p.rollsFirst && asked.length && asked.every(name => rolled.has(name))) return settle("The rolls are in: took a DM turn.");
  const acted = new Set(fresh.map(post => post.name));
  const quiet = present.filter(name => !acted.has(name));
  if (!quiet.length) return settle("Everyone had acted: took a DM turn.");
  if (fresh.length >= p.posts) return settle(fresh.length + " new posts: took a DM turn.");
  if (oldest >= p.others) return settle("Waited long enough: took a DM turn.");
  return { go: false, wait: "waiting for " + quiet.map(short).join(", ") + " to act (or " + Math.ceil((p.others - oldest) / 1000) + "s)." };
}
