# Playtest report, round 2: D&D Table Live

**When:** Wed 2026-11-25, on the hosted app (https://andyrbrett.github.io/DnD/), practice table **477F**
**Who:** Claude (Claude Code, cloud session, headless browser) as DM and host. **Muse** ("Molly") as the players: all five characters from one browser.
**Code version:** `main` at `54bc99c` (PR #62), after the round-1 fixes in PRs #50–#62
**Purpose:** check the round-1 fixes at a live table, and cover the use cases round 1 skipped or blocked.
**Attribution:** **[DM]** seen by Claude while running the table · **[Player]** reported by Muse · **[Code]** confirmed in the source.
**Severity:** same scale as round 1. **Critical** = loses or corrupts game state · **High** = wrong numbers or a blocked flow a group hits every session · **Medium** = confusing or easy to get wrong · **Low** = polish.

---

## What we played

| Part | What happened | What it covered |
|---|---|---|
| **Fight 1** | 3 rounds against built-in stat blocks, won. | Initiative, rage, the Attack card, multi-attack in one tap, Dread Ambusher, Trip Attack and Action Surge, Hunter's Mark, Spiritual Weapon, the hit inbox, End combat |
| **Fight 2** (vault) | A custom **Rune Golem** (AC 17, 100 HP, saved as a template), 2 Vault Sentries, and a Shadow Assassin. 3 rounds, won. The White Wizard dropped to 0 from Golem slams, a shortsword hit, and the Assassin's poison (failed DC 15 Con save). | Custom enemies and templates, Fireball with one-tap Dex saves, Spirit Guardians with a Wis save, enemy attacks with Apply / Half, poison save, a PC at 0, death saves |
| **After the fight** | The White Wizard rolls to stable, spends a Hit Die, drinks a potion. Short rest. Ask Claude on the scene. Long rest attempted. | Death saves, healing from 0, Hit Dice, short rest refills, potions, Ask Claude, long rest |

Pauses: Muse went quiet for about 100 minutes mid-fight 2, and the DM's browser hit its 2-hour limit and was restarted (the saved login made that painless).

---

## 1. Round-1 fixes: verified

| Fix | Result | Source |
|---|---|---|
| **B1** encounter changes survive the page hiding and showing again | ✅ Changes stuck after simulated `visibilitychange` / `pageshow` | [DM] |
| **B3a** one-shot options (Dread Ambusher) switch off after one attack | ✅ | [DM] |
| Superiority dice count down with maneuvers and refill on a short rest | ✅ 5 → 0 across Trip Attacks, back to 5/5 (plus Action Surge 1/1) after a short rest | [DM] [Player] |
| **U2** "At the table" presence | ✅ works, but flaky when one browser plays several characters (see N11) | [DM] |
| **U4** Everyone to full HP | ✅ | [DM] |
| **U6** "3 × Spear" rolls every swing in one tap | ✅ | [DM] |
| **U9** death saves | ✅ mostly: each save posts to the table ("💀 death save 13: success (2 ✓ / 0 ✗)"), records, and the button disappears at stable. But nothing limits it to one save per turn (N4) | [Player] [DM] |
| **U10** End combat offered when every enemy is down | ✅ | [DM] |
| **R1** Hunter's Mark spends a slot and posts Concentrating | ✅ slots 4 → 3 | [DM] |
| **R3** rage ends on End combat | ✅ (checked twice: once in fight 1, once after fight 2) | [DM] |
| **R4** damage on a player's card posts "🩸 takes N damage" | ✅ the post works. The concentration-save prompt went untested (see Not covered) | [DM] |
| **R5** one-tap saves on spell hits, half on a save | ✅ "Roll Dex save (+1)" on Fireball, "Roll Wis save (+0)" on Spirit Guardians | [DM] |
| Fireball on two targets with one damage roll, slot spent | ✅ | [DM] |
| Spiritual Weapon's later attacks cost no slot | ✅ | [DM] |
| Custom enemy + **Save as my template** | ✅ "★ Rune Golem (yours)" in the list | [DM] |
| *To narrate* counts inbox applies | ✅ | [DM] |
| Hit Die healing on a short rest | ✅ 0 → 5 HP, 9 of 10 dice left | [Player] |
| Healing potion from the Resources card | ✅ 5 → 12 HP, potions 3 → 2 | [Player] |
| **Ask Claude** on the scene | ✅ about a minute; the bigger picture plus three options (Detect Magic on the plinth, heal then rest, study the staff-room papers), each with "Add to story" | [Player] |
| Roan's full sheet (PR #61): wrist blade +9, 1d6+5, Sneak Attack 5d6 | ✅ attacks and Sneak Attack rolled from the sheet | [DM] [Player] |

---

## 2. New issues

### N1. A re-roll for advantage doesn't update the hit that's sent: **High** [DM]
- **Steps:** roll an attack, then re-roll in the dice tray for advantage (outside the Attack card's own Advantage option), and send the hit.
- **What happened:** the report sent the *first* roll. Roan's natural 20 arrived as "15 — a miss?", and the crit dice weren't doubled.
- **Fix idea:** whatever d20 the tray shows last should drive the to-hit and the crit, or the tray should block a re-roll on a pending attack and point to the Advantage option.

### N2. Two DM screens can apply the same hit twice: **High** [DM] [Code]
- **What happened:** Muse joined while signed in to an account on the host list (see N3), so its browser was a second DM screen. Its *Hits to apply* still listed four Golem hits the DM had already applied (12 + 19 + 11 + 10 = 52), with live **Apply** buttons. It applied them again, and the Golem dropped from 48 to 0 with no new attacks.
- The two DM screens also disagreed: 26 damage Muse put on the Assassin from its screen never showed on the DM's screen.
- **Cause:** which hits have been applied, and the encounter's HP, are tracked on each device.
- **Fix idea:** record "applied" on the action itself (server side), and let the server's encounter copy win across DM screens. Rare at a real table, but a co-DM or a second tablet would hit it.

### N3. A host account that joins by link sees only DM tools, with no explanation: **Medium** [Player] [Code]
- **What happened:** Muse's browser was signed in to a host account. The Moves tab showed only Ask Claude (`src/app.js:1234`), there was no weapon card or Send button, and the Sheet had no **Roll death save** (`app.js:1901`, players only). Muse spent a turn hunting for buttons, typed hits as text, and used the DM tab's Damage and **Next turn** buttons. That's how the Golem got double-applied and turns advanced on their own.
- **Fix idea:** when a host opens a table they didn't start (or picks a character), say "You're signed in as a DM: player tools are hidden" and offer a "Play as a player" view.

### N4. Death saves aren't limited to one per turn: **Medium** [Player] [Code]
- **What happened:** after each recorded save the tray closed, but **Roll death save** stayed live on the Sheet, and the White Wizard rolled all four saves (14, 13, 6, 14) in one turn to reach stable.
- **Cause:** `app.js:2071` refuses a roll only after an outcome or when HP is above 0. Nothing ties a save to the combat turn.
- **Fix idea:** remember the round of the last save; when there's a fight, allow one save per round, and say "Already rolled this round".

### N5. Long rest and End combat need a native confirm popup: **Medium** [Both] [Code]
- **What happened:**
  - Muse tapped **Long rest** on two Sheets and nothing happened. Its automated browser dismisses `window.confirm` popups silently (`app.js:2344`).
  - The DM's own **End combat** failed the same way (`app.js:3180`): the headless browser dismissed the popup, the button looked like it worked, but combat stayed on round 3 until the DM accepted the popup and pressed it again.
- **Impact:** a person would see the popup, so this is mostly a testing and automation gap. But a cancelled confirm gives no feedback, and End combat leaves no trace that it didn't happen. The app has 15 `window.confirm` calls.
- **Fix idea:** use an in-page confirm (a second tap, "Tap again to end combat"). It works everywhere, can be tested, and is easier to tap on a phone.

### N6. Attacking while hidden doesn't suggest advantage: **Medium** [DM]
Roan attacked from hiding with Sneak Attack; the Attack card didn't offer advantage, unlike Reckless.

### N7. Rage resistance isn't suggested on hits against a raging character: **Medium** [DM]
Enemy attacks against Logan while raging offered Apply / Half with no hint that slashing, piercing and bludgeoning damage should be halved.

### N8. The built-in Assassin's poison is only in its notes: **Medium** [DM] [Code]
The 7d6 poison (DC 15 Con save, half on a success) is in the abilities text (`src/encounter.js:42`), not on the shortsword attack, so the DM rolls the save and damage by hand.

### N9. Hits can't be retargeted: **Medium** [DM]
Hits sent at an enemy that was already down (Muse's stale view) or one not in the encounter ("Vault Warden — not in your encounter") can only be dismissed. The DM then enters damage by hand, which skips *To narrate*. A "send to…" picker on the hit would fix it.

### N10. Maneuver saves have no one-tap roll: **Low** [DM] [Code]
Trip Attack's "DC 16 Strength save or knocked prone" shows on the hit, but the save button only appears for spells (`report.save`), so the DM rolls it by hand.

### N11. "At the table" is unreliable when one browser plays several characters: **Low** [DM]
Presence follows the selected character, so the list flickers as the player switches characters.

### N12. A short rest is allowed during combat: **Low** [Player]
The White Wizard and Dum Dum took short rests while the fight was still running (round 3). A warning ("You're in a fight; rest anyway?") would catch mistakes.

### N13. Smaller things: **Low**
- Apply and Half (N) on an enemy's attack: after a tap there's no clear label of which one was used. [DM]
- Muse accidentally toggled Concentrating on Roan; the toggle is easy to hit. [DM]

---

## 3. Player behavior (Muse)

- **Slow:** a few minutes per action, plus one 100-minute silence.
- **Hit reporting:** in fight 1 it mostly used Send. While on the host account (N3) it typed hits and damage, which never reaches *Hits to apply*.
- **Stale information:** it sent hits at downed enemies and kept its own count of enemy HP. It was wrong twice: it called the Assassin "Bloodied at 31 HP", then called it dead when it was at 31, then at 5.
- **Skipped turns:** Logan (fight 2, round 2), Roan (fight 2, round 1), and Arcturus (fight 1, round 3) passed with no post. Dum Dum often used one of his two attacks in fight 1.
- **Good:** caught the advantage rule, checked slot counts, reported precise steps for the death-save and long-rest problems, and asked where missing buttons should be instead of guessing.

---

## 4. Not covered

| Use case | Why |
|---|---|
| Concentration-save prompt after damage (R4) | The hits landed while Muse was on the host account; Concentrating was cleared by hand afterwards |
| Long rest | Blocked by the confirm popup (N5) |
| Second Wind | Dum Dum took no damage all fight (94/94) |
| Healing Word | Not used; the potion covered healing from 0 instead |
| Roan's Shadow Energy abilities | Not used this round |
| Speech capture | Needs a real mic in Chrome |

---

## 5. Suggested order

1. **N1** advantage re-roll sends the wrong roll (wrong numbers, every session with Reckless or hidden attacks).
2. **N5** replace native confirms with in-page confirms (unblocks long rest and End combat for test agents, and gives feedback when cancelled).
3. **N4** one death save per round.
4. **N3** + **N2** tell a host they're in DM mode, and keep applied hits on the server.
5. **N7**, **N8**, **N6** rule hints (rage resistance, poison on the attack, advantage from hiding).
6. The rest as polish.
