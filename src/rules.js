// Built-in rules reference: plain-language summaries of the spells, features,
// weapons, skills, and basic actions this party uses, so players can read how
// a move works without an AI call. Written for this app from the D&D 5th
// edition rules (2014 Player's Handbook; much of it is in the SRD 5.1, CC BY
// 4.0). Tables house-rule things: the sheet's own note is shown beside each
// rule, and the DM's ruling wins.

const spell = (level, meta, text, aliases = []) => ({ section: "spells", level, meta, text, aliases });
const attack = (meta, text, aliases = []) => ({ section: "attacks", meta, text, aliases });
const feature = (meta, text, aliases = []) => ({ section: "features", meta, text, aliases });
const skill = (ability, text, aliases = []) => ({ section: "skills", meta: "Ability check · d20 + " + ability, text, aliases });

// What a cantrip is, for the sheet and D&D basics.
export const CANTRIP_MEANING = "Cantrips are simple spells you can cast as often as you like: they never use a spell slot, and many get stronger as you level up.";

export const rules = {
  // ── Cantrips ──
  "Sacred Flame": spell(0, "Cantrip · Action · 60 ft · Dex save",
    "A creature you can see makes a Dexterity saving throw. On a fail it takes radiant damage (2d8 at levels 5–10, 3d8 from 11). Cover doesn't help it. No spell slot."),
  "Guidance": spell(0, "Cantrip · Action · Touch · Concentration (1 min)",
    "A willing creature adds 1d4 to one ability check of its choice, before or after rolling. Cast it before the check happens. No spell slot."),
  "Light": spell(0, "Cantrip · Action · Touch · 1 hour",
    "An object you touch sheds bright light for 20 feet and dim light 20 feet beyond. Useful in the dark, but it makes you easy to see. No spell slot."),

  "Thaumaturgy": spell(0, "Cantrip · Action · 30 ft · Up to 1 minute",
    "A minor wonder: your voice booms three times louder, flames flicker, the ground trembles harmlessly, doors fly open, or your eyes change. Great for intimidation and theater. No spell slot."),
  "Toll the Dead": spell(0, "Cantrip · Action · 60 ft · Wis save",
    "A dolorous bell tolls at a creature: on a failed Wisdom save it takes 2d8 necrotic, or 2d12 if it's already missing hit points. No spell slot."),
  "Spare the Dying": spell(0, "Cantrip · Action · Touch",
    "A creature at 0 hit points becomes stable, so it stops making death saves. It doesn't restore any hit points. No spell slot."),
  "Resistance": spell(0, "Cantrip · Action · Touch · Concentration (1 min)",
    "A willing creature adds 1d4 to one saving throw of its choice before the spell ends. No spell slot."),

  // ── Leveled spells ──
  "Bless": spell(1, "1st-level · Action · 30 ft · Concentration (1 min)",
    "Up to three creatures add 1d4 to their attack rolls and saving throws while it lasts. One more target for each slot above 1st."),
  "Healing Word": spell(1, "1st-level · Bonus action · 60 ft",
    "A creature you can see regains 1d4 + your spellcasting modifier hit points. Best for picking up a downed ally from a distance. If you cast a bonus-action spell, any other spell that turn must be a cantrip."),
  "Command": spell(1, "1st-level · Action · 60 ft · Wis save",
    "Speak a one-word command (approach, drop, flee, grovel, halt). On a failed Wisdom save the creature obeys on its next turn. It must understand your language; undead are immune."),
  "Detect Magic": spell(1, "1st-level · Action or 10-min ritual · Concentration (10 min)",
    "You sense magic within 30 feet and can use your action to see a faint aura and learn its school of magic. Cast as a ritual, it takes 10 minutes and no spell slot."),
  "Disguise Self": spell(1, "1st-level · Action · Self · 1 hour",
    "You change how you look, clothes and gear included. It's visual only: touch gives it away, and a suspicious creature can use its action on an Intelligence (Investigation) check against your spell save DC to see through it."),
  "Cure Wounds": spell(1, "1st-level · Action · Touch",
    "A creature you touch regains 1d8 + your spellcasting modifier hit points. Extra 1d8 for each slot above 1st."),
  "Hunter's Mark": spell(1, "1st-level · Bonus action · 90 ft · Concentration (1 hour)",
    "Mark a creature: your weapon hits on it deal an extra 1d6 damage, and you have advantage on Perception and Survival checks to find it. If it drops to 0 HP, move the mark with a bonus action."),
  "Ensnaring Strike": spell(1, "1st-level · Bonus action · Concentration (1 min) · Str save",
    "Your next weapon hit makes vines grab the target: Strength save or it's restrained and takes 1d6 piercing at the start of each of its turns. Large or bigger creatures save with advantage."),
  "Hail of Thorns": spell(1, "1st-level · Bonus action · Concentration (1 min) · Dex save",
    "Your next ranged weapon hit bursts into thorns: the target and everything within 5 feet make a Dexterity save, taking 1d10 piercing (half on a success)."),
  "Absorb Elements": spell(1, "1st-level · Reaction · Self",
    "When you take acid, cold, fire, lightning, or thunder damage, you resist it until your next turn, and your first melee hit next turn deals an extra 1d6 of that type."),
  "Burning Hands": spell(1, "1st-level · Action · 15-ft cone · Dex save",
    "Flames shoot from your fingertips: creatures in the cone take 3d6 fire on a failed Dexterity save, half on a success. +1d6 per slot above 1st."),
  "Faerie Fire": spell(1, "1st-level · Action · 60 ft (20-ft cube) · Concentration (1 min) · Dex save",
    "Creatures in the area that fail a Dexterity save glow. Attacks against them have advantage, and they can't benefit from being invisible."),
  "Guiding Bolt": spell(1, "1st-level · Action · 120 ft · Spell attack",
    "A flash of light: on a hit, 4d6 radiant damage, and the next attack roll against that target before the end of your next turn has advantage."),
  "Shield of Faith": spell(1, "1st-level · Bonus action · 60 ft · Concentration (10 min)",
    "A shimmering field gives one creature +2 AC while it lasts."),
  "Flaming Sphere": spell(2, "2nd-level · Action · 60 ft · Concentration (1 min) · Dex save",
    "A 5-foot ball of fire. A creature that ends its turn within 5 feet of it makes a Dexterity save, taking 2d6 fire (half on a success). A bonus action rolls it up to 30 feet into someone."),
  "Scorching Ray": spell(2, "2nd-level · Action · 120 ft · Spell attacks",
    "Three rays of fire, each a separate ranged spell attack (same or different targets), each dealing 2d6 fire on a hit."),
  "Hold Person": spell(2, "2nd-level · Action · 60 ft · Concentration (1 min) · Wis save",
    "A humanoid that fails a Wisdom save is paralyzed. Melee hits from within 5 feet are automatic critical hits. It repeats the save at the end of each of its turns."),
  "Spiritual Weapon": spell(2, "2nd-level · Bonus action · 60 ft · 1 min (no concentration)",
    "A floating spectral weapon appears and makes a melee spell attack: 1d8 + your spellcasting modifier force damage. On later turns, a bonus action moves it 20 feet and attacks again."),
  "Silence": spell(2, "2nd-level · Action · 120 ft · Concentration (10 min)",
    "No sound in a 20-foot-radius sphere. Creatures inside are deafened and can't cast spells that need speech. Great for stopping a shout for help, but it blocks your allies' spoken spells too."),
  "Lesser Restoration": spell(2, "2nd-level · Action · Touch",
    "End one disease or one condition on a creature you touch: blinded, deafened, paralyzed, or poisoned."),
  "Enhance Ability": spell(2, "2nd-level · Action · Touch · Concentration (1 hour)",
    "Pick one ability boon. Eagle's Splendor gives advantage on Charisma checks; Bull's Strength on Strength checks; Cat's Grace on Dexterity checks; Owl's Wisdom on Wisdom checks; Fox's Cunning on Intelligence checks; Bear's Endurance gives advantage on Constitution checks plus 2d6 temporary HP."),
  "Locate Object": spell(2, "2nd-level · Action · Self · Concentration (10 min)",
    "You sense the direction of a familiar object, or the nearest object of a kind you name, within 1,000 feet. Lead blocks it."),
  "Pass Without Trace": spell(2, "2nd-level · Action · 30-ft aura · Concentration (1 hour)",
    "You and allies within 30 feet get +10 to Dexterity (Stealth) checks and can't be tracked except by magic."),
  "Rope Trick": spell(2, "2nd-level · Action · Touch · 1 hour",
    "A rope rises into the air and opens an invisible extradimensional space at the top for up to eight Medium creatures. Nothing outside can see in. A good hiding spot or a safe place for a short rest."),
  "Fear": spell(3, "3rd-level · Action · 30-ft cone · Concentration (1 min) · Wis save",
    "Creatures in the cone make a Wisdom save or drop what they're holding and become frightened. They must use their turns to run from you, and they can repeat the save when they're out of your sight."),
  "Fireball": spell(3, "3rd-level · Action · 150 ft · Dex save",
    "A 20-foot-radius explosion: everyone inside makes a Dexterity save, taking 8d6 fire on a fail or half on a success. Allies in the blast get hit too, and it lights unattended flammable objects. Every creature takes the full roll; it isn't split."),
  "Spirit Guardians": spell(3, "3rd-level · Action · 15-ft aura · Concentration (10 min) · Wis save",
    "Spirits surround you. Enemies in the area move at half speed, and when one enters it or starts its turn there, it makes a Wisdom save, taking 3d8 radiant on a fail or half on a success. You choose who's safe."),
  "Daylight": spell(3, "3rd-level · Action · 60 ft · 1 hour",
    "A 60-foot-radius sphere of bright light (plus 60 more feet of dim light). It dispels magical darkness of 3rd level or lower that it overlaps."),
  "Revivify": spell(3, "3rd-level · Action · Touch · 300 gp of diamonds",
    "A creature that died within the last minute returns to life with 1 hit point. The diamonds are used up. It can't restore lost body parts or undo old age."),
  "Mass Healing Word": spell(3, "3rd-level · Bonus action · 60 ft",
    "Up to six creatures you can see each regain 1d4 + your spellcasting modifier hit points. Good for getting several downed allies back up."),
  "Dispel Magic": spell(3, "3rd-level · Action · 120 ft",
    "End spells on a creature, object, or magical effect. Spells of 3rd level or lower end automatically; for higher ones you roll a spellcasting ability check against DC 10 + the spell's level."),
  "Lightning Arrow": spell(3, "3rd-level · Bonus action · Concentration (1 min)",
    "Your next ranged weapon attack turns into lightning: 4d8 lightning on a hit (half on a miss), and creatures within 10 feet of the target make a Dexterity save or take 2d8 lightning."),
  "Wall of Fire": spell(4, "4th-level · Action · 120 ft · Concentration (1 min) · Dex save",
    "A wall of flame up to 60 feet long (or a 20-foot ring). Creatures in it when it appears take 5d8 fire on a failed Dexterity save, half on a success. One side burns anyone who ends a turn within 10 feet of it. It blocks sight."),
  "Guardian of Faith": spell(4, "4th-level · Action · 30 ft · 8 hours",
    "A Large spectral guardian holds a spot. The first time an enemy moves within 10 feet of it on a turn, the enemy makes a Dexterity save, taking 20 radiant (half on a success). It vanishes after dealing 60 damage."),
  "Death Ward": spell(4, "4th-level · Action · Touch · 8 hours",
    "The first time the warded creature would drop to 0 hit points, it drops to 1 instead, and the spell ends."),
  "Banishment": spell(4, "4th-level · Action · 60 ft · Concentration (1 min) · Cha save",
    "A creature that fails a Charisma save vanishes to a harmless demiplane while you concentrate, or home for good if it's from another plane and you hold it the full minute."),
  "Greater Restoration": spell(5, "5th-level · Action · Touch · 100 gp of diamond dust",
    "End one of: a level of exhaustion, a charm or petrification, a curse, an ability-score reduction, or a reduction to maximum hit points."),
  "Flame Strike": spell(5, "5th-level · Action · 60 ft · Dex save",
    "A 10-foot-radius column of divine fire: 4d6 fire + 4d6 radiant on a failed Dexterity save, half on a success."),
  "Scrying": spell(5, "5th-level · 10 minutes to cast · Concentration (10 min) · Wis save",
    "See and hear a specific creature on the same plane through an invisible sensor. The target makes a Wisdom save, which is easier for it the less you know about it. Needs a costly focus (1,000 gp)."),

  // ── Attacks and weapons ──
  "Greataxe": attack("Martial melee weapon · Two-handed, heavy · 1d12 slashing",
    "Roll d20 + attack bonus against the target's AC; on a hit, roll 1d12 + Strength modifier. Raging adds Rage damage."),
  "Longbow": attack("Martial ranged weapon · Two-handed · 150 / 600 ft · 1d8 piercing",
    "Roll d20 + attack bonus against the target's AC; on a hit, roll 1d8 + Dexterity modifier. Beyond 150 feet you have disadvantage."),
  "Shortsword": attack("Martial melee weapon · Finesse, light · 1d6 piercing",
    "Use Strength or Dexterity for the attack and damage. Light means it can be used for two-weapon fighting."),
  "Longsword": attack("Martial melee weapon · Versatile · 1d8 slashing (1d10 two-handed)",
    "Roll d20 + attack bonus against the target's AC; on a hit, 1d8 + Strength modifier one-handed, or 1d10 + Strength with both hands."),
  "Handaxe": attack("Simple melee weapon · Light, thrown (20/60 ft) · 1d6 slashing",
    "Swing it or throw it, using Strength either way. Throwing at long range (past 20 ft) has disadvantage.", ["Handaxes"]),
  "Javelin": attack("Simple melee weapon · Thrown (30/120 ft) · 1d6 piercing",
    "Usually thrown, using Strength. Throwing at long range (past 30 ft) has disadvantage. Pick it up again after the fight.", ["Javelins"]),
  "Dagger": attack("Simple melee weapon · Finesse, light, thrown (20/60 ft) · 1d4 piercing",
    "Use Strength or Dexterity. It can be thrown, and a finesse weapon in hand lets Defensive Duelist work."),
  "Archery": attack("Fighting style · Always on",
    "+2 to every attack roll you make with a ranged weapon such as a longbow. Always on; no action needed."),
  "Weapon attack": attack("Action (Attack)",
    "Roll d20 + your attack bonus against the target's Armor Class. On a hit, roll the weapon's damage. A natural 20 is a critical hit: roll the damage dice twice."),
  "Extra Attack": attack("Part of the Attack action",
    "When you take the Attack action on your turn, you attack twice instead of once. Each attack can go at a different target."),
  "Reckless Attack": attack("Barbarian · Choose on your first attack",
    "You get advantage on Strength melee attack rolls this turn, but attack rolls against you have advantage until your next turn."),
  "Great Weapon Master": attack("Feat · Heavy weapons",
    "Before attacking with a heavy weapon, you can take −5 to hit for +10 damage. When you score a critical hit or drop a creature to 0 HP with a melee weapon, you can make one melee attack as a bonus action."),
  "Savage Attacker": attack("Feat · Once per turn",
    "When you roll damage for a melee weapon attack, you can reroll the weapon's damage dice and use either total."),
  "Shield Master": attack("Feat · Shield",
    "After you take the Attack action, you can use a bonus action to shove a creature within 5 ft with your shield. Add the shield's AC bonus to Dexterity saves against effects that target only you, and on a successful save against half damage, take none (reaction)."),
  "Sharpshooter": attack("Feat · Ranged weapons",
    "Long range doesn't give you disadvantage, and your ranged attacks ignore half and three-quarters cover. You can take −5 to hit for +10 damage. Your table limits this feat, so check the note."),
  "Dread Ambusher": attack("Gloom Stalker ranger · First turn of combat",
    "Add your Wisdom modifier to initiative. On your first turn you get +10 feet of speed, and if you take the Attack action you make one extra weapon attack that deals an extra 1d8 on a hit."),
  "Alert": feature("Feat",
    "+5 to initiative. You can't be surprised while you're conscious, and creatures you can't see don't gain advantage on attacks against you just because they're hidden from you."),
  "Favored Enemy": feature("Ranger (legacy) · Your chosen creature types",
    "Advantage on Wisdom (Survival) checks to track your favored enemies and on Intelligence checks to recall information about them. You also learn one language they speak."),
  "Natural Explorer": feature("Ranger (legacy) · Your favored terrain",
    "Intelligence or Wisdom checks about your favored terrain use double proficiency, if you're proficient in the skill. When you travel there for an hour or more: difficult terrain doesn't slow the group, the group can't get lost except by magic, you stay alert while foraging, tracking, or navigating, you move stealthily at a normal pace only when traveling alone, you find twice the food, and tracking tells you the creatures' exact number, size, and how long ago they passed."),
  "Primeval Awareness": feature("Ranger (legacy) · Action · A spell slot",
    "For 1 minute per level of the slot spent, you sense whether aberrations, celestials, dragons, elementals, fey, fiends, or undead are within 1 mile (6 miles in a favored terrain). You don't learn where they are or how many."),
  "Brutal Critical": attack("Barbarian · Critical hits",
    "When you score a critical hit with a melee weapon, roll one extra weapon damage die."),
  "Battle Master maneuvers": attack("Fighter · Superiority dice (5 × d10 at level 10, regain on a short rest)",
    "Spend a superiority die to add a maneuver to an attack or reaction. You know seven at level 10. Others include Disarming Attack, Pushing Attack, Riposte, Parry, Rally, and Commander's Strike. Maneuver saves use 8 + proficiency + Strength or Dexterity modifier.",
    ["superiority dice", "maneuvers", "Combat Superiority"]),
  "Trip Attack": attack("Maneuver · On a weapon hit · Str save",
    "Spend a superiority die: add it to the damage, and a Large or smaller target makes a Strength save or falls prone. Melee attacks against a prone creature have advantage."),
  "Goading Attack": attack("Maneuver · On a weapon hit · Wis save",
    "Spend a superiority die: add it to the damage, and on a failed Wisdom save the target has disadvantage attacking anyone but you until the end of your next turn."),
  "Menacing Attack": attack("Maneuver · On a weapon hit · Wis save",
    "Spend a superiority die: add it to the damage, and on a failed Wisdom save the target is frightened of you until the end of your next turn."),
  "Precision Attack": attack("Maneuver · Any weapon attack",
    "Spend a superiority die and add it to an attack roll, before or after rolling but before you know if it hits."),
  "Disarming Attack": attack("Maneuver · On a weapon hit · Str save",
    "Spend a superiority die: add it to the damage, and the target makes a Strength save or drops one item it's holding (your choice). It lands at its feet."),
  "Pushing Attack": attack("Maneuver · On a weapon hit · Str save",
    "Spend a superiority die: add it to the damage, and a Large or smaller target makes a Strength save or is pushed up to 15 feet away."),
  "Riposte": attack("Maneuver · Reaction",
    "When a creature misses you with a melee attack, use your reaction and a superiority die to make one melee attack against it, adding the die to the damage."),
  "Dueling": attack("Fighting style · One-handed melee",
    "+2 damage with a melee weapon held in one hand when you hold no other weapon (a shield is fine)."),

  // ── Features and traits ──
  "Rage": feature("Barbarian · Bonus action · 1 minute · 4 uses per long rest at level 10",
    "While raging: advantage on Strength checks and saves, +3 damage on Strength melee attacks, and resistance to bludgeoning, piercing, and slashing damage. You can't cast or concentrate on spells. It ends early if you neither attacked nor took damage since your last turn."),
  "Frenzy": feature("Berserker barbarian · While raging",
    "When you rage you can frenzy: each turn of that rage you can make one melee weapon attack as a bonus action. When the rage ends you gain a level of exhaustion."),
  "Intimidating Presence": feature("Berserker barbarian (level 10) · Action · 30 ft · Wis save",
    "Frighten a creature that can see or hear you. You can use your action on later turns to keep it frightened.",
    ["Level 10 Berserker features"]),
  "Umbral Sight": feature("Gloom Stalker ranger · Always on",
    "You have darkvision out to 60 feet. In darkness you're invisible to any creature that relies on darkvision to see you."),
  "Iron Mind": feature("Gloom Stalker ranger",
    "You're proficient in Wisdom saving throws (or Intelligence or Charisma if you already were)."),
  "Defensive Duelist": feature("Feat · Reaction",
    "When a melee attack would hit you while you hold a finesse weapon you're proficient with, add your proficiency bonus to your AC for that attack.",
    ["Ring of Dragon Champion / Defensive Duelist", "Ring of the Dragon Champion"]),
  "Warding Flare": feature("Light Domain cleric · Reaction · 30 ft",
    "When a creature you can see attacks you, flash light to give that attack disadvantage. Uses equal your Wisdom modifier per long rest. From level 6 (Improved Flare) you can protect an ally the same way.",
    ["Improved Flare"]),
  "Divine Intervention": feature("Cleric (level 10) · Action",
    "Call on your god: roll d100, and if you roll 10 or lower (your cleric level) the god intervenes however the DM decides. If it works you wait 7 days to try again; if not, you can try after a long rest."),
  "Hide in Plain Sight": feature("Ranger (2014, level 10) · 1 minute to prepare",
    "Spend a minute making camouflage, then press against a solid surface such as a wall or tree: you get +10 to Dexterity (Stealth) checks until you move or take an action or reaction."),
  "Tireless": feature("Ranger (2024, level 10) · Magic action",
    "Gain temporary hit points (1d8 + Wisdom modifier) a number of times per long rest equal to your Wisdom modifier, and each short rest removes one level of exhaustion."),
  "Turn Undead": feature("Cleric · Channel Divinity · Action · 30 ft · Wis save",
    "Undead that can see or hear you make a Wisdom save or are turned for a minute: they must move away and can't take reactions. At level 10, undead of CR 1 or lower that fail are destroyed outright.",
    ["Destroy Undead"]),
  "Radiance of the Dawn": feature("Light Domain · Channel Divinity · Action · 30 ft · Con save",
    "Dispel magical darkness within 30 feet, and hostile creatures you choose within 30 feet make a Constitution save, taking 2d10 + your cleric level radiant (half on a success). Two Channel Divinity uses per short rest at this level."),
  "Potent Spellcasting": feature("Light Domain cleric (level 8) · Always on",
    "Add your Wisdom modifier to the damage of your cleric cantrips, so Sacred Flame deals 2d8 + 5."),
  "Darkvision": feature("Racial trait · 60 ft",
    "Within 60 feet you see in dim light as if bright and in darkness as if dim, in shades of gray only."),
  "Fey Ancestry": feature("Half-elf / elf trait",
    "Advantage on saves against being charmed, and magic can't put you to sleep."),
  "Mask of the Wild": feature("Wood elf trait",
    "You can try to hide even when you're only lightly obscured by foliage, heavy rain, falling snow, mist, or similar natural cover."),
  "Know Your Enemy": feature("Battle Master (level 7) · 1 minute of observing",
    "Watch or talk with a creature outside combat for a minute and the DM tells you if it's your equal, superior, or inferior in two things you pick, such as Strength, AC, or hit points."),
  "Student of War": feature("Battle Master · Proficiency",
    "Proficiency with one type of artisan's tools of your choice."),
  "Unarmored Defense": feature("Barbarian · No armor",
    "With no armor on, your AC is 10 + Dexterity modifier + Constitution modifier. You can still use a shield."),
  "Danger Sense": feature("Barbarian · Always on",
    "Advantage on Dexterity saving throws against effects you can see, like traps and spells, unless you're blinded, deafened, or incapacitated."),
  "Fast Movement": feature("Barbarian (level 5) · No heavy armor",
    "+10 feet of speed while you aren't wearing heavy armor."),
  "Feral Instinct": feature("Barbarian (level 7) · Initiative",
    "Advantage on initiative rolls. If you're surprised but not incapacitated, you can act on your first turn as long as you rage before doing anything else."),
  "Mindless Rage": feature("Berserker barbarian (level 6) · While raging",
    "You can't be charmed or frightened while raging; such effects pause until the rage ends."),
  "Action Surge": feature("Fighter · Once per short or long rest",
    "Take one additional action on your turn, such as a second Attack action."),
  "Second Wind": feature("Fighter · Bonus action · Once per short or long rest",
    "Regain 1d10 + your fighter level in hit points."),
  "Indomitable": feature("Fighter (level 9) · Once per long rest",
    "Reroll a saving throw you failed. You must use the new roll."),

  // ── Rogue (Roan) and his homebrew Master of Shadows subclass ──
  "Sneak Attack": feature("Rogue · Once per turn · 5d6 at level 10",
    "Add the extra dice to one hit with a finesse or ranged weapon when you have advantage, or when an ally who isn't incapacitated is within 5 feet of the target and you don't have disadvantage. Critical hits double these dice too."),
  "Cunning Action": feature("Rogue · Bonus action",
    "Dash, Disengage, or Hide as a bonus action, so you can still attack with your action."),
  "Uncanny Dodge": feature("Rogue · Reaction",
    "When an attacker you can see hits you with an attack, halve that attack's damage against you."),
  "Evasion": feature("Rogue · Dexterity saves",
    "When an effect lets you make a Dexterity save to take half damage, you take none on a success and only half on a failure."),
  "Thieves' Cant": feature("Rogue",
    "A secret mix of slang, jargon, and signs that lets rogues hide messages in normal talk or leave marks only they can read."),
  "Wrist blade": attack("Roan's weapon · Finesse · 1d6 slashing",
    "A melee weapon attack using Dexterity: d20 + 9 to hit, 1d6 + 5 slashing. Sneak Attack and Contempt for the Weak can ride on it."),
  "Razor Shuriken": attack("Roan's Q · Action · 60 ft · Homebrew",
    "A ranged weapon attack, d20 + 9, for 1d6 + 5 piercing, free. With Living Shadow up, spend 1 Shadow Energy for the shadow to throw a second shuriken at the same target from its own position: a separate roll for 1d6 piercing. Either hit can carry Sneak Attack, once per turn.", ["Q", "Razor Shuriken (Q)"]),
  "Living Shadow": feature("Roan's W · Bonus action · 1 Shadow Energy · Homebrew",
    "Create a shadow double in a space you can see within 30 feet for 1 minute (AC 17, 1 HP, immune to conditions; one at a time). It moves 30 feet on your turn for free and copies Q and E. As a later bonus action, swap places with it within 60 feet for free.", ["W", "Living-shadow swap", "Shadow swap"]),
  "Shadow Slash": feature("Roan's E · Bonus action · 1 Shadow Energy · DC 17 Dex save · Homebrew",
    "Roan and his shadow slash around themselves: each enemy within 5 feet of either saves once. On a fail, 2d6 slashing and 10 feet less speed until the start of Roan's next turn; on a save, half damage. It can't carry Sneak Attack.", ["E"]),
  "Death Mark": feature("Roan's R · Bonus action · 2 Shadow Energy · Once per short rest · Homebrew",
    "Teleport next to an enemy you can see within 30 feet and mark it until the end of your next turn, leaving a return shadow where you stood (swap back as a bonus action). When the mark ends, it takes 2d6 necrotic plus half the damage you dealt it while marked (that half at most 20). No roll or save.", ["R"]),
  "Contempt for the Weak": feature("Roan's passive · Once per turn · Homebrew",
    "When Roan hits a creature at or below half its maximum HP, it takes an extra 1d6 necrotic. The DM confirms the target qualifies. It stacks with Sneak Attack."),

  // ── Skills ──
  "Shadow vision": feature("Roan · Bonus action · Homebrew",
    "See (not hear) through your Living Shadow's eyes until the start of your next turn, while your own eyes are shut. It can't see through closed doors, so it can't scout behind one."),
  "Thieves' tools": feature("Tool proficiency",
    "Pick a lock or disarm a trap with a Dexterity check, adding your proficiency bonus. The DM sets the difficulty."),
  "Intimidation": skill("Charisma", "Pressure or frighten someone into talking or backing down. The DM sets the difficulty and decides how they react."),
  "Persuasion": skill("Charisma", "Convince someone honestly: ask, bargain, or reassure. The DM sets the difficulty."),
  "Deception": skill("Charisma", "Lie convincingly, keep a disguise's story straight, or mislead with words."),
  "Perception": skill("Wisdom", "Notice things: spot a hidden figure, hear footsteps, catch a signal."),
  "Investigation": skill("Intelligence", "Search and reason: find a hidden door, examine a lock, piece together clues."),
  "Athletics": skill("Strength", "Climb, jump, swim, grapple, or break free of a grab.", ["Break free"]),
  "Stealth": skill("Dexterity", "Move quietly or stay hidden. The DM compares it to the searchers' Perception."),
  "Acrobatics": skill("Dexterity", "Keep your balance, tumble past enemies, or slip out of a grab."),
  "Survival": skill("Wisdom", "Track creatures, find your way, hunt, and read the wilderness."),
  "Performance": skill("Charisma", "Act, sing, or play a part convincingly, like posing as a casino guard."),
  "Religion": skill("Intelligence", "Recall lore about gods, rites, holy symbols, cults, and the undead."),
  "Arcana": skill("Intelligence", "Recall lore about spells, magic items, symbols, planes, and magical creatures."),
  "History": skill("Intelligence", "Recall lore about past events, kingdoms, wars, noble houses, and famous people."),
  "Sleight of Hand": skill("Dexterity", "Pick a pocket, palm an object, plant something on someone, or do fine work with your hands unseen."),
  "Medicine": skill("Wisdom", "Stabilize a dying companion or diagnose an illness."),
  "Insight": skill("Wisdom", "Read a person: are they lying, nervous, or hiding something?")
};

// Conditions (5e), in plain words. roll: how it changes your own d20 rolls,
// shown in the dice tray. The DM's ruling wins.
export const conditions = [
  { name: "Poisoned", icon: "🤢", roll: "Disadvantage on attack rolls and ability checks.",
    text: "You have disadvantage on attack rolls and ability checks. Saving throws are not affected." },
  { name: "Prone", icon: "⤵️", roll: "Disadvantage on your attack rolls.",
    text: "You can only crawl (each foot costs an extra foot) until you spend half your speed to stand up. Your attacks have disadvantage. Attacks against you have advantage from within 5 ft, disadvantage from farther away." },
  { name: "Frightened", icon: "😱", roll: "Disadvantage on attacks and checks while you can see the source.",
    text: "While you can see the source of your fear, you have disadvantage on ability checks and attack rolls, and you can't willingly move closer to it." },
  { name: "Grappled", icon: "🤼", roll: null,
    text: "Your speed is 0. It ends if the grappler is incapacitated or you're moved out of its reach. Escape by using your action: Athletics or Acrobatics against the grappler's Athletics." },
  { name: "Restrained", icon: "⛓️", roll: "Disadvantage on attack rolls and Dexterity saves.",
    text: "Your speed is 0. Your attacks have disadvantage, attacks against you have advantage, and you have disadvantage on Dexterity saving throws." },
  { name: "Blinded", icon: "🙈", roll: "Disadvantage on attack rolls; sight-based checks fail.",
    text: "You can't see and automatically fail checks that need sight. Your attacks have disadvantage; attacks against you have advantage." },
  { name: "Deafened", icon: "🔇", roll: null,
    text: "You can't hear and automatically fail checks that need hearing. Spells with a verbal part still work unless the DM rules otherwise." },
  { name: "Charmed", icon: "💞", roll: null,
    text: "You can't attack the charmer or target it with harmful abilities or spells. The charmer has advantage on checks to interact socially with you." },
  { name: "Invisible", icon: "👻", roll: "Advantage on your attack rolls.",
    text: "You can't be seen without magic or a special sense; you count as heavily obscured for hiding. Your attacks have advantage; attacks against you have disadvantage." },
  { name: "Incapacitated", icon: "💫", roll: null,
    text: "You can't take actions or reactions (you can still move unless another condition stops you). Concentration on a spell ends." },
  { name: "Stunned", icon: "⚡", roll: "You automatically fail Strength and Dexterity saves.",
    text: "Incapacitated, can't move, and can speak only falteringly. You automatically fail Strength and Dexterity saves, and attacks against you have advantage." },
  { name: "Paralyzed", icon: "🧊", roll: "You automatically fail Strength and Dexterity saves.",
    text: "Incapacitated and can't move or speak. You automatically fail Strength and Dexterity saves. Attacks against you have advantage, and any hit from within 5 ft is a critical hit." },
  { name: "Petrified", icon: "🗿", roll: "You automatically fail Strength and Dexterity saves.",
    text: "Turned to stone: incapacitated, can't move or speak, unaware of your surroundings. Attacks against you have advantage; you auto-fail Strength and Dexterity saves, resist all damage, and are immune to poison and disease (already present ones are suspended)." },
  { name: "Unconscious", icon: "💤", roll: "You automatically fail Strength and Dexterity saves.",
    text: "Incapacitated, can't move or speak, and unaware; you drop what you hold and fall prone. You auto-fail Strength and Dexterity saves. Attacks against you have advantage, and a hit from within 5 ft is a critical hit. At 0 HP, roll death saves." },
  { name: "Exhaustion", icon: "🥵", roll: "Level 1+: disadvantage on ability checks. Level 3+: also on attacks and saves.",
    text: "Comes in six levels that stack: 1 disadvantage on ability checks; 2 speed halved; 3 disadvantage on attacks and saves; 4 HP maximum halved; 5 speed 0; 6 death. A long rest with food and drink removes one level." },
  { name: "Concentrating", icon: "🧠", roll: "Taking damage: Con save, DC 10 or half the damage (whichever is higher).",
    text: "Not a condition, but worth tracking: you're holding a concentration spell. Casting another concentration spell, being incapacitated, or failing a Con save after damage ends it." }
];

// What every character can do on their turn, plus the terms that come up most.
export const basics = [
  ["Cantrip", CANTRIP_MEANING + " Sacred Flame, Light, and Thaumaturgy are cantrips."],
  ["Your turn", "Move up to your speed, take one action, and possibly one bonus action (only if a spell or feature gives you one). Between turns you get one reaction per round."],
  ["Attack", "Make one weapon attack (more with Extra Attack). Roll d20 + attack bonus against the target's AC."],
  ["Cast a Spell", "Most spells take an action; some take a bonus action or a reaction. Leveled spells use a spell slot; cantrips don't."],
  ["Dash", "Double your movement this turn."],
  ["Disengage", "Your movement doesn't provoke opportunity attacks this turn."],
  ["Dodge", "Until your next turn, attacks against you have disadvantage and you have advantage on Dexterity saves."],
  ["Help", "Give an ally advantage on their next ability check, or on their next attack against a creature within 5 feet of you."],
  ["Hide", "Make a Dexterity (Stealth) check while out of sight."],
  ["Ready", "Pick a trigger and an action (\"if the guard opens the door, I shoot\"). When the trigger happens, you use your reaction to do it."],
  ["Search", "Look for something with a Wisdom (Perception) or Intelligence (Investigation) check."],
  ["Grapple", "Instead of one attack, grab a creature: your Strength (Athletics) against its Athletics or Acrobatics. Its speed becomes 0. To escape, it repeats the contest as its action."],
  ["Shove", "Instead of one attack, push a creature 5 feet or knock it prone: Strength (Athletics) against its Athletics or Acrobatics."],
  ["Opportunity attack", "When an enemy you can reach moves out of your reach, you can use your reaction for one melee attack."],
  ["Advantage / disadvantage", "Roll two d20s and take the higher (advantage) or lower (disadvantage)."],
  ["Saving throw", "Roll d20 + the named ability modifier (+ proficiency if proficient) to resist an effect, against the caster's spell save DC."],
  ["Concentration", "You can concentrate on only one spell at a time. When you take damage, make a Constitution save (DC 10 or half the damage, whichever is higher) or lose the spell."],
  ["Bonus action", "Only available when something specific grants it, like Healing Word, Rage, or Spiritual Weapon. One per turn."],
  ["Reaction", "One per round, used off your turn, like an opportunity attack, Warding Flare, or Absorb Elements."],
  ["Critical hit", "A natural 20 on an attack always hits, and you roll the damage dice twice."],
  ["Death saves", "At 0 HP you fall unconscious. Each turn roll a d20: 10 or higher is a success, 9 or lower a failure. Three successes stabilize you, three failures and you die. Any healing brings you back up."],
  ["Short and long rest", "A short rest (1 hour) lets you spend Hit Dice to heal and restores some features. A long rest (8 hours) restores HP, spell slots, and most features."]
];

const norm = text => text.toLowerCase().replace(/[’']/g, "").replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
const index = new Map();
for (const [name, rule] of Object.entries(rules)) {
  for (const key of [name, ...rule.aliases]) index.set(norm(key), name);
}

export function lookupRule(name) {
  const found = index.get(norm(name));
  return found ? { name: found, ...rules[found] } : null;
}

// "Flame Strike, Scrying" → two names; "Brutal Critical and Level 10
// Berserker features" → two; "Battle Master maneuvers (Trip Attack and
// others) and superiority dice" stays one rule via its aliases.
function splitNames(label) {
  const whole = lookupRule(label);
  if (whole) return [label];
  const withoutAsides = label.replace(/\([^)]*\)/g, "");
  const parts = withoutAsides.split(/,|\band\b/).map(part => part.trim()).filter(Boolean);
  // Only a list if some piece is a known rule; otherwise it's a sentence.
  return parts.length > 1 && parts.some(part => lookupRule(part)) ? parts : [label];
}

const ordinal = level => ["1st", "2nd", "3rd"][level - 1] ?? level + "th";
const spellLevelTitle = level => level === 0 ? "Cantrips" : ordinal(level) + "-level spells";

// One line under a sheet heading, so new players know what it means.
export function sectionMeaning(title) {
  if (title === "Cantrips") return CANTRIP_MEANING;
  const level = String(title).match(/^(\d+)\w\w-level spells$/)?.[1];
  return level ? "Casting one uses a spell slot of level " + level + " or higher (unless the spell says it can be cast as a ritual: 10 minutes longer, no slot). Slots come back on a long rest." : "";
}

// Lays a character out like a sheet: stats from the role line, then Attacks,
// Spells (by level), Features & traits, Skills, Table moves, and a separate
// "Confirm with the DM first" group for check lines. Each entry carries the
// built-in rule (if known) and the table's own note from the sheet.
export function organizeSheet(character) {
  const stats = String(character.role ?? "").split("·").map(part => part.trim()).filter(Boolean);
  const ready = [];
  const confirm = [];
  for (const raw of String(character.moves ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.indexOf("|");
    const tag = bar < 0 ? "any" : line.slice(0, bar).trim().toLowerCase();
    const body = bar < 0 ? line : line.slice(bar + 1).trim();
    const dash = body.indexOf(" — ");
    let label = dash < 0 ? body : body.slice(0, dash).trim();
    let note = dash < 0 ? "" : body.slice(dash + 3).trim();
    if (dash < 0 && label.length > 40) [label, note] = ["Note from the sheet", body];
    const target = tag === "check" ? confirm : ready;
    for (const name of splitNames(label)) {
      const rule = lookupRule(name);
      const shownName = rule?.name ?? name;
      const existing = target.find(entry => entry.name === shownName);
      if (existing) {
        if (note && !existing.notes.includes(note)) existing.notes.push(note);
        continue;
      }
      target.push({ name: shownName, rule, notes: note ? [note] : [], tag });
    }
  }

  const groups = new Map();
  const add = (title, order, entry) => {
    if (!groups.has(title)) groups.set(title, { title, order, entries: [] });
    groups.get(title).entries.push(entry);
  };
  for (const entry of ready) {
    const rule = entry.rule;
    if (!rule) add("Table moves", 90, entry);
    else if (rule.section === "spells") add(spellLevelTitle(rule.level), 20 + rule.level, entry);
    else if (rule.section === "attacks") add("Attacks", 10, entry);
    else if (rule.section === "features") add("Features & traits", 40, entry);
    else add("Skills", 50, entry);
  }
  const sections = [...groups.values()].sort((a, b) => a.order - b.order);
  return { stats, sections, confirm };
}
