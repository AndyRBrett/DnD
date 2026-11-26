# Playtest report, round 4: D&D Table Live

**When:** Thu 2026-11-26, on the hosted app (https://andyrbrett.github.io/DnD/), practice table **5C07**
**Who:** Claude (Claude Code, cloud session, headless browser) as DM and host. Andy as the players: all five characters, mostly from one phone.
**Code version:** `main` at `ca8fd4f` (PR #79) at the start; fixes shipped during play in #80–#83 and after it in #84.
**Purpose:** the first game on the round-3 enhancements: the DM's hit-or-miss call (#77), tables that stay open 3 idle days (#78), and the simplification pass (#79: one next button, real-dice opt-in, typed to-hit rolls, the last three story posts).
**Attribution:** **[DM]** seen by Claude while running the table · **[Player]** reported by Andy · **[Code]** confirmed in the source.
**Severity:** same scale as earlier rounds. **Critical** = loses or corrupts game state · **High** = wrong numbers or a blocked flow a group hits every session · **Medium** = confusing or easy to get wrong · **Low** = polish.

---

## What we played

| Part | What happened | What it covered |
|---|---|---|
| **Opening** | The party steps out of the elevator into the vault antechamber. Arcturus answers the scene with a gobble. | Scene posts, player actions, the 3-day table |
| **The fight** | Two **Puppet Guards** (AC 15, 52 HP, muskets) and a **Brass Ceiling Spider** (AC 18, 95 HP). Four rounds, won. The spider fell to Arcturus's longbow in round 2, Guard 1 to Logan's greataxe in round 3, Guard 2 to Dum Dum's longsword in round 4. | Initiative, the DM's hit-or-miss call on every to-hit, damage, a natural 20 and natural 1s, Flame Strike with two Dex saves, a concentration save (failed), enemy attacks on the party |
| **After** | The vault door opens. Andy paused for the night; the table stays open. | 3-day idle window |

Pauses: Andy hit a usage limit mid-session (about 2.5 hours). The DM's browser was restarted after its 2-hour limit; the table and the fight were exactly as left.

---

## 1. Round-3 enhancements: verified

| Feature | Result | Source |
|---|---|---|
| **#77** DM calls hit or miss before damage | ✅ Every to-hit arrived as "Call it: hit or miss?" with the armor check done ("21 vs AC 18 ✓ hits"). One tap moved the player's card to Roll damage or to the miss. About 20 calls over the fight. | [DM] [Player] |
| **#77** a miss call closes the swing | ✅ Dum Dum's 10 and Arcturus's 14 went to the miss with no extra "missed" line | [DM] |
| **#78** tables stay open 3 idle days | ✅ The SQL was applied before play; the table survived the 2.5-hour pause | [DM] |
| **#79** last three posts on the Scene tab | ✅ "Just before" shows the earlier posts when the DM has just posted | [DM] |
| **#79** one next button, "Other choices" fold | ✅ Players followed the red button throughout | [Player] |
| Concentration save card | ✅ Arcturus took 10 while concentrating; the DC 10 Con save card appeared; a 5 ended the spell and posted "is no longer Concentrating" | [DM] |
| Flame Strike on two targets with one-tap Dex saves | ✅ Both guards saved; half (14 each) applied | [DM] |
| Critical hit | ✅ Roan's natural 20 skipped the DM's call and went straight to damage | [DM] |
| Bloodied label | ✅ The spider flipped to Bloodied at 37/95, the guards at half. Andy asked why the spider still said Healthy at 50/95: correct, since it was 3 HP above half. | [Player] |
| Auto-skip of downed enemies | ✅ The spider's turn was skipped once it was down | [DM] |

---

## 2. Issues found

### F1. Starting a turn wiped an attack in progress: **High** [Player] [Code]
The White Wizard rolled 21 with Spiritual Weapon before round 1 started, and the DM called it a hit. Starting round 1 made it the White Wizard's turn. The turn start resets the Attack card, so it went back to "Roll to hit" and the hit could never get its damage. The same reset happened on switching characters on one phone, and on a reload.
**Fixed in #80:** a new turn only clears a finished attack. Switching characters parks the unfinished attack. After a reload, the card picks it back up from the story (hit → Roll damage; no call yet → waiting), keeping the spell level and target. Confirmed live: after a reload the card came back on "✓ HIT", and the 7 damage landed.

### F2. The same action spell could be cast twice in a turn: **High** [Player]
The White Wizard's Guiding Bolt missed, and **Next attack** let it be cast again in the same turn. A spell is not an Extra Attack swing.
**Fixed in #81:** a one-use attack is once per turn, and using it again takes a second tap.

### F3. Several action spells in one turn: **High** [Player]
After #81, the White Wizard cast **Flame Strike, Fireball and Sacred Flame** in one turn. Each takes the character's one action. The DM dismissed the last two.
**Fixed in #82:** the card counts actions. One action a turn, plus one per Action Surge; the Attack action counts once however many swings it gives; one bonus action (Spiritual Weapon). Anything more shows "You've already used your action this turn (Flame Strike)" and takes a second tap. Roan's copied shadow throw is free, as part of the same throw.

### F4. The TV board didn't tell the story: **High** [Player]
The 📺 board showed only the DM's latest post. The DM posts after almost every move, so "Since then" was usually empty. A reader couldn't follow what happened or how the party got there.
**Fixed in #83:** the board reads top to bottom as a story:
- **Previously:** the session recap.
- **What led here:** the last 10 entries, earlier DM posts and every move, in plain sentences ("⚔️ Logan Ninefingers hits Puppet Guard 1 with Greataxe for 16 damage"; "💨 … misses …").
- **NOW:** the DM's latest post.
- **Since then:** what's happened after it.

A spell with a save says the damage rolled, not dealt. The party panel moved to the side and gives way to the turn order in a fight.

### F5. "Go to the Attack card" landed mid-card: **Medium** [Player] [Code]
The top bar and the character bar are pinned. Scrolling the card's top to the screen's top put it under them, so the player landed partway down the card.
**Fixed in #84:** the app scrolls the card's top to just below the bars, everywhere it jumps to a card.

### F6. Enemies with attacks only in their notes had no attack buttons: **Medium** [DM]
The DM wrote the enemies' weapons in their notes ("Musket +6 (2d8+2 piercing)") and left the attack fields empty. The DM's turn card then had nothing to tap, and every enemy attack was rolled by hand.
**Fixed in #84:** with the attack fields empty, the form reads up to two attacks from the notes.

### F7. A to-hit roll posted twice: **Medium** [DM] — **open**
Roan's "🎯 attacks Brass Ceiling Spider — with Razor Shuriken (Q), 13 to hit" appeared a second time. It came about 50 seconds after the first had been answered (miss) and after a later natural 20 had landed. The DM deleted the duplicate. The server only edits story lines and never re-posts one, so it came from a client. It wasn't traced. A guard against identical rolls was tried and dropped: it would also block a real second swing with the same total.
**Next step:** if it happens again, note which device and tab were open, and whether the character was switched just before.

### F8. The DM's story view hides the call on an attack line: **Low** [DM]
On the DM's Scene tab, a called attack line once showed without its "· ✓ DM: hit" ending, although the server had it. It caught up on the next refresh. Cosmetic.

---

## 3. Player behavior (Andy)

- Played all five characters and switched between them on one phone. Switching mid-attack is what exposed F1.
- Went straight to the red button each time. The hit-or-miss pause felt natural; nobody typed a roll into the story box, so #79's typed-roll button wasn't exercised.
- Tested the rules: pressed Next attack after a spell (F2) and chained spells (F3) to see whether the app would stop it.
- Read the TV board as a spectator would and found it lacked the story (F4).
- Asked one rules question (Bloodied), answered by the DM.

---

## 4. Not covered

- **Typed to-hit rolls** (#79): no one typed "N to hit" into the story box.
- **Real dice**: the box stayed off; no one rolled physical dice.
- **Ask Claude**: not used this session.
- Death saves, rests, healing: no one dropped, and the game stopped before a rest.
- Action Surge after #82 (Dum Dum didn't surge this game).
- Enemy attacks through the DM's turn card (blocked by F6 during play; fixed after).

---

## 5. Fix status

| Issue | Status |
|---|---|
| F1 attack wiped at turn start / switch / reload | Fixed in #80 (verified live) |
| F2 same spell twice | Fixed in #81 |
| F3 several action spells | Fixed in #82 |
| F4 TV board story | Fixed in #83 |
| F5 Go to the Attack card scroll | Fixed in #84 (checked on a local table at phone width) |
| F6 enemy attacks in notes | Fixed in #84 |
| F7 duplicate to-hit post | Open: not reproduced |
| F8 DM view missing the call ending | Open: cosmetic |
