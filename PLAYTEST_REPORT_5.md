# Playtest report, round 5: D&D Table Live

**When:** Fri 2026-11-27, on the hosted app (https://andyrbrett.github.io/DnD/), practice table **F33A**
**Who:** Claude (Claude Code, cloud session, headless browser) as DM and host. Andy as the players: all five characters, from one phone.
**Code version:** `main` at `d4b8a59` (PR #84) at the start. Fixes shipped during play in #85–#91, plus one more after.
**Purpose:** the first full game with the round-4 fixes. First time Claude ran the DM loop continuously instead of only when prompted.
**Attribution:** **[DM]** seen by Claude while running the table · **[Player]** reported by Andy · **[Code]** confirmed in the source.
**Severity:** **Critical** = loses or corrupts game state · **High** = wrong numbers or a blocked flow a group hits every session · **Medium** = confusing or easy to get wrong · **Low** = polish.

---

## What we played

| Part | What happened | What it covered |
|---|---|---|
| **The vault door** | Detect Magic on the corridor; a magic key lit one of seven lamps; the croupier statues dealt each hero a card that lit four more. | Scene posts, player actions, a rules question (does Detect Magic need a roll?) |
| **The fight** | Two **Marble Croupiers** (AC 17, 120 HP), a **Card Swarm** (AC 15, 75 HP, resists slashing and piercing), the **Vault Dealer** (AC 16, 95 HP, Sneak Attack). Four rounds, won, nobody down. | Rage and Frenzy, Action Surge, maneuvers, Living Shadow, Shadow Slash, Fireball, Flame Strike, Spiritual Weapon, Second Wind, a natural 1, enemy attacks and saves |
| **The vault** | Healing after the fight. The two onyx chips lit the last lamps and opened the vault. Two losing bets on the house's roulette wheel cost Dum Dum his Choker of Caution. Roan stole the Onyx Jewel. A Dex check to escape the closing door left the White Wizard and Arcturus inside. | Out-of-combat checks and saves, the new roll requests |

Paused at the vault door. The table stays open.

---

## 1. How the DM ran it

- **Continuous play.** A background watcher kept the DM page open, reloaded the story every 5 seconds, and woke Claude when something needed the DM. Andy asked for this after the first exchange ("I need you to continuously check and play").
- **Auto-calls.** At Andy's request, the watcher called hit or miss from the app's armor check, applied plain hits, and rolled enemy saves. It stopped for anything needing judgment: a new story line, a turn change, resistances, possible misses. About 40 calls and applies over the fight, with none wrong.
- **Mistakes on the DM side** (process, not the app):
  - "Everyone to full HP" needs a second tap, and the DM script tapped once. Players set their own HP.
  - "End combat" needs a second tap too, and the first try left the fight open.
  - The script applied a Vault Dealer hit to a raging Logan in full, and Sneak Attack had to be added by hand. Corrected by hand.
  - Auto-apply gave the Card Swarm full greataxe damage, though it resists slashing. Corrected, and fixed in #86.
  - Roan made a second wrist-blade attack he didn't have. Ruled out and the damage healed back.
  - The DM rolled Roan's Sleight of Hand instead of asking Andy to (see S5).

---

## 2. Issues found and fixed

### Combat flow

#### C1. "Attack action done" gave a free swing: **High** [Player] [Code]
After Logan's two swings the card said "Attack action done", and tapping it reset the card for another attack.
**Fixed in #85:** when the action is spent and no bonus-action attack is left, the button reads **Done attacking: end your turn ▲** and takes the player to the turn card. A DM-approved extra swing sits under *Other choices* and takes two taps.

#### C2. One-attack characters were sent back to "Pick a weapon": **High** [Player]
Roan has one attack per action. After he sent damage, the card went back to Roll to hit and the turn guide said "Pick a weapon…". The White Wizard saw "Next attack" after his Guiding Bolt.
**Fixed in #85:**
- The guide says "You've used your action this turn. End your turn" and lights End my turn.
- If a bonus-action attack is still open, the card names it: **Bonus action left: Spiritual Weapon**.

#### C3. "Pick a bonus action" when there wasn't one: **Medium** [Player]
Roan's Living Shadow had already used his bonus action.
**Fixed in #85:**
- The prompt only offers a bonus action that's actually left.
- Roan's sheet explains that the shadow's copied Q goes only with his own Q throw.

#### C4. Bonus-action choices included unusable attacks: **Medium** [Code] (Codex on #85)
**Fixed in #85:** Shadow Slash with no Shadow Energy, or a Spiritual Weapon with no slot, no longer counts as "left".

#### C5. Auto-scroll to End my turn: **Medium** [Player]
**Done in #86:** when the action's last attack is settled, the screen glides up to the turn card. It eases over 1.4 seconds (Andy found the first version too fast), and is instant with reduced motion.

#### C6. No Frenzy attack: **High** [Player]
The DM ruled Logan's Frenzy swing in, but the card had no such attack. Logan rolled it in the plain tray, then sent the to-hit total (15) as damage.
**Fixed in #87:** **Greataxe (Frenzy)** is a bonus-action attack, offered only while raging.

#### C7. Only attacks counted against the turn: **High** [Player] [Code]
Andy asked for every similar case, not just Frenzy. Rage, Living Shadow, Death Mark, Healing Word, Second Wind and a Hunter's Mark cast didn't use up the bonus action. Turn Undead and a potion didn't use up the action.
**Fixed in #87:**
- Each one now counts, read from the feature's rule header ("Bonus action" / "Action").
- The 5e bonus-action spell rule is enforced: the other spell that turn can only be a cantrip. A Spiritual Weapon already up from an earlier turn still attacks.
- No Frenzy on the turn the rage starts (Codex).

#### C8. The DM's turn tally reset on reload: **Low** [DM] [Code]
"1 attack so far · raging" went back to "No attacks yet" after a reload.
**Fixed in #85:** the turn's start mark is kept on the device.

#### C9. No resistance half for the DM: **Medium** [DM]
**Fixed in #86:** when an enemy's notes mention resistance, Hits to apply shows the note and a **Resists: N** button.

### Story mode

#### S1. Out-of-combat rolls had none of combat's help: **High** [Player]
Andy: "The DM told me to roll a shuriken attack but I don't have that option anywhere really. I would have to manually roll it and calculate my advantages +'s."
**Fixed in #91, roll requests:**
- The DM tab's **Ask for a roll** picks who, the roll (18 skills, ability checks, saves, attack), a DC or AC, and a note.
- Each player gets a gold card with one-tap buttons that carry their bonus.
- The answer posts with "✓ meets DC 12" or "✗ under DC 12".
- An attack ask stays open for several rolls (Roan's Q plus the shadow's copy).
- Codex: each answer closes only one request, and a repeated ask redraws.

#### S2. The Saving throw chip rolled a bare d20: **High** [DM]
Dum Dum's and Arcturus's Charisma saves posted with no modifier.
**Fixed in #90:**
- **Saving throw** and **Check** ask which ability, with proficient saves in gold.
- The Stealth, Perception, Investigation and Athletics chips, and a typed skill name, add the bonus.
- #91 added Attack and Damage lists.
- Codex: changing the purpose no longer posts under the old label.

#### S3. Heal buttons looked like headings: **Medium** [Player]
**Fixed in #88:** outlined green buttons with a "Roll ▸" pill, readable on every theme.

#### S4. Earlier updates got long: **Medium** [Player]
**Fixed in #88:**
- Long posts fold to a preview with **See more**.
- Earlier updates load 10 at a time.

#### S5. The DM rolled a player's check: **Medium** [Player]
Roan's Sleight of Hand was rolled by the DM. Andy asked whether that's normal. It isn't: players roll their own checks. The DM agreed to roll only for the house and for secret checks. Roll requests (#91) make asking quick.

#### S6. Item mix-up: **Medium** [Player]
**Fixed in #89:** the Choker of Caution is Dum Dum's and the Third-eye amulet is the White Wizard's, on the sheets and on this table's roster.

### After the game (this PR)

#### A1. Frenzy's exhaustion was manual: **Medium** [DM]
The DM had to remind Logan.
**Fixed:** a Frenzy swing marks the rage on the barbarian's phone, and when the rage ends that phone adds a level of Exhaustion. The rage can end by End rage, the DM's End combat, or a rest. The flag lives on the phone because the server keeps only `used` and `raging` for resources, so no migration is needed.

#### A2. Stepping exhaustion posted every step: **Low** [DM]
Logan's 1 → 2 → 3 → 1 posted four lines.
**Fixed:** stepping posts one line once the taps stop, and nothing if it ends where it began.

#### A3. Resistance on save-spell damage: **Medium** [DM]
Roan's Shadow Slash (slashing) hit the Card Swarm, which resists slashing, and the save roll applied full or half with no resistance.
**Fixed:** Hits to apply finds the hit's damage type on the attacker's sheet. When the enemy's note names that type ("Resists slashing and piercing"):
- **Save spells:** the save button says "· resists slashing" and halves again after the save.
- **Attack hits:** the **Resists** button becomes the main one.

A fire spell on the same swarm is not halved.

---

## 3. Player behavior (Andy)

- Played all five characters from one phone and followed the red button.
- Probed the rules:
  - Living Shadow plus a wrist blade (C3), Frenzy (C6), a second wrist blade (ruled out).
  - Does Detect Magic need a roll?
  - Should the DM roll my Sleight of Hand?
- Steered the tooling as much as the story: asked for continuous DM play, auto hit/miss calls, a slower scroll, buttons that look like buttons, and roll help outside combat.
- Typed intentions in the story box ("Logan attacks Croupier 1, then makes a Frenzy bonus-action attack"). These were useful to the DM before the dice arrived.

---

## 4. Not covered

- **Death saves:** nobody went down.
- **Rests:** the game paused before one; Frenzy's rest path is checked locally only.
- **Ask Claude:** not used this session.
- **Real dice:** not used.
- **The TV board.**
- **Roll requests on a real phone:** they went live as the game paused. They were tested on the hosted backend from a second browser.

---

## 5. Open items

| Item | Status |
|---|---|
| Roll requests on the local (laptop) server | Deferred: local tables have no story actions at all (PR #91 comment) |
| Resistance on save-spell damage | Fixed after the game (A3) |
| F7 from round 4 (duplicate to-hit post) | Not seen this round |
| F8 from round 4 (DM view missing a call ending) | Not seen this round |
