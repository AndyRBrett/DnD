# Playtest report, round 6: D&D Table Live

**When:** Fri 2026-11-27 (evening), on the hosted app (https://andyrbrett.github.io/DnD/), practice table **F33A**, picking up from round 5
**Who:** Claude (cloud session, headless browser) as DM. Andy as all five players, from one phone.
**Code version:** `main` at `3abe756` (PR #94) at the start. #95 shipped during play; this PR after.
**Attribution:** **[DM]** seen by Claude while running the table · **[Player]** reported by Andy · **[Code]** confirmed in the source.

---

## What we played

| Part | What happened | What it covered |
|---|---|---|
| **The sealed vault** | Roan's earlier shuriken rolls (18 and 19 vs AC 12) cut Arcturus free, and he rolled under the door. The White Wizard was left alone inside. He cast Guidance and rolled a natural 1 on Insight to read the roulette wheel, called red, and lost: the house took his Third-eye amulet and keeps it under glass on black 13. | Roll requests, a cantrip on a check, a story loss |
| **The corridor fight** | Three **Masked Croupiers** (AC 15, 60 HP, two 10-ft rake attacks that pull) against Arcturus, Logan, Dum Dum and Roan. The White Wizard sat out. About a round and a half: Croupier 3 down to 6 HP and knocked prone by Dum Dum's Trip Attack. Logan took 13, Roan 15, Dum Dum 14. Logan raged. | Sit out (new), auto hit/miss calls, enemy attacks, Strength saves, Trip Attack, Prone |

Paused mid round 2, before Roan's and Dum Dum's Strength saves. The fight stays open.

---

## Issues found and fixed

#### R1. A character who isn't in the fight still had to roll initiative: **High** [Player]
The White Wizard was on the other side of the vault door. The app still put him in the turn order, asked him for initiative, and gave him a turn. Andy: "he shouldn't roll initiative."
**Fixed in #95:**
- The DM taps **Sit out** on his row. He leaves the order, gets no turn and no initiative prompt, and his phone says he's sitting out.
- If it was his turn, the turn moves on. **Join fight** brings him back.
- End my turn skips him on the server (migration 0018, applied during play).

#### R2. Roll requests typed by hand rolled a bare d20: **Medium** [DM] [Code]
The DM typed the requests ("Strength saving throw, DC 14", "Wisdom (Insight) check, DC 14"). The phone only knew the DM tool's wording ("Strength save", "Insight"), so it offered a plain d20. Logan's answer read "3 (d20: 3)". Round 5's Dex checks had the same problem.
**Fixed (this PR):** the phone also reads these forms and adds the sheet's bonus:
- "saving throw" as well as "save"
- short ability names, like "Str save"
- "Ability (Skill) check"
- "Skill check"

The answer line keeps the DM's words, so the request still matches its answer.

#### R3. An attack could change targets after the DM's call: **Medium** [DM] [Code]
Logan rolled 24 to hit against Croupier 1, and the DM called it a hit against Croupier 1's AC. His damage was then sent to Croupier 3, and that's where it landed.
**Fixed (this PR):** once a to-hit roll goes to the DM, the Attack card's target is locked to that enemy until the attack is finished. If that enemy falls first, the lock lifts. The DM can still move a hit in the inbox.

---

## How the DM ran it

- **Login:** signed in with Andy's email. The code came from the UFC Picks email, read through the Gmail connector.
- **Story posts and roll requests:** posted from scripts that call the app's own backend functions.
- **Auto calls:** a loop kept the DM page open. It called clear hits and misses and applied plain damage. It woke Claude for anything else: a story post, an enemy's turn, a natural 1 or 20.
- **Enemy turns:** run with the encounter tracker's attack buttons. Damage was applied with the party HP function, and saves were rolled by Claude.
- **DM slips:**
  - The first round-2 post named the wrong next turn. It was corrected by editing the post.
  - The first watcher asked the White Wizard to roll initiative, before Andy pointed out he wasn't in the fight (R1).

## Not covered

- Death saves, rests, Ask Claude, the TV board.
- The White Wizard's way out of the vault (the lit archway).
- The new target lock (R3) on a real phone. It needs the hosted story actions, so it can't be exercised on the local server.
