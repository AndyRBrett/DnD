# Playtest report: D&D Table Live

**When:** Tue 2026-11-24, about 12:00–2:15 PM CST, on the hosted app (https://andyrbrett.github.io/DnD/), practice table **8C37**
**Who:** Claude (Claude Code, desktop) as DM and host. **Muse** (Meta's Muse.app, agent "Molly") as the players: all five characters from one login.
**Code version:** `main` at `a6b263d` (PR #48)
**Sources:** this report combines Claude's DM-side observations, Muse's player-side feedback (`dnd-playtest-feedback.pdf`), and a read of the code. Attribution: **[DM]** seen by Claude while running the table · **[Player]** reported by Muse · **[Code]** confirmed by reading the source · **[Both]** seen from both sides.

Severity: **Critical** = loses or corrupts game state · **High** = wrong numbers, a blocked turn, or a broken flow a group will hit every session · **Medium** = confusing or easy to get wrong · **Low** = polish.

---

## What we played

| Part | What happened | What it covered |
|---|---|---|
| Opening | Elevator to the vault level; the White Wizard studies the runes (Arcana 5), Roan sneaks to the staff door (Stealth 8 → spotted). | DM scene updates, player actions, shared rolls |
| **Fight 1** (checkpoint) | Violet Mage + 2 Black Guards (built-in Mage and Veteran stat blocks), 3 rounds, won. | Initiative, turn order, Rage, Reckless, Sacred Flame, the DM's enemy attacks with Target / Apply / Half, the hit inbox, "End my turn", downed enemies, End combat, TV board |
| Staff room | Arcturus searches the papers (INT check 9), Roan checks the lockbox (d20 2). Breaking the seal fires the ward: 80 lightning → the White Wizard drops to 0, fails one death save (8), a potion brings him back to 5. Short rest. | Skill checks, a player at 0 HP, death saves, healing someone up from 0, short rest |
| **Fight 2** (vault) | A custom **Vault Guardian** (AC 17, 120 HP, saved as a template) + 2 Ogres, 3 rounds, won. An Ogre's crit drops the White Wizard (2 → 0). | Custom enemies, Great Weapon Master, Hunter's Mark, Dread Ambusher, Trip Attack, Action Surge, Second Wind, Healing Word, Concentrating, Fireball at 4th level, crits both ways, Ask Claude, mid-fight reload, editing your own action |

The test list given to Muse (15 items) is in the appendix: 11 done, 1 partial, 3 skipped or blocked.

---

## 1. Crashes and bugs

### B1. The DM's encounter changes are silently lost: **Critical** [Both] [Code]
- **Steps:**
  1. Run combat as the DM.
  2. Tap **Apply** on a hit in *Hits to apply*, use an enemy card's **Damage**, or **Add to encounter**.
  3. Within about a second, the page goes into the background and comes back (phone lock/unlock, app switch, notification shade).
- **Expected:** The change sticks.
- **What happened:** The change is reverted with no warning. The hit leaves the inbox (marked handled), but the HP snaps back. About **12 lost changes across 2 fights**: Sacred Flame 21 and 9 (the second lost twice), Logan 18 and 27, Arcturus 16 (lost on Apply *and* on the manual re-apply), two manual Damage taps, and **two newly added Ogres** (the status said "Added 2 × Vault Ogre", the list showed only the Guardian). Reproduced on demand: Damage 1 (54 → 53), then a `pageshow` event, and HP was back at 54. "Saved with the table" stays on screen throughout. From the player side, Muse saw enemy labels flip **Bloodied → Healthy → Bloodied**, which is the same bug.
- **Cause:** When the page comes back into view, `loadCloudEncounter()` (`src/app.js:2703`) runs. It keeps the cloud copy if `saved.updated > localAt` (`app.js:2710`), but `saved.updated` comes from the **server clock** (`updated_at = now()`) and `localAt` from the **phone's clock** (`Date.now()`). This Mac was about 5 minutes behind Supabase. The local save is delayed by 800 ms (`encounterTimer`) and isn't cancelled or awaited, so a reload in that window overwrites the edit. With a phone clock that runs fast, the reverse can happen (an old copy on one device overwrites the cloud when the DM switches devices) *(not observed)*.
- **Note:** the test browser pane switched between hidden and visible every ~6 s, which made the bug much more frequent. On a real phone it takes one unlock at the wrong moment plus a few seconds of clock difference.
- **Fix idea:** Compare versions on one clock (store the server's `updated_at` returned by `dnd_encounter_save`, or use a version counter). Skip or merge the cloud reload while a save is pending. Warn when a remote copy replaces local changes.

### B2. A character without a full sheet can't play: **High** [Both] [Code]
- **Steps:** Start combat, pick **Roan the Last Shadow**, open Combat → Attack.
- **Expected:** Some way to attack, and to track HP and rests.
- **What happened:**
  - The Attack card is empty; Muse was stuck on Roan's first turn until told to make up numbers (+7, 1d8+4) and roll in the tray.
  - Roan also has no HP controls (Muse's "max HP 70" never saved; the TV board shows "HP not set"), no skills, and no Short or Long rest buttons, so the DM's "everyone tap Short rest" couldn't be done for him.
  - For two rounds he could only repeat a "distraction" move.
  - The DM's **Edit character sheets** can't fix it: the Attack card reads only the fixed `sheets` object in `src/campaign.js` (`app.js:2249`), and the editor changes only the free-text ability list.
- **Fix idea:** A "custom attack" form on the Attack card (name, +hit, damage), plus HP and rest controls for every character, sheet or not.

### B3. Leftover attack and dice settings carry over to the next roll: **High** [Both] [Code]
Three related leaks:
- **a. One-shot options stay on.** Attack options persist between attacks (`resetAttack(true)` keeps `attackFlow.options`, `app.js:2216`).
  - *Dread Ambusher* (+1d8, meant for **one** attack on the first turn) was added to every shot: 31 damage in fight 1, **40 instead of about 34** in fight 2.
  - The *Maneuver (+1d10)* box stays ticked after use, so the next attack adds another d10 and spends another superiority die.
  - The opposite happens with *Reckless* and *Great Weapon Master*: they're cleared on every character switch and on reload (`resetAttack(false)`), so on a shared phone the player has to turn them on again every turn.
  - **Fix idea:** give each option a lifetime: `once` (Dread Ambusher, maneuver), `turn` (Reckless), or `toggle` (Great Weapon Master, Raging).
- **b. Advantage carries over in the dice tray.** `openDice()` (`app.js:1227`) resets the dice and modifier but not `dice.mode`. Logan's Reckless advantage carried into Arcturus's Investigation check, into initiative rolls, and into Roan's attack (caught 3+ times). Death saves would be affected the same way. **Fix:** reset to Normal on open unless the caller sets a mode.
- **c. The wrong spell-slot level appears on weapon attacks.** Hit reports read "with **Greataxe (2nd-level)**", "Longbow (2nd-level)", and after the Fireball, "Weapon attack (**4th-level**)". Character switches don't clear `attackFlow.level`, and `app.js:2431` adds it even to attacks that don't use a slot. **Fix:** clear `level` on switch, and only add it when `baseAttack.slot` is set.

### B4. Player posts get buried, cut off, or lost: **High** [Both]
- **a. Buried when the DM publishes.** Anything posted while the DM is typing moves into the collapsed *Earlier updates* when they tap **Publish update**. It happened twice: Roan's Stealth 8, and Arcturus's "🎲 INT check: 9", which the DM thought was missing until Muse pointed it out. Both times the DM ruled without the roll.
- **b. Cut off at 300 characters.** The action box (`index.html:168`, `maxlength="300"`) silently stops, so posts end mid-word ("…to listen and peek t"). There's no counter.
- **c. Lost when combat starts.** If the DM taps **Start combat** while a player is typing, the player's phone jumps to the Combat tab and the draft is never posted. Roan's lockbox-disarm action was lost this way, and the lockbox stayed trapped.
- **Fix idea:** keep posts that arrive after the DM starts typing in *Since then* (or mark them unread); add a counter or raise the limit (the database `check` allows 300); don't switch tabs while the action box has text.

### B5. Rolls from the plain dice tray aren't labeled: **High** [Both]
- Sheet-tile rolls are labeled ("🎲 INT check: 9"), but rolls from the plain tray post as "Roan the Last Shadow: 🎲 d20: 8", so the DM has to guess whether it was Stealth, an attack or a save. Roan has no tiles at all, so all of his rolls are unlabeled.
- **Fix idea:** when *Share with the table* is ticked on a tray roll, ask what it's for (chips: Stealth, Perception, Attack, Save…).

### B6. Typing into the hidden scene box does nothing: **Low** [DM]
- After a reload, *Transcript and manual updates* is collapsed. Typing and tapping **Publish update** does nothing and shows no error. The DM's first opening scene was lost this way.

### B7. Applied hits update late: **Low** [DM]
- The hit leaves the inbox at once, but HP changes 2–5 s later, which invites a second Apply. (Separate from B1, where the change never lands.)

### B8. The DM tab redraws itself constantly: **Low** [DM]
- About 14 redraws every 10 s while idle; buttons are replaced within a second. Form values survived, but phone taps can land on a replaced button.

### B9. Reload shows a blank screen for ~15 s: **Low** [Player]
- After a mid-fight reload, the page is an empty shell for about 15 s, then everything comes back correctly (character, HP, rage, turn, resources, Concentrating).

### B10. The 3D dice landed on a different number than the result: **Low** [Player, unverified]
- The dice showed 11 while the posted result was 3.

---

## 2. Rules and gameplay errors (5e)

**Correct, and worth keeping:**
- Sheet numbers: slots (cleric 10 4/3/3/3/2, ranger 10 4/3/2), Channel Divinity 2, Warding Flare = Wisdom, Rage 4 uses at +3, Brutal Critical, superiority dice 5×d10, maneuver DC 16, Second Wind 1d10+10, max HP (Logan 115, Dum Dum 94), spell DCs and attack bonuses, enemy stat blocks.
- In play:
  - The Great Weapon Master + Reckless line ("d20 + STR +4 + Prof +4 + Great Weapon Master −5 = +3 · 1d12 + STR +4 + Raging +3 + Great Weapon Master +10"), checked 3 times.
  - Crits: a Battle Master crit doubled both the weapon and maneuver dice (2d8+4+2d10 = 21), and an Ogre crit on a player doubled correctly (4d8+4 = 18).
  - Fireball at 4th level: 9d6, spent a 4th-level slot, and the inbox offered "Saved: 20" for half.
  - Bloodied at half HP or less; resistance halving (6 → 3); concentration DC = max(10, half the damage); death-save logic; party first on initiative ties.

### R1. Hunter's Mark costs nothing, and slot spending is inconsistent: **High** [Both] [Code]
- *Hunter's Mark* (`campaign.js:334`) adds +1d6 but **never spends a 1st-level slot** and never marks Concentrating. Muse checked: the 1st-level slots read 4/4 before and after casting. (Moving the mark later *should* be free, and it is.)
- Fireball spends its slot when you tap "Roll damage". Healing Word only spends one if the player taps a slot dot by hand. Three spells, three behaviors.
- Hunter's Mark and Great Weapon Master are also offered even though the sheets list them as **unconfirmed**.
- **Fix idea:** `spends: "slot:1"` plus setting Concentrating for Hunter's Mark; hide options the sheet hasn't confirmed until the DM approves them.

### R2. Healing and short rests are manual or missing: **High** [Both] [Code]
- **Healing Word has no cast button** (not on the Attack card or the sheet): roll 1d4+5 in the tray, tap a slot dot, enter Heal.
- **Second Wind**: the tap spends the use but **doesn't roll or heal**; the player has to roll 1d10+10 and tap Heal.
- **Short rests can't heal**: there are no Hit Dice anywhere in the code, yet the help text says a short rest "lets you spend Hit Dice to heal". The White Wizard stayed at 5/75 through a short rest. Potions and other items aren't tracked; the DM rolled the potion (2d4+2) outside the app.
- **Fix idea:** a "heal" kind of attack entry (roll → apply to self or an ally), Second Wind rolling and healing in one tap, and Hit Dice per character as a resource on the short rest.

### R3. Rage never ends: **Medium** [Both] [Code]
- Logan stayed "😤 Raging" after End combat **and** a short rest; `rest()` (`encounter.js:340`) only clears it on a long rest, and nothing ends it after combat. The +3 and the resistance carry into the next fight, and Ask Claude read the stale "raging at 95/115". Muse ended it by hand with **End rage**.
- **Fix idea:** end the rage when combat ends, or after 10 rounds.

### R4. Concentration isn't tracked: **Medium** [Both] [Code]
- No reminder appears when a Concentrating character takes damage, from the DM or anyone else. The "🧠 Concentration save" message only shows when the player enters damage on their own phone (`app.js:1557`); otherwise there's just a general reminder in the dice tray. The save happened only because the DM asked for it in the narration.
- Concentrating can be marked with no concentration spell running, and stays marked after casting Fireball (which doesn't need concentration).
- **Fix idea:** whenever HP drops on a Concentrating character, show the DC on their phone and the DM's; set and clear Concentrating from the spell that was cast.

### R5. The DM has to resolve saves, maneuvers and unconfirmed ACs by hand: **Medium** [Both]
- **Enemy saves:** save spells reach the inbox as Apply / *Saved: half* / Dismiss, but nothing rolls the enemy's save, and the enemies have no save bonuses. The DM rolled 4 saves outside the app.
- **Maneuvers:** there's one generic "Maneuver (+1d10)" box, and the hit report says only "with Weapon attack", so the DM isn't told it was a Trip Attack or that a DC 16 Strength save to avoid falling prone is due.
- **Unconfirmed AC decides hits:** Dum Dum's AC is "18–20, unconfirmed" ("AC 20?" in Party HP), but the 🎯 Target list and TV board show a plain **AC 20**. In fight 2 a Slam rolled 19 and the app called it a **miss**; at AC 18 it was a hit for 21.

### R6. Logan's initiative skips Feral Instinct: **Medium** [Code]
- His **Roll initiative** button rolls a plain `d20+2`; "+2 adv." is reduced to "+2" (`rollableFrom`, `app.js:1359`). Combined with B3b, the tray may or may not happen to be on Advantage.

### R7. Players don't use their full turn: **Medium** [DM]
- Dum Dum used 1 of 2 Extra Attacks in one round, Arcturus ended a turn without attacking, and in fight 1 the Dread Ambusher third shot was skipped. Nothing says "1 attack left in this Attack action".

### R8. Built-in enemies are too weak for level 10: **Low** [DM]
- The strongest is around challenge rating 2–3 (Veteran, Bandit Captain, Ogre). Fight 2 only worked because of a custom enemy. Add challenge rating 5–9 options.

### R9. Death saves are only on one phone: **Low** [Both] [Code]
- They're stored in that phone's local storage (`app.js:1784`). After rolling, the dialog gives no "recorded" state (Roll greys out, the dialog stays open). Damage taken at 0 HP is a manual tap. Three successes or failures was **not tested**.

---

## 3. Muse (the AI player) quality

| # | Issue | Severity | What happened |
|---|---|---|---|
| M1 | **Too slow to play live** | High | 2–5 minutes per character turn; a 5-character round took 15–20 minutes. It checks the table by starting a fresh cloud browser each time, so it often saw old state (e.g. "still the Mage's turn" minutes after it had passed). It needed reminders that updates had arrived until Andy set up "longer chained checks". |
| M2 | **Decides outcomes and rules itself** | Medium | Roan's distraction granted "allies get advantage on their next attack" (not a 5e rule; the closest is Help, which gives advantage to one ally). It called its own hits and misses without knowing the enemy's AC, and called **11 against AC 11 a miss** (meeting the AC hits). |
| M3 | **Plays from an out-of-date view** | Medium | Roan attacked Vault Ogre 1 after it was down; Dum Dum's natural 20 went at the already-downed Guardian (the app's target list only offers standing enemies, so this came from Muse's old view). |
| M4 | **Repeats itself** | Medium | The same "wild distraction" text in rounds 2 and 3. |
| M5 | **Posts the whole party from one character** | Medium | The first post put the whole party's plan in the White Wizard's box. Fixed after feedback. |
| M6 | **Made false claims about the app** | Medium | It said the DM's sheet editor would add attacks to the Attack card (false, see B2) and that Roan's max HP was set to 70 (it never saved). |
| M7 | **Strong tester** | Good | It worked through the 15-item list and verified numbers (the Great Weapon Master math line 3 times, slot counts before and after, initiative +7), never double-posted across 25+ turns, caught the advantage leak, Dread Ambusher stacking and the Hit Dice text, and corrected the DM about the "missing" roll. |

**Recommendation:** Muse is a good automated tester, but too slow to sit at the table with friends. Muse suggested a real-time listener on the app's live feed itself; until then, use it for test runs, not live sessions.

### Ask Claude (the app's own AI) [Player]
- **Works:** 3 taps (1 on the scene, 2 "💡 What should I do this turn?"), about 60 s each, no errors. Answers gave the bigger picture plus three options with "How it works" and a question for the DM. It **suggested nothing spent or unconfirmed** (no Great Weapon Master or Hunter's Mark), got round counting right, and correctly left out Dread Ambusher in round 2.
- **Issues:**
  - It reads stale app state (Logan's leftover rage, R3).
  - It's buried in the Moves tab under the quick ideas, and the answer stays on the asker's phone unless they tap "Add to story".
  - 60 s is long for a combat turn.

---

## 4. UX friction for a group of friends

| # | Issue | Severity | Suggestion |
|---|---|---|---|
| U1 | **One DM can't keep up.** Applying hits, rolling enemy saves outside the app (R5) and narrating left the DM three turns behind; the app kept turns moving fine. [Both] | High | One-tap enemy saves; an automatic story line when the DM applies a hit ("Black Guard 2 takes 21 radiant"); a "narrate later" queue. |
| U2 | **The DM can't see who has joined** until they post. [DM] | Medium | "Players here: …" on the DM tab. |
| U3 | **Shared phones credit the wrong character.** Nothing prompts switching the character before posting; the first post credited the whole party to the White Wizard. [Both] | Medium | "Posting as LOGAN" in the action box, or a "post as…" picker. |
| U4 | **Party HP starts as "Not set".** The DM taps "Start at full" 4 times before the first fight. [DM] | Medium | Practice tables start at full, or one "Everyone to full" button. |
| U5 | **The scene box is folded away** for DMs not using the mic (B6). [DM] | Low | Remember whether it was open, or open it when the mic is off. |
| U6 | **"Longsword (×2)" rolls one attack per tap.** [DM] | Low | Relabel it, or add a "Roll multiattack" button. |
| U7 | **The TV board shows unconfirmed ACs** as fact ("AC 20"). [DM] | Low | Keep the "?". |
| U8 | **Renaming a character drops their sheet** (`sheets[name]`). [Code] | Low | Use a stable ID. |
| U9 | **The death-save card has no "recorded" state** (R9). [Player] | Low | "Recorded: 1 failure", then close. |
| U10 | **The last turn stays open after the last enemy falls** (Logan's round-3 turn stayed open until End combat). [Player] | Low | Offer "End combat?" when 0 enemies are standing. |

---

## 5. What worked well [Both]

Sign-in and joining by link; switching characters; initiative order and ties; turn passing including "End my turn" from a player's phone (hidden when it isn't your turn); downed enemies skipped, including one that drops on its own turn; round wrap-around; End combat hides the Combat tab; reload restores everything; editing your own action (the DM sees the edit); custom enemies and **Save as my template**; the DM's to-hit-vs-AC check and the inbox's "✓ vs AC"; a crit on a player shown clearly; Rage, superiority dice, Action Surge and Fireball slots counting down; the multi-target send ("Pick another target to send the same roll"); the TV board hiding enemy HP; the practice-table banner; zero double-sends across 25+ turns.

## 6. Not tested

- **Spiritual Weapon** (cast, then a free attack): blocked, because the caster was down.
- **Fireball on two targets**: only one enemy was left standing.
- **Ending the table and checking campaign history** (a practice table should add nothing): left open on purpose; **table 8C37 is still open** and closes itself after 8 hours idle.
- **Death saves to 3 successes or failures**, and **Logan's crit dice (3d12)**: skipped (crit math confirmed in the code).
- **Long rest**, **the mic and transcription**, a **second human player** on a separate device.

---

## Top 5 fixes, in priority order

1. **B1: Stop losing the DM's encounter changes.** Compare server time with server time (or use a version number), and never let a cloud reload overwrite a save that hasn't finished. About 12 lost changes, including newly added enemies, in two fights. It quietly changes who wins.
2. **B3 + R1: Make attack and dice state predictable.** Give each option a lifetime (Dread Ambusher and maneuvers once, Reckless per turn, Great Weapon Master as a toggle), reset the tray to Normal each time it opens, clear the stale slot label, and spend a slot for Hunter's Mark the same way as Fireball. These caused wrong damage (Dread Ambusher +6 per volley), extra superiority dice spent, and unearned advantage. The same advantage leak would hit death saves.
3. **B2: Let characters without a full sheet play.** A custom attack plus HP and rest controls for everyone. Roan was stuck on his first turn and sat out most of both fights.
4. **B4 + B5: Don't bury, cut off or lose what players post.** Keep posts that arrive while the DM is typing in *Since then*, label tray rolls, keep the player's draft when combat starts, and add a character counter. The DM ruled twice without seeing a roll, and one action was lost.
5. **R2 + R4 + U1: Take routine bookkeeping off the DM and players.** Buttons for healing spells and Second Wind, Hit Dice on short rests, concentration reminders whenever a Concentrating character takes damage, and one-tap enemy saves. These are what put a single DM three turns behind.

Runners-up: R3 (end rage when combat ends), R5 (unconfirmed ACs and maneuvers), R6 (Feral Instinct), B9 (reload delay).

---

## Appendix: the 15-item test list given to Muse

| # | Test | Result |
|---|---|---|
| 1 | Healing Word spends a 1st-level slot | ✅ only by tapping the slot by hand; no cast button (R2) |
| 2 | Fireball at 4th level on both Ogres | ◐ 9d6 and slot spend ✅, half on a save offered ✅, two targets not testable |
| 3 | Concentrating plus a reminder on damage | ❌ no reminder on damage (R4) |
| 4 | Spiritual Weapon: cast, then a free attack | ⛔ blocked (caster down) |
| 5 | Rage + Reckless + Great Weapon Master math | ✅ exact, 3 times |
| 6 | Logan's natural 20 → 3d12 | ⏭ skipped (Battle Master crit verified instead) |
| 7 | Trip Attack spends a superiority die | ✅ 5 → 4 → 3 (but the box stays ticked, B3a) |
| 8 | Action Surge + Second Wind | ✅ uses spent; Second Wind doesn't heal (R2) |
| 9 | Arcturus's initiative uses +7 | ✅ 17 = 10 + 7 |
| 10 | Hunter's Mark spends a slot | ❌ no slot spent, as predicted (R1) |
| 11 | Ask Claude on your turn | ✅ nothing spent or unconfirmed; reads stale rage |
| 12 | Reload mid-fight | ✅ fully restored after ~15 s blank (B9) |
| 13 | Edit your own action | ✅ |
| 14 | "End my turn" when it isn't your turn | ✅ the button is hidden |
| 15 | Death-save card after 3 successes or failures | ⏭ skipped; no "recorded" state (R9) |
