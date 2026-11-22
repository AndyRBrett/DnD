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
  profile("Arcturus", "Elf Gloom Stalker ranger · Level 10 · archer and scout", [
    "combat | Longbow — Primary weapon; struck the final blow on the volcano dragon. Check range, line of sight, and cover.",
    "combat | Extra Attack — Recorded in the ranger recap. Check your current sheet before counting attacks.",
    "combat | Dread Ambusher — The prior recap described an opening-turn extra attack. Confirm the house rule and its timing.",
    "combat | Sharpshooter — Prior notes say the DM limited it to cover and long-range benefits. Confirm before using.",
    "explore | Umbral Sight — Recorded in the ranger recap. Ask what the lighting lets you see.",
    "social | Disguise Self — Passed as a casino guard on a natural 20. Lasts 1 hour, looks only; close inspection can see through it.",
    "social | Persuasion — +4. Used on the casino guards while disguised. Agree the story with the party first.",
    "check | Shortsword, Iron Mind, Ring of Dragon Champion / Defensive Duelist — Recorded in the earlier recap. Verify equipment and exact effects.",
    "check | Hunter’s Mark, Lightning Arrow, Cure Wounds, Pass Without Trace, Ensnaring Strike, Hail of Thorns, Absorb Elements — Discussed spells. Confirm which are available.",
    "check | Level 10 ranger features — Confirm what the level-up added."
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
