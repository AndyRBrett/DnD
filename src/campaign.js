// Starter roster and recap for the Onyx Jewel campaign. Shared by the local
// server (src/worker.js) and the hosted app (new rooms are seeded from here).
function profile(name, role, moves) {
  return { name, role, moves: moves.join("\n"), historyImported: true };
}

export const party = [
  profile("The White Wizard", "Half-Elf Light Domain cleric", [
    "combat | Sacred Flame — Cantrip used in play. Check line of sight, range, and the target’s save.",
    "combat | Fireball — Used against the casino guards for 24 damage. Check your slot and who is inside the blast.",
    "combat | Bless — Used in play. Check your prepared spells, slots, and concentration.",
    "combat | Spiritual Weapon — Used in play. Check the table’s version for casting and concentration.",
    "combat | Spirit Guardians — Used in play. Check your slot, concentration, and who is near you.",
    "combat | Wall of Fire — Used in play. Check your slot, concentration, and where the wall leaves allies.",
    "aid | Healing Word — Used in play. Check your prepared spells, slot, range, and whether you can see the ally.",
    "explore | Guidance — Cantrip used in play. Coordinate with the DM before the check.",
    "explore | Light — Cantrip used in play. Use when the group wants light and is ready to be seen.",
    "check | Warding Flare — Discussed previously. Confirm the reaction, trigger, and uses on the current sheet.",
    "check | Divine Intervention — Revisit after the level-up and confirm the table’s version."
  ]),
  profile("Arcturus", "Elf Gloom Stalker ranger", [
    "combat | Longbow — Primary weapon in the campaign recap. Check range, line of sight, and cover.",
    "combat | Extra Attack — Recorded in the ranger recap. Check your current sheet before counting attacks.",
    "combat | Dread Ambusher — The prior recap described an opening-turn extra attack. Confirm the house rule and its timing.",
    "combat | Sharpshooter — Prior notes say the DM limited it to cover and long-range benefits. Confirm before using.",
    "explore | Umbral Sight — Recorded in the ranger recap. Ask what the lighting lets you see.",
    "social | Disguise Self — Used during the casino heist. Check availability and whether the disguise fits the scene.",
    "check | Shortsword, Iron Mind, Ring of Dragon Champion / Defensive Duelist — Recorded in the earlier recap. Verify equipment and exact effects.",
    "check | Hunter’s Mark, Lightning Arrow, Cure Wounds, Pass Without Trace, Ensnaring Strike, Hail of Thorns, Absorb Elements — Discussed spells. Confirm which are available before using."
  ]),
  profile("Logan Ninefingers", "Berserker barbarian", [
    "combat | Rage — Used in play. Check remaining uses and the table’s activation rules.",
    "combat | Greataxe — Equipped in the campaign notes. Check reach and whether you can close the distance.",
    "combat | Reckless Attack — Recorded in play. Review the attack benefit and what it opens up for enemies.",
    "combat | Great Weapon Master — Recorded in play. Use the version on your current sheet.",
    "combat | Frenzy — Recorded on the Berserker build. Verify when it can apply and any costs under your table’s rules."
  ]),
  profile("Dum Dum", "Brawler / gladiator", [
    "combat | Close-range attack — Took down a musket guard in the casino fight. Check reach and use the attack on your sheet.",
    "check | Extra attack — Discussed during the casino fight. Confirm when it applies and which attacks, weapons, and features are on your current sheet."
  ]),
  profile("Roan the Last Shadow", "Living-shadow abilities", [
    "explore | Living-shadow swap — Placed a shadow in the casino back room and swapped places with it, leaving it on the casino floor. Ask where the shadow can be placed and what it takes to swap.",
    "danger | Living-shadow swap — Consider repositioning if your shadow is already somewhere safe. Check range, timing, and availability with the DM.",
    "check | Confirm the name, limits, and uses of the shadow feature and add the rest of Roan’s sheet."
  ])
];

export const recap = "The party is searching the casino for the Onyx jewel. The group survived the musket encounter. The vault’s secrets remain unknown, and the DM announced a level-up.";
