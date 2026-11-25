// Starter roster and recap for the Onyx Jewel campaign. Shared by the local
// server (src/worker.js) and the hosted app (new rooms are seeded from here).
function profile(name, role, moves) {
  return { name, role, moves: moves.join("\n"), historyImported: true };
}

export const party = [
  profile("The White Wizard", "Half-Elf Light Domain cleric · Level 10 · AC 17 · spell DC 16, +8", [
    "combat | Sacred Flame — DC 16 Dex save; 2d8+4 radiant with Potent Spellcasting, nothing on a save.",
    "combat | Toll the Dead — DC 16 Wis save; 2d12+4 necrotic if the target is hurt, 2d8+4 if not; nothing on a save.",
    "combat | Fireball — Always prepared (Light Domain). Hit four musket guards for 24 at DC 16. Dex save, 8d6, half on a save; 3rd-level slot.",
    "combat | Flame Strike — Always prepared: DC 16 Dex save, 4d6 fire + 4d6 radiant; one of two 5th-level slots.",
    "combat | Radiance of the Dawn — Channel Divinity (2 per short rest): DC 16 Con save, 2d10+10 radiant to chosen enemies within 30 ft.",
    "combat | Burning Hands, Faerie Fire, Scorching Ray, Flaming Sphere — Light Domain spells, always prepared.",
    "combat | Bless, Command, Guiding Bolt, Spiritual Weapon, Spirit Guardians — Prepared. Spiritual Weapon and Guiding Bolt: +8 to hit.",
    "combat | Potent Spellcasting — Adds +4 (Wis) to cleric cantrip damage.",
    "danger | Wall of Fire — Always prepared; got the party out of the goblin horde. 4th-level slot, concentration.",
    "danger | Warding Flare — 4 per long rest (Wis +4); Improved Flare can protect an ally within 30 ft.",
    "danger | Guardian of Faith, Daylight — Light Domain spells, always prepared.",
    "danger | Silence, Dispel Magic, Death Ward — Prepared.",
    "danger | Choker of Caution — Warns of danger like a spider-sense; the DM says when it triggers. No action, no bonus.",
    "danger | Agility Ring — When the DM calls for it, a Dexterity save to dodge; the DM sets the DC and the outcome.",
    "aid | Healing Word — Bonus action, 60 ft, 1d4+4 at 1st level.",
    "aid | Cure Wounds, Lesser Restoration, Revivify, Greater Restoration — Prepared. Cure Wounds: touch, 1d8+4. Revivify and Greater Restoration need diamonds.",
    "aid | Spare the Dying — Cantrip: stabilize a dying creature you touch.",
    "aid | Guidance — Cantrip: +1d4 to one ability check.",
    "explore | Detect Magic — Prepared; used in the casino. Can be cast as a ritual.",
    "explore | Light, Thaumaturgy — Cantrips used in play.",
    "explore | Scrying — Always prepared; 10 minutes to cast.",
    "explore | Darkvision, Fey Ancestry — Half-elf traits.",
    "explore | Perception, Insight, Arcana, Religion, Medicine — Proficient: +8, +8, +4, +4, +8.",
    "social | Persuasion — +6, proficient.",
    "social | Intimidation — +2; rolled a 19 on the casino guard.",
    "any | Divine Intervention — New at Level 10: action, d100 of 10 or lower; the DM decides what happens.",
    "any | Turn Undead — Channel Divinity; at Level 10 it destroys CR 1 or lower undead that fail."
  ]),
  profile("Arcturus", "Wood Elf Gloom Stalker ranger · Level 10 · AC 17 · spell DC 14, +6", [
    "combat | Longbow — +11 to hit with Archery (+5 Dex, +4 proficiency, +2 Archery), 1d8+5 piercing, 150/600 ft. Two shots per Attack action; disadvantage if a hostile creature that can see you is within 5 ft.",
    "combat | Extra Attack — Two attacks with the Attack action.",
    "combat | Dread Ambusher — Legacy version: +2 (Wis) to initiative, +10 ft on the first combat turn, and a third shot on that turn that deals an extra 1d8.",
    "combat | Alert — Level 10 bonus feat from the DM: +5 initiative (+12 total), can't be surprised while conscious, and hidden attackers get no advantage just for being unseen.",
    "combat | Archery — Fighting style: +2 to ranged weapon attack rolls.",
    "combat | Sharpshooter — Table ruling: ignore half and three-quarters cover and no long-range disadvantage. The −5/+10 option is off.",
    "combat | Hunter’s Mark — Known. Bonus action, concentration, +1d6 on each hit; moving it is free.",
    "combat | Ensnaring Strike, Hail of Thorns — Known: a slot on your next hit to restrain (Str save) or burst thorns (Dex save, 1d10).",
    "combat | Shortsword — +9 to hit, 1d6+5 piercing (finesse). Use when an enemy is in your face.",
    "combat | Dagger — +9 to hit, 1d4+5 piercing (finesse), thrown 20/60 ft.",
    "danger | Defensive Duelist — From the Ring of the Dragon Champion: reaction when a melee attack hits while you hold a finesse weapon (not the longbow); add +4 to AC against it.",
    "danger | Absorb Elements — Known: reaction to resist acid, cold, fire, lightning, or thunder damage, and add 1d6 to your next melee hit.",
    "danger | Fear — Gloom Stalker spell: 30-ft cone, Wis save or frightened and must flee.",
    "danger | Iron Mind — Legacy Gloom Stalker: proficient in Wisdom saves (+6).",
    "aid | Cure Wounds — Known: touch, 1d8+2.",
    "explore | Umbral Sight — Darkvision to 90 ft at this table; invisible to creatures relying on darkvision to see you in darkness (not automatically hidden).",
    "explore | Hide in Plain Sight — Level 10 (legacy ranger): a minute of camouflage gives +10 Stealth while you stay still.",
    "explore | Pass Without Trace, Rope Trick — Known: +10 Stealth for the party (concentration); a hidden space for a short rest.",
    "explore | Mask of the Wild — Wood elf: try to hide when only lightly obscured by foliage, rain, snow, or mist.",
    "explore | Stealth — +9; +19 under Pass Without Trace. Moving into cover alone doesn't give advantage; hiding needs the DM's OK and normally your action.",
    "explore | Perception, Survival, Insight, History — Proficient: +6, +6, +6, +5 (passive Perception 16).",
    "social | Persuasion — +4, proficient from the Exiled Noble background.",
    "social | Disguise Self — Gloom Stalker spell: 1 action, 1 hour, no concentration, looks only. Passed as a casino guard (natural 20 on Performance).",
    "explore | Favored Enemy — Humanoids (humans and dwarves): advantage on Survival checks to track them and on Intelligence checks to recall information about them. Speaks Dwarvish.",
    "explore | Natural Explorer — Favored terrain: forest. Travel there isn't slowed by difficult terrain, the group can't get lost except by magic, and he stays alert while foraging, tracking, or navigating."
  ]),
  profile("Logan Ninefingers", "Variant Human Berserker barbarian · Level 10 · AC 16 · speed 40 · played by Derek", [
    "combat | Rage — Bonus action, 4 per long rest: advantage on Strength checks and saves, +3 damage, resistance to physical damage.",
    "combat | Greataxe — +8 to hit; 1d12+4, or 1d12+7 raging. Reach 5 ft.",
    "combat | Handaxe, Javelin — Thrown: +8 to hit, 1d6+4. Handaxe 20/60 ft (2 carried), javelin 30/120 ft (4 carried). Thrown attacks are ranged: no Rage damage, Reckless, or Brutal Critical.",
    "combat | Extra Attack — Two swings per Attack action.",
    "combat | Savage Attacker — Feat: once a turn, reroll a melee weapon's damage dice and use either total.",
    "combat | Reckless Attack — 2d20 keep the higher; enemies get advantage on you until your next turn. A prone foe gives advantage without the downside.",
    "combat | Frenzy — While frenzied, a bonus-action melee attack each turn after the first; one level of exhaustion when the rage ends.",
    "combat | Brutal Critical — Crits deal 3d12+7 while raging.",
    "combat | Intimidating Presence — 2014 rules: action, one creature within 30 ft that can see or hear you makes a DC 11 Wis save or is frightened until the end of your next turn. Extend it with your action each turn; a creature that saves is immune for 24 hours.",
    "danger | Danger Sense — Advantage on Dex saves against effects you can see.",
    "danger | Distraction — Drew the casino guards away so the party could move.",
    "explore | Feral Instinct — Advantage on initiative; if surprised, rage first and act anyway.",
    "explore | Fast Movement — Speed 40 ft without heavy armor.",
    "explore | Athletics, Perception, Survival — Proficient: +8, +5, +5 (passive Perception 15).",
    "social | Intimidation — +3, proficient.",
    "any | Unarmored Defense — AC 16 (10 + Dex 2 + Con 4).",
    "any | Mindless Rage — Can't be charmed or frightened while raging."
  ]),
  profile("Dum Dum", "Variant Human Battle Master fighter (gladiator) · Level 10 · AC 20", [
    "combat | Longsword — +8 to hit, 1d8+6 slashing one-handed (Dueling +2). Two attacks per Attack action.",
    "combat | Dueling — Fighting style: +2 damage with a one-handed melee weapon and no other weapon.",
    "combat | Extra Attack — Used in the casino: the second attack can go to a different enemy.",
    "combat | Combat Superiority — 5 superiority dice (d10) per short rest; maneuver DC 16.",
    "combat | Trip Attack — On a hit: +1d10 damage, and a Large or smaller target makes a DC 16 Strength save or falls prone.",
    "combat | Goading Attack — On a hit: +1d10, and DC 16 Wis save or the target has disadvantage attacking anyone but Dum Dum.",
    "combat | Menacing Attack — On a hit: +1d10, and DC 16 Wis save or the target is frightened of Dum Dum until Dum Dum's next turn ends.",
    "combat | Disarming Attack — On a hit: +1d10, and DC 16 Str save or the target drops an item of Dum Dum's choice.",
    "combat | Pushing Attack — On a hit: +1d10, and a Large or smaller target makes a DC 16 Str save or is pushed up to 15 ft.",
    "combat | Precision Attack — Add a superiority die to an attack roll, before or after rolling but before the DM says hit or miss.",
    "combat | Riposte — Reaction when a creature misses Dum Dum in melee: attack it, adding the superiority die to the damage.",
    "combat | Action Surge — Once per short rest: a second action, for four attacks in one turn.",
    "combat | Shield Master — Feat: shove with the shield as a bonus action after attacking; add the shield's +2 to Dex saves against effects aimed only at Dum Dum.",
    "combat | Lead the ambush — Led the party's ambush on the casino guards.",
    "aid | Second Wind — Bonus action: regain 1d10+10 HP, once per short rest.",
    "danger | Break free — Broke out of a guard's hold (and his wrist). Athletics +8.",
    "danger | Indomitable — Reroll a failed saving throw once per long rest.",
    "explore | Know Your Enemy — Watch or talk with a creature for a minute to learn how it compares to you.",
    "explore | Weakness sense — Dum Dum senses weak points in enemies, structures, and areas (a cracked wall, an unstable floor). Ask the DM: they reveal a clue. The shadow clones were hurt by fire, lightning, and ordinary physical attacks.",
    "any | Third-eye amulet — Dum Dum carries it. What it does is up to the DM.",
    "explore | Acrobatics, Insight — Proficient: +5, +5.",
    "social | Intimidation, Performance — Proficient: +3, +3. Gladiator crowd work.",
    "social | Speak plainly — Dum Dum's blunt, protective style got the bartender to point the way."
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
    // unless addMod is false, damage). bonus: other to-hit bonuses;
    // damageBonus: other flat damage (Dueling), shown in the damage math.
    // attackOptions: toggles that change the roll. They stay on for the
    // character (also after a reload) unless lasts says otherwise: "attack"
    // turns off after one attack (Dread Ambusher shot, a maneuver), "turn" when
    // that character's turn ends (Reckless). cast: a slot level spent once when
    // first ticked; with concentration it stays up only while Concentrating.
    // choices: which one (a maneuver), named in the hit report with its save.
    // perAction: attacks per Attack action (Extra Attack), counted on the card.
    // unconfirmed: not yet approved by the DM; the card says so.
    // ranged: a thrown or ranged attack, so melee-only options (melee: true,
    // like Raging and Reckless) and Brutal Critical don't apply.
    // concentration (on a lasting spell): casting it starts Concentrating, and
    // it stops being free once concentration ends.
    attacks: [
      { name: "Spiritual Weapon", ability: "WIS", slot: 2, lasting: true, hit: 8, damage: "1d8+4", type: "force", note: "Bonus action; no concentration. One slot when cast; it lasts a minute, and attacking with it again is free." },
      { name: "Guiding Bolt", ability: "WIS", slot: 1, upcast: "1d6", hit: 8, addMod: false, damage: "4d6", type: "radiant", note: "1st-level slot; next attack on the target has advantage." },
      { name: "Sacred Flame", ability: "WIS", save: "Dex", dc: 16, damage: "2d8+4", type: "radiant", note: "Cantrip; nothing on a save." },
      { name: "Toll the Dead · hurt target", ability: "WIS", save: "Wis", dc: 16, damage: "2d12+4", type: "necrotic", note: "Cantrip, against a target that's missing any HP (Bloodied, or hit earlier). Nothing on a save." },
      { name: "Toll the Dead · unhurt target", ability: "WIS", save: "Wis", dc: 16, damage: "2d8+4", type: "necrotic", note: "Cantrip, against a target at full HP. Nothing on a save." },
      { name: "Spirit Guardians", ability: "WIS", slot: 3, upcast: "1d8", lasting: true, concentration: true, addMod: false, save: "Wis", dc: 16, damage: "3d8", type: "radiant", half: true, note: "Concentration, 10 minutes, 15-ft aura: each enemy that starts its turn there or enters it saves. One slot when cast (you start concentrating); later rounds are free until concentration ends." },
      { name: "Fireball", ability: "WIS", slot: 3, upcast: "1d6", addMod: false, save: "Dex", dc: 16, damage: "8d6", type: "fire", half: true, note: "3rd-level slot; 20-ft radius, each creature takes the same roll." },
      { name: "Flame Strike", ability: "WIS", slot: 5, addMod: false, save: "Dex", dc: 16, damage: "4d6+4d6", type: "fire + radiant", half: true, note: "5th-level slot." },
      { name: "Radiance of the Dawn", ability: "WIS", spends: "Channel Divinity", addMod: false, save: "Con", dc: 16, damage: "2d10+10", type: "radiant", half: true, note: "Channel Divinity; enemies within 30 ft." }
    ],
    attackOptions: [],
    // Healing from the Resources card: heal is the dice (with the modifier);
    // slot/upcast as for attacks; spends a feature; self: only on yourself.
    heals: [
      { name: "Healing Word", slot: 1, upcast: "1d4", heal: "1d4+4", note: "Bonus action, 60 ft; 1d4 more for each slot level above 1st." },
      { name: "Cure Wounds", slot: 1, upcast: "1d8", heal: "1d8+4", note: "Action, touch; 1d8 more for each slot level above 1st." }
    ],
    // Limited uses: spell slots by level, and features with uses per rest
    // (covers: the sheet abilities that need it; default is its own name).
    // per "never": not refilled by rests (potions, javelins).
    resources: [
      { name: "Spell slots", slots: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 }, per: "long" },
      { name: "Channel Divinity", max: 2, per: "short", covers: ["Radiance of the Dawn", "Turn Undead"], note: "Radiance of the Dawn or Turn Undead." },
      { name: "Warding Flare", max: 4, per: "long", note: "Reaction: impose disadvantage on an attack against you (or an ally within 30 ft)." },
      { name: "Healing potions", max: 3, per: "never", note: "2d4+2 each; drink one from Healing below. Tap a dot back when you find more." }
    ],
    rolls: [["Spell attack", "+8"], ["Spell save DC", "16"], ["Sacred Flame", "2d8+4"], ["AC", "17"], ["Initiative", "+1"], ["WIS save", "+8"], ["Perception", "+8"], ["Insight", "+8"]],
    title: "The White Wizard — Light Domain Cleric",
    note: "Playable defaults from the campaign chat (2014 rules). Wisdom 18: spell save DC 16 and +8, as the casino Fireball was run.",
    identity: [
      ["Race", "Half-Elf (2014): Darkvision 60 ft, Fey Ancestry, Skill Versatility (Perception, Arcana)"],
      ["Class", "Cleric 10 (Light Domain)"],
      ["Background", "Acolyte"],
      ["Languages", "Common, Elvish, Celestial, Dwarvish, Draconic"],
      ["Role", "Divine caster, healer, battlefield control, radiant and fire damage"],
      ["Inspiration", "Gandalf the White: a tall white-robed cleric with a staff"]
    ],
    abilities: [["STR", 8, -1], ["DEX", 12, 1], ["CON", 15, 2], ["INT", 10, 0], ["WIS", 18, 4], ["CHA", 15, 2]],
    combat: [
      ["Proficiency", "+4"],
      ["AC", "17 (scale mail, Dex +1, shield)"],
      ["HP", "75 max with the cloak"],
      ["Speed", "30 ft"],
      ["Initiative", "+1"],
      ["Hit Dice", "10d8"],
      ["Passive", "Perception 18 · Insight 18 · Investigation 10"]
    ],
    saves: [["STR", "−1", ""], ["DEX", "+1", ""], ["CON", "+2", ""], ["INT", "+0", ""], ["WIS", "+8", "proficient"], ["CHA", "+6", "proficient"]],
    skills: [
      ["Acrobatics", "DEX", "+1", ""], ["Animal Handling", "WIS", "+4", ""], ["Arcana", "INT", "+4", "proficient"],
      ["Athletics", "STR", "−1", ""], ["Deception", "CHA", "+2", ""], ["History", "INT", "+0", ""],
      ["Insight", "WIS", "+8", "proficient"], ["Intimidation", "CHA", "+2", ""], ["Investigation", "INT", "+0", ""],
      ["Medicine", "WIS", "+8", "proficient"], ["Nature", "INT", "+0", ""], ["Perception", "WIS", "+8", "proficient"],
      ["Performance", "CHA", "+2", ""], ["Persuasion", "CHA", "+6", "proficient"], ["Religion", "INT", "+4", "proficient"],
      ["Sleight of Hand", "DEX", "+1", ""], ["Stealth", "DEX", "+1 (disadvantage in scale mail)", ""], ["Survival", "WIS", "+4", ""]
    ],
    spellcasting: [
      ["Ability", "Wisdom (+4)"],
      ["Save DC", "16"],
      ["Spell attack", "+8"],
      ["Slots", "1st ×4 · 2nd ×3 · 3rd ×3 · 4th ×3 · 5th ×2"],
      ["Cantrips", "Guidance, Sacred Flame, Thaumaturgy, Spare the Dying, Toll the Dead, plus Light (domain)"],
      ["Prepared", "14 cleric spells, plus 10 domain spells always prepared"],
      ["Channel Divinity", "2 per short rest: Turn Undead, Radiance of the Dawn"],
      ["Warding Flare", "4 per long rest"]
    ],
    items: [
      ["Cloak", "+2 HP (included in the 75)."],
      ["Choker of Caution", "A passive danger warning, like a spider-sense: the DM says when it triggers. No action and no bonus."],
      ["Agility Ring", "When the DM calls for it, a Dexterity save to dodge; the DM sets the DC and decides the outcome. No automatic bonus or charges."],
      ["Healing potions", "3 (2d4+2 each), tracked under Resources."]
    ],
    lists: [
      ["Prepared cleric spells (14)", [
        "1st: Bless, Command, Cure Wounds, Detect Magic, Guiding Bolt, Healing Word",
        "2nd: Lesser Restoration, Silence, Spiritual Weapon",
        "3rd: Dispel Magic, Revivify, Spirit Guardians",
        "4th: Death Ward",
        "5th: Greater Restoration"
      ]],
      ["Always-prepared Light Domain spells", [
        "1st: Burning Hands, Faerie Fire",
        "2nd: Flaming Sphere, Scorching Ray",
        "3rd: Daylight, Fireball",
        "4th: Guardian of Faith, Wall of Fire",
        "5th: Flame Strike, Scrying"
      ]],
      ["Quick damage", [
        "Sacred Flame: DC 16 Dex save, 2d8+4 radiant, nothing on a save (3d8 at level 11).",
        "Toll the Dead: DC 16 Wis save, 2d12+4 necrotic if it's hurt (2d8+4 if not), nothing on a save.",
        "Guiding Bolt: +8 spell attack, 4d6 radiant, and the next attack on the target has advantage.",
        "Spiritual Weapon: +8 spell attack, 1d8+4 force (bonus action, no concentration).",
        "Spirit Guardians: DC 16 Wis save, 3d8 radiant each turn in the aura, half on a save (concentration).",
        "Fireball: DC 16 Dex save, 8d6 fire, half on a save; each creature takes the full roll.",
        "Radiance of the Dawn: DC 16 Con save, 2d10+10 radiant, half on a save.",
        "Flame Strike: DC 16 Dex save, 4d6 fire + 4d6 radiant, half on a save.",
        "Only one concentration spell at a time."
      ]]
    ],
    questions: [
      "These are playable defaults from the campaign chat: has the DM looked them over?",
      "Anything new from the last session: rests taken, potions drunk, items found?",
      "Does the Agility Ring ever give a set bonus, or is it always the DM's call?",
      "Any other magic items picked up?"
    ]
  },
  "Logan Ninefingers": {
    attacks: [
      { name: "Greataxe", ability: "STR", perAction: 2, hit: 8, damage: "1d12+4", type: "slashing", note: "Two swings per Attack action; Frenzy adds a bonus-action swing while raging. Savage Attacker: once a turn, reroll the damage dice and keep either." },
      { name: "Handaxe (thrown)", ability: "STR", perAction: 2, ranged: true, hit: 8, damage: "1d6+4", type: "slashing", note: "Thrown 20/60 ft (2 carried). A ranged attack: no Rage damage, Reckless, or Brutal Critical." },
      { name: "Javelin (thrown)", ability: "STR", perAction: 2, ranged: true, hit: 8, damage: "1d6+4", type: "piercing", note: "Thrown 30/120 ft; 4 carried (tracked under Resources). A ranged attack: no Rage damage, Reckless, or Brutal Critical." }
    ],
    attackOptions: [
      { name: "Raging", damage: "+3", melee: true, note: "+3 damage on melee weapon attacks using Strength.", rage: true },
      { name: "Reckless", mode: "advantage", melee: true, lasts: "turn", note: "Advantage on your attacks this turn; enemies get advantage on you until your next turn." }
    ],
    critExtraDice: 1, // Brutal Critical
    resources: [
      { name: "Rage", max: 4, per: "long", rage: true, note: "Bonus action. Lasts 1 minute (10 rounds)." },
      { name: "Javelins", max: 4, per: "never", note: "Tap one when you throw it; tap it back when you pick it up." }
    ],
    rolls: [["Greataxe", "+8"], ["Raging hit", "1d12+7"], ["AC", "16"], ["Initiative", "+2 adv."], ["STR save", "+8"], ["CON save", "+8"], ["Athletics", "+8"], ["Perception", "+5"]],
    title: "Logan Ninefingers — Berserker Barbarian",
    note: "Playable defaults from the campaign chat (2014 rules), played by Derek. Savage Attacker, not Great Weapon Master.",
    identity: [
      ["Race", "Variant Human (feat: Savage Attacker)"],
      ["Class", "Barbarian 10 (Path of the Berserker)"],
      ["Background", "Outlander"],
      ["Ability increases", "Level 4: +2 Strength · Level 8: +2 Constitution"],
      ["Role", "High-damage frontline melee and tank"],
      ["Inspiration", "The Bloody-Nine"]
    ],
    abilities: [["STR", 18, 4], ["DEX", 14, 2], ["CON", 18, 4], ["INT", 10, 0], ["WIS", 12, 1], ["CHA", 8, -1]],
    combat: [
      ["Proficiency", "+4"],
      ["AC", "16 unarmored (10 + Dex 2 + Con 4)"],
      ["HP", "115 max (fixed)"],
      ["Speed", "40 ft"],
      ["Initiative", "+2 with advantage"],
      ["Hit Dice", "10d12"],
      ["Rages", "4 per long rest"],
      ["Passive Perception", "15"]
    ],
    saves: [["STR", "+8", "proficient"], ["DEX", "+2", ""], ["CON", "+8", "proficient"], ["INT", "+0", ""], ["WIS", "+1", ""], ["CHA", "−1", ""]],
    skills: [
      ["Acrobatics", "DEX", "+2", ""], ["Animal Handling", "WIS", "+1", ""], ["Arcana", "INT", "+0", ""],
      ["Athletics", "STR", "+8", "proficient"], ["Deception", "CHA", "−1", ""], ["History", "INT", "+0", ""],
      ["Insight", "WIS", "+1", ""], ["Intimidation", "CHA", "+3", "proficient"], ["Investigation", "INT", "+0", ""],
      ["Medicine", "WIS", "+1", ""], ["Nature", "INT", "+0", ""], ["Perception", "WIS", "+5", "proficient"],
      ["Performance", "CHA", "−1", ""], ["Persuasion", "CHA", "−1", ""], ["Religion", "INT", "+0", ""],
      ["Sleight of Hand", "DEX", "+2", ""], ["Stealth", "DEX", "+2", ""], ["Survival", "WIS", "+5", "proficient"]
    ],
    items: [
      ["Greataxe", "Heavy, two-handed, 1d12 slashing."],
      ["Handaxes (2)", "Light, thrown 20/60 ft, 1d6 slashing."],
      ["Javelins (4)", "Thrown 30/120 ft, 1d6 piercing."],
      ["Explorer's pack", "No magic items equipped."]
    ],
    lists: [
      ["Attack sequences", [
        "Raging Attack action: two swings, each d20 + 8, each hit 1d12 + 7.",
        "Raging and reckless: each 2d20 keep the higher + 8; enemies get advantage on you.",
        "Savage Attacker: once a turn, reroll a hit's damage dice and keep the better total.",
        "Frenzy: from the turn after you start raging, a third swing as a bonus action.",
        "Crit (Brutal Critical): 3d12 + 7 raging.",
        "Prone enemy: advantage on melee attacks within 5 ft without needing Reckless Attack.",
        "Rage resistance halves physical damage; check whether the DM already halved it."
      ]]
    ],
    questions: [
      "These are playable defaults from the campaign chat: has Derek looked them over?",
      "Any exhaustion left from Frenzy?",
      "Javelins and handaxes left after the last fight?",
      "Has Logan picked up any magic items?"
    ]
  },
  "Dum Dum": {
    attacks: [
      { name: "Longsword", ability: "STR", perAction: 2, hit: 8, damage: "1d8+6", damageBonus: [["Dueling", 2]], type: "slashing", note: "One-handed with a shield (Dueling); two attacks per Attack action, four with Action Surge." }
    ],
    attackOptions: [
      { name: "Maneuver (+1d10)", damage: "+1d10", spends: "Superiority dice", lasts: "attack", note: "Spends a superiority die on a hit; DC 16 save. (Precision Attack adds the die to the attack roll instead: roll it in the tray.)",
        choices: [
          ["Trip Attack", "DC 16 Strength save or knocked prone (Large or smaller)"],
          ["Goading Attack", "DC 16 Wisdom save or disadvantage on attacks against anyone but Dum Dum until Dum Dum's next turn ends"],
          ["Menacing Attack", "DC 16 Wisdom save or frightened of Dum Dum until Dum Dum's next turn ends"],
          ["Disarming Attack", "DC 16 Strength save or drops an item of Dum Dum's choice"],
          ["Pushing Attack", "DC 16 Strength save or pushed up to 15 ft (Large or smaller)"],
          ["Riposte", "reaction after the target missed Dum Dum in melee"]
        ] }
    ],
    heals: [
      { name: "Second Wind", spends: "Second Wind", self: true, heal: "1d10+10", note: "Bonus action, once per short rest." }
    ],
    resources: [
      { name: "Superiority dice", max: 5, per: "short", covers: ["Combat Superiority", "Trip Attack", "Goading Attack", "Menacing Attack", "Precision Attack", "Disarming Attack", "Pushing Attack", "Riposte"], note: "d10 each; maneuver DC 16." },
      { name: "Action Surge", max: 1, per: "short", note: "One extra action on your turn (four attacks)." },
      { name: "Second Wind", max: 1, per: "short", note: "Bonus action: regain 1d10+10 HP." },
      { name: "Indomitable", max: 1, per: "long", note: "Reroll a failed saving throw." }
    ],
    rolls: [["Longsword", "+8"], ["Damage", "1d8+6"], ["Maneuver DC", "16"], ["Superiority", "5 × d10"], ["AC", "20"], ["Initiative", "+1"], ["STR save", "+8"], ["Athletics", "+8"]],
    title: "Dum Dum the Gladiator — Battle Master Fighter",
    note: "Playable defaults from the campaign chat (2014 rules): plate and shield, longsword with Dueling, Shield Master.",
    identity: [
      ["Race", "Variant Human (feat: Shield Master)"],
      ["Class", "Fighter 10 (Battle Master; not Rune Knight)"],
      ["Background", "Gladiator (Entertainer variant)"],
      ["Tools", "Smith's tools (Student of War)"],
      ["Role", "Frontline control, melee, guard breaker"],
      ["Special", "Weakness sense: senses weak points in enemies, structures, and areas; the DM reveals a clue when asked"]
    ],
    abilities: [["STR", 18, 4], ["DEX", 12, 1], ["CON", 16, 3], ["INT", 10, 0], ["WIS", 12, 1], ["CHA", 8, -1]],
    combat: [
      ["Proficiency", "+4"],
      ["AC", "20 (plate + shield)"],
      ["HP", "94 max (fixed, Con 16)"],
      ["Speed", "30 ft"],
      ["Initiative", "+1"],
      ["Hit Dice", "10d10"],
      ["Attack", "+8 to hit · 1d8+6 (longsword, Dueling)"],
      ["Superiority dice", "5 × d10 per short rest · maneuver DC 16"]
    ],
    saves: [["STR", "+8", "proficient"], ["DEX", "+1", ""], ["CON", "+7", "proficient"], ["INT", "+0", ""], ["WIS", "+1", ""], ["CHA", "−1", ""]],
    skills: [
      ["Acrobatics", "DEX", "+5", "proficient"], ["Animal Handling", "WIS", "+1", ""], ["Arcana", "INT", "+0", ""],
      ["Athletics", "STR", "+8", "proficient"], ["Deception", "CHA", "−1", ""], ["History", "INT", "+0", ""],
      ["Insight", "WIS", "+5", "proficient"], ["Intimidation", "CHA", "+3", "proficient"], ["Investigation", "INT", "+0", ""],
      ["Medicine", "WIS", "+1", ""], ["Nature", "INT", "+0", ""], ["Perception", "WIS", "+1", ""],
      ["Performance", "CHA", "+3", "proficient"], ["Persuasion", "CHA", "−1", ""], ["Religion", "INT", "+0", ""],
      ["Sleight of Hand", "DEX", "+1", ""], ["Stealth", "DEX", "+1 (disadvantage in heavy armor)", ""], ["Survival", "WIS", "+1", ""]
    ],
    items: [["Plate armor and shield", "AC 20."], ["Longsword", "Versatile; used one-handed with the shield (Dueling)."], ["Third-eye amulet", "Dum Dum carries it; what it does is up to the DM."]],
    lists: [
      ["Attack cheat sheet", [
        "Normal hit: d20 + 8; damage 1d8 + 6 (Strength +4, Dueling +2).",
        "Extra Attack: two attacks per Attack action; Action Surge makes it four.",
        "Trip Attack on a hit: 1d8 + 6 + 1d10, and a DC 16 Strength save or prone.",
        "Crit: 2d8 + 6, or 2d8 + 2d10 + 6 with a maneuver die.",
        "Shield Master: after the Attack action, shove with the shield as a bonus action (prone foes give advantage)."
      ]],
      ["Maneuvers (7 known)", [
        "On a hit: Trip Attack, Goading Attack, Menacing Attack, Disarming Attack, Pushing Attack.",
        "Precision Attack: add the die to an attack roll that's about to miss.",
        "Riposte: reaction attack when a creature misses Dum Dum in melee."
      ]],
      ["Encounter notes", [
        "Weakness sense on the shadow clones: fire, lightning, and ordinary physical attacks hurt them."
      ]]
    ],
    questions: [
      "These are playable defaults from the campaign chat: has the DM looked them over?",
      "Weakness sense: does it cost an action, have a range or uses, or add damage?",
      "What does the third-eye amulet do?",
      "Any magic items, or a different weapon for some fights?",
      "Superiority dice left after the last fight?"
    ]
  },
  "Arcturus": {
    attacks: [
      { name: "Longbow", ability: "DEX", perAction: 2, hit: 11, bonus: [["Archery", 2]], damage: "1d8+5", type: "piercing", note: "Two shots per Attack action (three on the first turn); 150/600 ft." },
      { name: "Shortsword", ability: "DEX", perAction: 2, hit: 9, damage: "1d6+5", type: "piercing", note: "Finesse; for enemies in your face (Defensive Duelist works with it)." },
      { name: "Dagger", ability: "DEX", perAction: 2, hit: 9, damage: "1d4+5", type: "piercing", note: "Finesse; can be thrown 20/60 ft." }
    ],
    attackOptions: [
      { name: "Hunter's Mark", damage: "+1d6", cast: 1, concentration: true, note: "Bonus action to cast: one 1st-level slot, then it stays up while you concentrate. Moving it to a new target is free." },
      { name: "Dread Ambusher shot", damage: "+1d8", lasts: "attack", note: "The extra first-turn attack only." }
    ],
    heals: [
      { name: "Cure Wounds", slot: 1, upcast: "1d8", heal: "1d8+2", note: "Action, touch; 1d8 more for each slot level above 1st." }
    ],
    resources: [
      { name: "Spell slots", slots: { 1: 4, 2: 3, 3: 2 }, per: "long" }
    ],
    rolls: [["Longbow", "+11"], ["Damage", "1d8+5"], ["Initiative", "+12"], ["Stealth", "+9"], ["Perception", "+6"], ["Spell DC", "14"], ["DEX save", "+9"], ["AC", "17"]],
    title: "Arcturus — The Exiled Star",
    note: "Playable defaults from the campaign chat: legacy (2014) Gloom Stalker rules and spell text, with the table's Sharpshooter ruling.",
    identity: [
      ["Ancestry", "Wood elf with a dark-elf look: Darkvision, Fey Ancestry, Trance, Fleet of Foot (35 ft), Mask of the Wild"],
      ["Class", "Ranger 10 (Gloom Stalker) · Favored Enemy: humanoids (humans and dwarves) · Favored terrain: forest"],
      ["Feat", "Alert (Level 10 bonus feat from the DM)"],
      ["Background", "Exiled Noble"],
      ["Languages", "Common, Elvish, Sylvan, Dwarvish (Favored Enemy)"],
      ["Appearance", "6 ft 5 in, ash-gray skin, glowing green eyes, hooded dark battle-worn leather with subtle gold trim and earrings, longbow. Named for the orange-red star."],
      ["Personality", "Quiet, strategic, observant shadow archer and emerging leader"]
    ],
    abilities: [["STR", 10, 0], ["DEX", 20, 5], ["CON", 14, 2], ["INT", 12, 1], ["WIS", 14, 2], ["CHA", 10, 0]],
    combat: [
      ["Proficiency", "+4"],
      ["Initiative", "+12 (Dex +5, Wis +2 Dread Ambusher, Alert +5)"],
      ["Speed", "35 ft (45 ft first turn)"],
      ["HP", "84 max"],
      ["AC", "17 (studded leather, Dex +5)"],
      ["Hit Dice", "10d10"],
      ["Passive Perception", "16"]
    ],
    saves: [["STR", "+4", "proficient"], ["DEX", "+9", "proficient"], ["CON", "+2", ""], ["INT", "+1", ""], ["WIS", "+6", "Iron Mind"], ["CHA", "+0", ""]],
    // [skill, ability, bonus, status]: "proficient" or "" (untrained).
    skills: [
      ["Acrobatics", "DEX", "+5", ""],
      ["Animal Handling", "WIS", "+2", ""],
      ["Arcana", "INT", "+1", ""],
      ["Athletics", "STR", "+0", ""],
      ["Deception", "CHA", "+0", ""],
      ["History", "INT", "+5", "proficient"],
      ["Insight", "WIS", "+6", "proficient"],
      ["Intimidation", "CHA", "+0", ""],
      ["Investigation", "INT", "+1", ""],
      ["Medicine", "WIS", "+2", ""],
      ["Nature", "INT", "+1", ""],
      ["Perception", "WIS", "+6", "proficient"],
      ["Performance", "CHA", "+0", ""],
      ["Persuasion", "CHA", "+4", "proficient"],
      ["Religion", "INT", "+1", ""],
      ["Sleight of Hand", "DEX", "+5", ""],
      ["Stealth", "DEX", "+9", "proficient"],
      ["Survival", "WIS", "+6", "proficient"]
    ],
    spellcasting: [
      ["Ability", "Wisdom (+2)"], ["Save DC", "14"], ["Spell attack", "+6"], ["Slots", "1st ×4 · 2nd ×3 · 3rd ×2"],
      ["Known (6)", "Hunter's Mark, Cure Wounds, Ensnaring Strike, Absorb Elements, Hail of Thorns, Pass Without Trace"],
      ["Gloom Stalker", "Disguise Self, Rope Trick, Fear (always known)"]
    ],
    items: [
      ["Ring of the Dragon Champion", "Grants Defensive Duelist: with a finesse weapon in hand, use your reaction when a melee attack hits to add +4 to AC against it. Doesn't work with the longbow."],
      ["Gear", "Studded leather, longbow, shortsword, dagger. A shield is carried but not equipped."]
    ],
    routine: [
      "Bonus action: Hunter’s Mark (a 1st-level slot; concentration).",
      "Attack action: three longbow shots on the first turn (Dread Ambusher), each d20 + 11.",
      "Damage: shots 1 and 2 deal 1d8 + 5 + 1d6; the Dread Ambusher shot deals 2d8 + 5 + 1d6. About 43.5 if all three hit.",
      "Later turns: two shots per Attack action, each 1d8 + 5 + 1d6 while Hunter’s Mark holds.",
      "Stealth: cover alone doesn't grant advantage; hiding needs the DM's OK and normally an action, so you can't usually hide and attack with the same action."
    ],
    questions: [
      "Legacy rangers gain more favored terrains at levels 6 and 10 and another favored enemy at level 6: forest and humanoids only, or are the others picked?",
      "These are playable defaults from the campaign chat: has the DM looked them over?",
      "Any magic items besides the Ring of the Dragon Champion?"
    ]
  }
};
