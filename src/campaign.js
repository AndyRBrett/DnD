// Starter roster and recap for the Onyx Jewel campaign. Shared by the local
// server (src/worker.js) and the hosted app (new rooms are seeded from here).
function profile(name, role, moves) {
  return { name, role, moves: moves.join("\n"), historyImported: true };
}

export const party = [
  profile("The White Wizard", "Half-Elf Light Domain cleric · Level 10 · AC 17 · spell DC 16, +8", [
    "combat | Sacred Flame — Cantrip used in play. Check line of sight, range, and the target’s save.",
    "combat | Fireball — Hit four musket guards for 24 in the casino. Uses a 3rd-level slot; check who is inside the 20-ft blast.",
    "combat | Bless — Used in play. Check your prepared spells, slots, and concentration.",
    "combat | Spiritual Weapon — Used in play. Check the table’s version for casting and concentration.",
    "combat | Spirit Guardians — Used in play. Check your slot, concentration, and who is near you.",
    "danger | Wall of Fire — Got the party out of the goblin horde in the volcano. Check your slot, concentration, and where it leaves allies.",
    "aid | Healing Word — Used in play. Check your slot, range, and whether you can see the ally.",
    "explore | Detect Magic — Used in the casino (the DM asked for a roll). Ask what the DM wants rolled.",
    "explore | Guidance — Cantrip used in play. Cast it before the check, and not where guards can see.",
    "explore | Light — Cantrip used in play. Use when the group wants light and is ready to be seen.",
    "social | Intimidation — Rolled a 19 on the casino guard (d20 +2). Ask the DM before pressing someone.",
    "check | Current HP — Took 12 damage in the last fight (proposed max 75 at Level 10). Confirm HP and spell slots before acting.",
    "check | Flame Strike, Scrying — 5th-level spells on the proposed sheet. Confirm they are prepared.",
    "check | Silence, Command, Enhance Ability, Locate Object, Dispel Magic — Discussed during the heist. Confirm which are prepared.",
    "check | Warding Flare — Discussed previously. Confirm the reaction, trigger, and uses on the current sheet.",
    "check | Divine Intervention — New at Level 10. Confirm the table’s version."
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
  profile("Logan Ninefingers", "Variant Human Berserker barbarian · Level 10 · AC 16 · played by Derek", [
    "combat | Rage — Bonus action, used in play. Check remaining uses.",
    "combat | Greataxe — +8 to hit, 1d12+7 while raging, two attacks. Check reach and whether you can close the distance.",
    "combat | Reckless Attack — Roll 2d20 and keep the higher. Enemies get advantage on you until your next turn.",
    "combat | Frenzy — Recorded on the Berserker build. Verify when it applies and its cost under your table’s rules.",
    "danger | Distraction — Drew the casino guards away so the party could move. Ask the DM what would pull attention your way.",
    "check | Great Weapon Master — On the proposed sheet, but you chose not to use it in the clone fight. Confirm whether you have it.",
    "check | Brutal Critical and Level 10 Berserker features — On the proposed sheet. Confirm with the DM."
  ]),
  profile("Dum Dum", "Battle Master fighter (gladiator) · Level 10 · frontline", [
    "combat | Weapon attack — +8 to hit, 1d8+4. Check reach.",
    "combat | Extra Attack — Used in the casino: the second attack can go to a different enemy.",
    "combat | Lead the ambush — Led the party’s ambush on the casino guards. Ask how close they are and who can see you.",
    "danger | Break free — Broke out of a guard’s hold (and his wrist). Ask the DM for the Strength or Athletics check.",
    "social | Speak plainly — Dum Dum’s blunt, protective style got the bartender to point the way.",
    "check | Battle Master maneuvers (Trip Attack and others) and superiority dice — Suggested, not yet confirmed. Check your sheet.",
    "check | Action Surge, Second Wind, and Level 10 fighter features — Confirm what your sheet has."
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
  "Arcturus": {
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
