// Starter roster and recap for the Onyx Jewel campaign. Shared by the local
// server (src/worker.js) and the hosted app (new rooms are seeded from here).
function profile(name, role, moves) {
  return { name, role, moves: moves.join("\n"), historyImported: true };
}

export const party = [
  profile("The White Wizard", "Half-Elf Light Domain cleric · Level 10 · AC 17 · spell DC 17, +9 (if Wis 20)", [
    "combat | Sacred Flame — DC 17 Dex save (16 if Wis isn't 20); 2d8+5 radiant with Potent Spellcasting, nothing on a save.",
    "combat | Fireball — Always prepared (Light Domain). Hit four musket guards for 24. DC 17 Dex save, 8d6, half on a save; 3rd-level slot.",
    "combat | Flame Strike — Always prepared: DC 17 Dex save, 4d6 fire + 4d6 radiant; one of two 5th-level slots.",
    "combat | Radiance of the Dawn — Channel Divinity (2 per short rest): DC 17 Con save, 2d10+10 radiant to chosen enemies within 30 ft.",
    "combat | Burning Hands, Faerie Fire, Scorching Ray, Flaming Sphere — Light Domain spells, always prepared.",
    "combat | Bless, Spiritual Weapon, Spirit Guardians — Used in play; confirm each is among today's 15 prepared spells. Spiritual Weapon: +9, 1d8+5.",
    "combat | Potent Spellcasting — Adds +5 to Sacred Flame damage.",
    "danger | Wall of Fire — Always prepared; got the party out of the goblin horde. 4th-level slot, concentration.",
    "danger | Warding Flare — 5 per long rest (Wis +5); Improved Flare can protect an ally within 30 ft.",
    "danger | Guardian of Faith, Daylight — Light Domain spells, always prepared.",
    "aid | Healing Word — Used in play: bonus action, 1d4+5 at 1st level. Confirm it's prepared today.",
    "explore | Detect Magic — Used in the casino (the DM asked for a roll).",
    "explore | Light, Thaumaturgy — Cantrips used in play.",
    "explore | Scrying — Always prepared; 10 minutes to cast.",
    "explore | Darkvision, Fey Ancestry — Half-elf traits.",
    "social | Intimidation — +2; rolled a 19 on the casino guard.",
    "any | Divine Intervention — New at Level 10: action, d100 of 10 or lower; the DM decides what happens.",
    "any | Turn Undead — Channel Divinity; at Level 10 it destroys CR 1 or lower undead that fail.",
    "check | Wisdom 20 — If the DM didn't approve it: DC 16, +8, 14 prepared spells, 4 Warding Flares.",
    "check | Current HP and slots — Max 75 with the cloak; took 12 from a musket. Confirm HP, slots, and rests.",
    "check | Guidance, Toll the Dead, Spare the Dying, Resistance — Suggested cantrips (5 known plus Light).",
    "check | Cure Wounds, Guiding Bolt, Shield of Faith, Command, Silence, Hold Person, Enhance Ability, Locate Object, Dispel Magic — Discussed; confirm which are prepared today.",
    "check | Revivify, Mass Healing Word, Death Ward, Banishment, Greater Restoration — Possible prepared spells; some need costly components.",
    "check | Perception, Insight, Religion — Assumed proficient (+9, +9, +4); confirm."
  ]),
  profile("Arcturus", "Elf Gloom Stalker ranger · Level 10 · Exiled Noble · spell DC 14, +6", [
    "combat | Longbow — +11 to hit with Archery (+5 Dex, +4 proficiency, +2 Archery), 1d8+5 piercing, 150/600 ft. Two shots per Attack action; disadvantage if a hostile creature that can see you is within 5 ft.",
    "combat | Extra Attack — Two attacks with the Attack action.",
    "combat | Dread Ambusher — Legacy version: +2 (Wis) to initiative (+7 total), +10 ft on the first combat turn, and a third shot on that turn that deals an extra 1d8.",
    "combat | Archery — Fighting style established in play: +2 to ranged weapon attack rolls. Confirm if the DM changed it.",
    "combat | Sharpshooter — DM house rule: ignore half and three-quarters cover and no long-range disadvantage. The −5/+10 option was removed.",
    "combat | Shortsword — +9 to hit, 1d6+5 piercing (finesse). Use when an enemy is in your face.",
    "danger | Defensive Duelist — From the Ring of the Dragon Champion: reaction when a melee attack hits while you hold a finesse weapon (not the longbow); add +4 to AC against it.",
    "explore | Umbral Sight — Darkvision to 90 ft at this table; invisible to creatures relying on darkvision to see you in darkness (not automatically hidden).",
    "explore | Stealth — +9 (proficient); +19 under Pass Without Trace. Moving into cover alone doesn't give advantage; hiding needs the DM's OK and normally your action.",
    "explore | Perception — +6 as played (passive 16); proficiency not yet verified.",
    "social | Insight — +6 as played; proficiency not yet verified.",
    "social | Persuasion — +4, proficient from the Exiled Noble background.",
    "social | Disguise Self — Gloom Stalker bonus spell: 1 action, 1 hour, no concentration, looks only. Passed as a casino guard (natural 20 on Performance).",
    "check | Iron Mind — Legacy Gloom Stalker: Wisdom save proficiency (+6). Confirm the table uses it.",
    "check | Hunter’s Mark — First-turn routine: bonus action, concentration, +1d6 on each hit. Confirm it is a known spell and you have a slot.",
    "check | Pass Without Trace, Cure Wounds, Ensnaring Strike, Hail of Thorns, Absorb Elements — Discussed spells; confirm which are known or prepared (slots: 4 × 1st, 3 × 2nd, 2 × 3rd).",
    "check | Lightning Arrow — Discussed as the Level 9 spell, not verified as the final choice.",
    "check | Rope Trick and Fear — Legacy Gloom Stalker spells at Ranger 5 and 9; verify the DM’s subclass version.",
    "check | Hide in Plain Sight and Tireless — Level 10 ranger feature depends on 2014 vs 2024 rules; the DM also offered an additional ability. Ask before choosing.",
    "check | Dagger — +9 to hit, 1d4+5 piercing (finesse), if it’s an ordinary dagger.",
    "check | Current HP and AC — HP 76 at Level 9; Level 10 maybe 84. AC 16 recorded, 17 with studded leather and Dex 20. Confirm with the DM."
  ]),
  profile("Logan Ninefingers", "Variant Human Berserker barbarian · Level 10 · AC 16 · speed 40 · played by Derek", [
    "combat | Rage — Bonus action, 4 per long rest: advantage on Strength checks and saves, +3 damage, resistance to physical damage.",
    "combat | Greataxe — +8 to hit; 1d12+4, or 1d12+7 raging. Reach 5 ft.",
    "combat | Extra Attack — Two greataxe swings per Attack action.",
    "combat | Reckless Attack — 2d20 keep the higher; enemies get advantage on you until your next turn. A prone foe gives advantage without the downside.",
    "combat | Frenzy — While frenzied, a bonus-action melee attack each turn after the first; one level of exhaustion when the rage ends.",
    "combat | Brutal Critical — Crits deal 3d12+7 while raging.",
    "combat | Intimidating Presence — New at Level 10: action, DC 11 Wis save or frightened. Low Charisma makes it unreliable.",
    "danger | Danger Sense — Advantage on Dex saves against effects you can see.",
    "danger | Distraction — Drew the casino guards away so the party could move.",
    "explore | Feral Instinct — Advantage on initiative; if surprised, rage first and act anyway.",
    "explore | Fast Movement — Speed 40 ft without heavy armor.",
    "any | Unarmored Defense — AC 16 (10 + Dex 2 + Con 4).",
    "any | Mindless Rage — Can't be charmed or frightened while raging.",
    "check | Great Weapon Master — Proposed build: −5 to hit for +10 damage (raging: +3 to hit, 1d12+17). Not used on the clone; confirm with the DM.",
    "check | Current HP — Max 115 by fixed progression (104 at Level 9). Confirm HP, rages left, and exhaustion."
  ]),
  profile("Dum Dum", "Battle Master fighter (gladiator) · Level 10 · +8 to hit · maneuver DC 16", [
    "combat | Weapon attack — +8 to hit, 1d8+4 (longsword or warhammer; confirm the weapon). Two attacks per Attack action.",
    "combat | Extra Attack — Used in the casino: the second attack can go to a different enemy.",
    "combat | Combat Superiority — 5 superiority dice (d10) per short rest; maneuver DC 16.",
    "combat | Trip Attack — On a hit: +1d10 damage, and a Large or smaller target makes a DC 16 Strength save or falls prone.",
    "combat | Goading Attack — On a hit: +1d10, and DC 16 Wis save or the target has disadvantage attacking anyone but Dum Dum.",
    "combat | Menacing Attack — On a hit: +1d10, and DC 16 Wis save or the target is frightened of Dum Dum until her next turn ends.",
    "combat | Action Surge — Once per short rest: a second action, for four attacks in one turn.",
    "combat | Lead the ambush — Led the party's ambush on the casino guards.",
    "aid | Second Wind — Bonus action: regain 1d10+10 HP, once per short rest.",
    "danger | Break free — Broke out of a guard's hold (and his wrist). Athletics +8 if proficient.",
    "danger | Indomitable — Reroll a failed saving throw once per long rest.",
    "explore | Know Your Enemy — Watch or talk with a creature for a minute to learn how it compares to you.",
    "explore | Weakness sense — DM-specific: spotted the shadow clones' vulnerabilities. Ask the DM how it works.",
    "social | Speak plainly — Dum Dum's blunt, protective style got the bartender to point the way.",
    "check | Precision Attack, Other maneuvers — 7 maneuvers known at Level 10; only Trip, Goading, and Menacing were discussed.",
    "check | Dueling — Suggested fighting style (+2 damage one-handed). Confirm.",
    "check | Current HP and AC — Max 94 if Con 16; AC 20 with plate and shield, or 18 with half plate. Confirm race, armor, and weapon."
  ]),
  profile("Roan the Last Shadow", "Living-shadow abilities · Level 10", [
    "explore | Living-shadow swap — Placed a shadow in the casino back room and swapped places with it, leaving it on the casino floor. Ask where the shadow can be placed and what it takes to swap.",
    "danger | Living-shadow swap — Consider repositioning if your shadow is already somewhere safe. Check range, timing, and availability with the DM.",
    "danger | Cause a distraction — Planned the casino distraction with Logan. Ask what would draw the guards.",
    "check | Confirm the name, limits, and uses of the shadow feature and add the rest of Roan’s Level 10 sheet."
  ])
];

export const recap = "Last time: the party reached the casino’s upper secure area by elevator and defeated four musket guards (the White Wizard’s Fireball hit for 24). A surviving guard was magically strangled before he could reveal the vault’s secrets. The jewel’s location, the vault’s wards, the killer, and the employer are still unknown. Everyone is now Level 10.";

// Full sheets for characters that have one (keyed by name). Shown on the
// Character sheet panel above the ability sections; reference only, so it
// lives in the app rather than the table's editable sheet.
export const sheets = {
  "The White Wizard": {
    // Structured attacks for the Combat tab (from the sheet above). hit: to-hit
    // bonus for an attack roll; save/dc: the target saves instead; half: half
    // damage on a successful save. ability: the modifier it uses (to hit and,
    // unless addMod is false, damage). bonus: other to-hit bonuses.
    // options: toggles that change the roll.
    attacks: [
      { name: "Spiritual Weapon", ability: "WIS", slot: 2, hit: 9, damage: "1d8+5", type: "force", note: "Bonus action; no concentration." },
      { name: "Guiding Bolt", ability: "WIS", slot: 1, upcast: "1d6", hit: 9, addMod: false, damage: "4d6", type: "radiant", note: "1st-level slot; next attack on the target has advantage." },
      { name: "Sacred Flame", ability: "WIS", save: "Dex", dc: 17, damage: "2d8+5", type: "radiant", note: "Cantrip; nothing on a save." },
      { name: "Fireball", ability: "WIS", slot: 3, upcast: "1d6", addMod: false, save: "Dex", dc: 17, damage: "8d6", type: "fire", half: true, note: "3rd-level slot; 20-ft radius, each creature takes the same roll." },
      { name: "Flame Strike", ability: "WIS", slot: 5, addMod: false, save: "Dex", dc: 17, damage: "4d6+4d6", type: "fire + radiant", half: true, note: "5th-level slot." },
      { name: "Radiance of the Dawn", ability: "WIS", spends: "Channel Divinity", addMod: false, save: "Con", dc: 17, damage: "2d10+10", type: "radiant", half: true, note: "Channel Divinity; enemies within 30 ft." }
    ],
    attackOptions: [],
    // Limited uses: spell slots by level, and features with uses per rest.
    resources: [
      { name: "Spell slots", slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }, per: "long" },
      { name: "Channel Divinity", max: 2, per: "short", note: "Radiance of the Dawn or Turn Undead." },
      { name: "Warding Flare", max: 5, per: "long", note: "Reaction: impose disadvantage on an attack against you (or an ally within 30 ft)." }
    ],
    rolls: [["Spell attack", "+9"], ["Spell save DC", "17"], ["Sacred Flame", "2d8+5"], ["AC", "17"], ["Initiative", "+1"], ["WIS save", "+9"], ["Perception", "+9*"], ["Intimidation", "+2"]],
    title: "The White Wizard — Light Domain Cleric",
    note: "Proposed Level 10 build from prior chats (2014 rules), not a DM-approved sheet. Wisdom 20 is assumed; if the DM didn't approve it, use DC 16, +8, and Wisdom-based values 1 lower.",
    identity: [
      ["Race", "Half-Elf (2014): Darkvision 60 ft, Fey Ancestry, two extra skills, Common, Elvish, and one more language"],
      ["Class", "Cleric 10 (Light Domain)"],
      ["Background", "Not confirmed (sage-like)"],
      ["Role", "Divine caster, healer, battlefield control, radiant and fire damage"],
      ["Inspiration", "Gandalf the White: a tall white-robed cleric with a staff"]
    ],
    abilities: [["STR", 8, -1], ["DEX", 12, 1], ["CON", 15, 2], ["INT", 10, 0], ["WIS", 20, 5], ["CHA", 15, 2]],
    combat: [
      ["Proficiency", "+4"],
      ["AC", "17 (scale mail, Dex +1, shield)"],
      ["HP", "75 max with the cloak · current unknown (took 12)"],
      ["Speed", "30 ft"],
      ["Initiative", "+1"],
      ["Hit Dice", "10d8"],
      ["Passive", "Perception 19 · Insight 19 · Investigation 10"]
    ],
    saves: [["STR", "−1", ""], ["DEX", "+1", ""], ["CON", "+2", ""], ["INT", "+0", ""], ["WIS", "+9", "proficient"], ["CHA", "+6", "proficient"]],
    skills: [
      ["Acrobatics", "DEX", "+1", ""], ["Animal Handling", "WIS", "+5", ""], ["Arcana", "INT", "+0", ""],
      ["Athletics", "STR", "−1", ""], ["Deception", "CHA", "+2", ""], ["History", "INT", "+0", ""],
      ["Insight", "WIS", "+9", "assumed"], ["Intimidation", "CHA", "+2", "played"], ["Investigation", "INT", "+0", "played"],
      ["Medicine", "WIS", "+5", ""], ["Nature", "INT", "+0", ""], ["Perception", "WIS", "+9", "assumed"],
      ["Performance", "CHA", "+2", ""], ["Persuasion", "CHA", "+2", ""], ["Religion", "INT", "+4", "assumed"],
      ["Sleight of Hand", "DEX", "+1", ""], ["Stealth", "DEX", "+1 (disadvantage in scale mail)", ""], ["Survival", "WIS", "+5", ""]
    ],
    spellcasting: [
      ["Ability", "Wisdom (+5)"],
      ["Save DC", "17 (16 if Wis 18)"],
      ["Spell attack", "+9 (+8 if Wis 18)"],
      ["Slots", "1st ×4 · 2nd ×3 · 3rd ×3 · 4th ×3 · 5th ×2"],
      ["Prepared", "15 cleric spells after a long rest, plus 10 domain spells"],
      ["Cantrips", "5 + Light; used: Light, Sacred Flame, Thaumaturgy"],
      ["Channel Divinity", "2 per short rest: Turn Undead, Radiance of the Dawn"],
      ["Warding Flare", "5 per long rest"]
    ],
    items: [
      ["Cloak", "+2 HP (included in the 75)."],
      ["Choker of Caution", "Warns of danger (DM-defined)."],
      ["Agility Ring", "A defensive or saving-throw effect (DM-defined)."],
      ["Healing potions", "Started with 3; how many are left isn't confirmed."],
      ["Third-eye amulet", "Who holds it is unclear; don't assume the White Wizard does."]
    ],
    lists: [
      ["Always-prepared Light Domain spells", [
        "1st: Burning Hands, Faerie Fire",
        "2nd: Flaming Sphere, Scorching Ray",
        "3rd: Daylight, Fireball",
        "4th: Guardian of Faith, Wall of Fire",
        "5th: Flame Strike, Scrying"
      ]],
      ["Quick damage", [
        "Sacred Flame: DC 17 Dex save, 2d8+5 radiant, nothing on a save (3d8 at level 11).",
        "Guiding Bolt: +9 spell attack, 4d6 radiant, and the next attack on the target has advantage.",
        "Spiritual Weapon: +9 spell attack, 1d8+5 force (bonus action, no concentration).",
        "Fireball: DC 17 Dex save, 8d6 fire, half on a save; each creature takes the full roll.",
        "Radiance of the Dawn: DC 17 Con save, 2d10+10 radiant, half on a save.",
        "Flame Strike: DC 17 Dex save, 4d6 fire + 4d6 radiant, half on a save.",
        "Only one concentration spell at a time."
      ]]
    ],
    questions: [
      "Are Wisdom 20, DC 17, and +9 approved? (Earlier sessions used DC 16 and +8.)",
      "Which 15 cleric spells are prepared, and which 5 cantrips are known?",
      "Current HP, remaining slots and Channel Divinity uses, and any rests since the fight?",
      "Background, the two Skill Versatility proficiencies, and the third language?",
      "What exactly do the Choker of Caution and Agility Ring do?"
    ]
  },
  "Logan Ninefingers": {
    attacks: [
      { name: "Greataxe", ability: "STR", hit: 8, damage: "1d12+4", type: "slashing", note: "Two swings per Attack action; Frenzy adds a bonus-action swing while raging." }
    ],
    attackOptions: [
      { name: "Raging", damage: "+3", note: "+3 damage on Strength attacks.", rage: true },
      { name: "Reckless", mode: "advantage", note: "Advantage on your attacks; enemies get advantage on you." },
      { name: "Great Weapon Master", hit: -5, damage: "+10", note: "Only if the DM approved the feat." }
    ],
    critExtraDice: 1, // Brutal Critical
    resources: [
      { name: "Rage", max: 4, per: "long", rage: true, note: "Bonus action. Lasts 1 minute (10 rounds)." }
    ],
    rolls: [["Greataxe", "+8"], ["Raging hit", "1d12+7"], ["AC", "16"], ["Initiative", "+2 adv."], ["STR save", "+8"], ["CON save", "+8"], ["Athletics", "+8*"], ["Perception", "+5*"]],
    title: "Logan Ninefingers — Berserker Barbarian",
    note: "Proposed build leveled to 10 (2014 rules), played by Derek. Not a DM-approved sheet.",
    identity: [
      ["Race", "Variant Human"],
      ["Class", "Barbarian 10 (Path of the Berserker)"],
      ["Background", "Outlander"],
      ["Role", "High-damage frontline melee and tank"],
      ["Inspiration", "The Bloody-Nine"]
    ],
    abilities: [["STR", 18, 4], ["DEX", 14, 2], ["CON", 18, 4], ["INT", 10, 0], ["WIS", 12, 1], ["CHA", 8, -1]],
    combat: [
      ["Proficiency", "+4"],
      ["AC", "16 unarmored (10 + Dex 2 + Con 4)"],
      ["HP", "115 max (fixed) · current unknown"],
      ["Speed", "40 ft"],
      ["Initiative", "+2 with advantage"],
      ["Hit Dice", "10d12"],
      ["Rages", "4 per long rest"]
    ],
    saves: [["STR", "+8", "proficient"], ["DEX", "+2", ""], ["CON", "+8", "proficient"], ["INT", "+0", ""], ["WIS", "+1", ""], ["CHA", "−1", ""]],
    skills: [
      ["Acrobatics", "DEX", "+2", ""], ["Animal Handling", "WIS", "+1", ""], ["Arcana", "INT", "+0", ""],
      ["Athletics", "STR", "+8", "assumed"], ["Deception", "CHA", "−1", ""], ["History", "INT", "+0", ""],
      ["Insight", "WIS", "+1", ""], ["Intimidation", "CHA", "+3", "assumed"], ["Investigation", "INT", "+0", ""],
      ["Medicine", "WIS", "+1", ""], ["Nature", "INT", "+0", ""], ["Perception", "WIS", "+5", "assumed"],
      ["Performance", "CHA", "−1", ""], ["Persuasion", "CHA", "−1", ""], ["Religion", "INT", "+0", ""],
      ["Sleight of Hand", "DEX", "+2", ""], ["Stealth", "DEX", "+2", ""], ["Survival", "WIS", "+5", "assumed"]
    ],
    items: [["Greataxe", "Heavy, two-handed, 1d12 slashing. Other gear (javelins, handaxes) only suggested; no confirmed magic items."]],
    lists: [
      ["Attack sequences", [
        "Raging Attack action: two swings, each d20 + 8, each hit 1d12 + 7.",
        "Raging and reckless: each 2d20 keep the higher + 8; enemies get advantage on you.",
        "Raging, reckless, with Great Weapon Master (if approved): each 2d20 + 3, each hit 1d12 + 17.",
        "Frenzy: from the turn after you start raging, a third swing as a bonus action.",
        "Crit (Brutal Critical): 3d12 + 7 raging, or 3d12 + 17 with Great Weapon Master.",
        "Prone enemy: advantage on melee attacks within 5 ft without needing Reckless Attack.",
        "Rage resistance halves physical damage; check whether the DM already halved it."
      ]]
    ],
    questions: [
      "Is Great Weapon Master approved?",
      "Is Intimidating Presence using the 2014 rules?",
      "Current HP (took 35 from a clone earlier), rages left, and any exhaustion?",
      "Stat increases at levels 4 and 8, and which skills are proficient?"
    ]
  },
  "Dum Dum": {
    attacks: [
      { name: "Weapon attack", ability: "STR", hit: 8, damage: "1d8+4", type: "slashing or bludgeoning", note: "Longsword or warhammer; two attacks per Attack action, four with Action Surge." }
    ],
    attackOptions: [
      { name: "Maneuver (+1d10)", damage: "+1d10", spends: "Superiority dice", note: "Spends a superiority die: Trip, Goading, or Menacing Attack (DC 16 save)." },
      { name: "Dueling (+2)", damage: "+2", note: "Only if the DM approved the Dueling style." }
    ],
    resources: [
      { name: "Superiority dice", max: 5, per: "short", note: "d10 each: Trip, Goading, or Menacing Attack (DC 16)." },
      { name: "Action Surge", max: 1, per: "short", note: "One extra action on your turn (four attacks)." },
      { name: "Second Wind", max: 1, per: "short", note: "Bonus action: regain 1d10+10 HP." },
      { name: "Indomitable", max: 1, per: "long", note: "Reroll a failed saving throw." }
    ],
    rolls: [["Attack", "+8"], ["Damage", "1d8+4"], ["Maneuver DC", "16"], ["Superiority", "5 × d10"], ["AC", "18–20*"], ["Initiative", "+1"], ["STR save", "+8"], ["Athletics", "+8*"]],
    title: "Dum Dum the Gladiator — Battle Master Fighter",
    note: "Proposed Level 9 build leveled to 10 (2014 rules), not a DM-approved sheet. Race, armor, weapon, fighting style, and most maneuvers are unconfirmed.",
    identity: [
      ["Race", "Variant Human (proposed, not confirmed)"],
      ["Class", "Fighter 10 (Battle Master; not Rune Knight)"],
      ["Background", "Gladiator (Entertainer variant, proposed)"],
      ["Role", "Frontline control, melee, guard breaker"],
      ["Special", "A DM-specific \"weakness sense\" that found the shadow clones' vulnerabilities"]
    ],
    abilities: [["STR", 18, 4], ["DEX", 12, 1], ["CON", 16, 3], ["INT", 10, 0], ["WIS", 12, 1], ["CHA", 8, -1]],
    combat: [
      ["Proficiency", "+4"],
      ["AC", "20 plate + shield, or 18 half plate + shield (unconfirmed)"],
      ["HP", "94 max (fixed, Con 16) · current unknown"],
      ["Speed", "30 ft"],
      ["Initiative", "+1"],
      ["Hit Dice", "10d10"],
      ["Attack", "+8 to hit · 1d8+4"],
      ["Superiority dice", "5 × d10 per short rest · maneuver DC 16"]
    ],
    saves: [["STR", "+8", "proficient"], ["DEX", "+1", ""], ["CON", "+7", "proficient"], ["INT", "+0", ""], ["WIS", "+1", ""], ["CHA", "−1", ""]],
    skills: [
      ["Acrobatics", "DEX", "+5", "assumed"], ["Animal Handling", "WIS", "+1", ""], ["Arcana", "INT", "+0", ""],
      ["Athletics", "STR", "+8", "assumed"], ["Deception", "CHA", "−1", ""], ["History", "INT", "+0", ""],
      ["Insight", "WIS", "+1", ""], ["Intimidation", "CHA", "+3", "assumed"], ["Investigation", "INT", "+0", ""],
      ["Medicine", "WIS", "+1", ""], ["Nature", "INT", "+0", ""], ["Perception", "WIS", "+1", "played"],
      ["Performance", "CHA", "+3", "assumed"], ["Persuasion", "CHA", "−1", ""], ["Religion", "INT", "+0", ""],
      ["Sleight of Hand", "DEX", "+1", ""], ["Stealth", "DEX", "+1 (disadvantage in heavy armor)", ""], ["Survival", "WIS", "+1", ""]
    ],
    lists: [
      ["Attack cheat sheet", [
        "Normal hit: d20 + 8; damage 1d8 + 4 (+6 if Dueling is approved).",
        "Extra Attack: two attacks per Attack action; Action Surge makes it four.",
        "Trip Attack on a hit: 1d8 + 4 + 1d10, and a DC 16 Strength save or prone.",
        "Crit: 2d8 + 4, or 2d8 + 2d10 + 4 with a maneuver die.",
        "Different weapon? Swap the damage die and type."
      ]],
      ["Maneuvers (7 known at Level 10)", [
        "Discussed: Trip Attack, Goading Attack, Menacing Attack, maybe Precision Attack.",
        "Not confirmed: the rest. Options include Disarming Attack, Riposte, Pushing Attack, Commander's Strike, Parry, and Rally."
      ]]
    ],
    questions: [
      "Race, armor (and so AC), and the equipped weapon?",
      "Fighting style (Dueling suggested)?",
      "Which seven maneuvers are known?",
      "Skill proficiencies and Student of War tool proficiency?",
      "Current HP, superiority dice left, and how weakness sense works?"
    ]
  },
  "Arcturus": {
    attacks: [
      { name: "Longbow", ability: "DEX", hit: 11, bonus: [["Archery", 2]], damage: "1d8+5", type: "piercing", note: "Two shots per Attack action (three on the first turn); 150/600 ft." },
      { name: "Shortsword", ability: "DEX", hit: 9, damage: "1d6+5", type: "piercing", note: "Finesse; for enemies in your face." },
      { name: "Dagger", ability: "DEX", hit: 9, damage: "1d4+5", type: "piercing", note: "Finesse; can be thrown 20/60 ft." }
    ],
    attackOptions: [
      { name: "Hunter's Mark", damage: "+1d6", note: "Bonus action to cast (a 1st-level slot, once); concentration." },
      { name: "Dread Ambusher shot", damage: "+1d8", note: "The extra first-turn attack only." }
    ],
    resources: [
      { name: "Spell slots", slots: { 1: 4, 2: 3, 3: 2 }, per: "long" }
    ],
    rolls: [["Longbow", "+11"], ["Damage", "1d8+5"], ["Initiative", "+7"], ["Stealth", "+9"], ["Perception", "+6*"], ["Spell DC", "14"], ["DEX save", "+9"], ["AC", "16–17*"]],
    title: "Arcturus — The Exiled Star",
    note: "Reconstructed from campaign chat, not a verified official sheet. Level 10 under a mix of legacy (2014) Gloom Stalker rules and DM house rules.",
    identity: [
      ["Ancestry", "Full elf with a dark-elf look; subrace not confirmed"],
      ["Class", "Ranger 10 (Gloom Stalker)"],
      ["Background", "Exiled Noble"],
      ["Appearance", "6 ft 5 in, ash-gray skin, glowing green eyes, hooded dark battle-worn leather with subtle gold trim and earrings, longbow. Named for the orange-red star."],
      ["Personality", "Quiet, strategic, observant shadow archer and emerging leader"]
    ],
    abilities: [["STR", 10, 0], ["DEX", 20, 5], ["CON", 14, 2], ["INT", 12, 1], ["WIS", 14, 2], ["CHA", 10, 0]],
    combat: [
      ["Proficiency", "+4"],
      ["Initiative", "+7"],
      ["Speed", "35 ft (45 ft first turn)"],
      ["HP", "76 at L9 · L10 TBD (84?)"],
      ["AC", "16 recorded · 17 if studded leather"],
      ["Hit Dice", "10d10"],
      ["Passive Perception", "16 if proficient (else 12)"]
    ],
    saves: [["STR", "+4", "proficient"], ["DEX", "+9", "proficient"], ["CON", "+2", ""], ["INT", "+1", ""], ["WIS", "+6", "Iron Mind"], ["CHA", "+0", ""]],
    // [skill, ability, bonus to use, status]: "proficient", "provisional", or "" (not confirmed: +x, or +y if proficient)
    skills: [
      ["Acrobatics", "DEX", "+5 (+9 if prof.)", ""],
      ["Animal Handling", "WIS", "+2 (+6 if prof.)", ""],
      ["Arcana", "INT", "+1 (+5 if prof.)", ""],
      ["Athletics", "STR", "+0 (+4 if prof.)", ""],
      ["Deception", "CHA", "+0", "played"],
      ["History", "INT", "+1 (+5 if prof.)", ""],
      ["Insight", "WIS", "+6", "provisional"],
      ["Intimidation", "CHA", "+0 (+4 if prof.)", ""],
      ["Investigation", "INT", "+1 (+5 if prof.)", ""],
      ["Medicine", "WIS", "+2 (+6 if prof.)", ""],
      ["Nature", "INT", "+1 (+5 if prof.)", ""],
      ["Perception", "WIS", "+6", "provisional"],
      ["Performance", "CHA", "+0", "played"],
      ["Persuasion", "CHA", "+4", "proficient"],
      ["Religion", "INT", "+1 (+5 if prof.)", ""],
      ["Sleight of Hand", "DEX", "+5 (+9 if prof.)", ""],
      ["Stealth", "DEX", "+9", "proficient"],
      ["Survival", "WIS", "+2 (+6 if prof.)", ""]
    ],
    spellcasting: [["Ability", "Wisdom (+2)"], ["Save DC", "14"], ["Spell attack", "+6"], ["Slots", "1st ×4 · 2nd ×3 · 3rd ×2"]],
    items: [["Ring of the Dragon Champion", "Grants Defensive Duelist: with a finesse weapon in hand, use your reaction when a melee attack hits to add +4 to AC against it. Doesn't work with the longbow."]],
    routine: [
      "Bonus action: Hunter’s Mark (if known, a slot is left, and concentration is free).",
      "Attack action: three longbow shots on the first turn (Dread Ambusher), each d20 + 11.",
      "Damage: shots 1 and 2 deal 1d8 + 5 + 1d6; the Dread Ambusher shot deals 2d8 + 5 + 1d6. About 43.5 if all three hit.",
      "Later turns: two shots per Attack action, each 1d8 + 5 + 1d6 while Hunter’s Mark holds.",
      "Stealth: cover alone doesn't grant advantage; hiding needs the DM's OK and normally an action, so you can't usually hide and attack with the same action."
    ],
    questions: [
      "What exactly is the Level 10 \"additional ability\" (feat, ability score, class feature, or custom reward)?",
      "Is Level 10 HP 84, or a rolled value?",
      "Is AC 17 (studded leather + Dex 20), or is other armor in play?",
      "Which skills are proficient (especially Perception, Insight, Acrobatics, Survival), and any expertise?",
      "Which spells are known or prepared, and 2014 or 2024 text?",
      "Elf subrace and traits, languages, equipment, remaining resources, and other magic items?"
    ]
  }
};
