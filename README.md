# D&D Table Live

A companion for our in-person D&D campaign. The DM speaks into one microphone on the host laptop; the host browser transcribes and publishes updates after pauses. Players join on their phones over the same Wi-Fi, pick their character, and see the current scene, earlier updates, their abilities, and two suggested actions.

The two suggestions come from local rules in `src/scene-options.js`. They only suggest abilities recorded on the character's sheet, list `check` abilities without suggesting them, and leave outcomes to the DM. Players can also copy a prompt with their character and recent scenes into their own AI chat.

### Optional: Ask Claude

If the host laptop has an Anthropic API key, players get an **Ask Claude about this scene** button under the local suggestions. Create a `.env` file in the project folder (it is gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The terminal shows `Claude suggestions · on` at startup. Nothing is sent until a player taps the button. Each tap sends that character's sheet and the last six DM updates (transcript text only) to Anthropic and returns two options plus a question for the DM. Claude is told to recommend only abilities that are ready on the sheet, never `check` lines, and never to decide outcomes. Answers are cached per character and update, each character can ask once every 8 seconds, and a room is capped at 200 requests. It uses `claude-opus-5-5` at low effort. Without a key, the button stays hidden and the app calls no AI model.

## Layout

The app uses the UFC Picked Fight visual system: near-black cards, red primary and gold secondary, Barlow and Barlow Condensed type (SIL OFL, `src/fonts/`), and a fixed bottom tab bar. Inside a table:

- **Scene:** the DM's current scene, *Since then* (players' actions, newest first), earlier updates, and *What is <character> doing?*.
- **Moves ("What can I do?"):** quick ideas from your sheet first (labeled *From your sheet*), then Ask Claude underneath (labeled *Claude reads the whole story*). When Claude is off, one line says so instead of a missing tab.
- **Sheet:** roll tiles (tap one to roll it), the full character sheet, D&D basics, and copy-to-AI-chat.
- **Combat** (only during a fight): initiative order, whose turn it is, and enemies as Healthy, Bloodied, or Down.
- **DM** (host only): microphone, manual updates, the encounter tracker, actions for each character, character sheet editor, campaign history, and end table.

**Editing the story:** the DM can tap ✎ on anything in the story (the current scene, *Since then*, and earlier updates, including players' actions) to fix it or delete it in place. Players can do the same for their own actions. Edits clear Claude's cached suggestions so the next answer reads the corrected story (`supabase/migrations/0005_dnd_story_edits.sql`). The campaign history itself is edited in the DM tab.

**First visit:** a player's first table on a phone shows a four-step "How it works" walkthrough (pick your character, watch the Scene, fights, where help is); **?** in the header shows it again. The Sheet tab opens *D&D basics* and folds the long character sheet until the player chooses otherwise (remembered per phone). The sign-in screen explains the email code (it comes from UFC Picks, the shared login service) and, from a table link, that you'll go straight to the table.

Character chips under the header switch characters. A red dot on Scene means the DM posted something while you were on another tab.

**Dice** (`src/dice.js`): the **Roll** button opens a dice tray (starting on a plain d20, with one-tap chips for your character's rolls and proficient saves, so nothing has to be typed) with d4–d100, a modifier, and advantage or disadvantage. Dice are real 3D solids drawn on a canvas (`src/dice3d.js`: tetrahedron, cube, octahedron, d10 trapezohedron, dodecahedron, icosahedron; d100 is a tens die plus a units die) that tumble, bounce, and land with the rolled number facing you. A natural 20 lands gold, a natural 1 dark (no animation when the phone asks for reduced motion). Tapping a roll tile on the Sheet opens it already filled in, such as `d20+9`. On the hosted version a player can tick *Share with the table* to post the roll to *Since then*. The DM's rolls stay private.

**Conditions** (Scene tab): each player marks what's affecting their character (Poisoned, Prone, Frightened, Exhaustion levels, Concentrating, and the rest of the 5e conditions). The card explains each one in plain words, badges show under the character chips on every tab, the dice tray reminds you when a condition changes your roll, and each change is posted to *Since then* so the DM sees it. Conditions are kept on the player's phone.

**Combat** (`supabase/migrations/0004_dnd_combat.sql`): when the DM taps **Start combat** in the encounter tracker, a Combat tab opens on every phone. It shows the round, whose turn it is, who's up next, and one initiative order with the party and the enemies. Players roll initiative there (with their sheet bonus) or type what they rolled at the table; the DM can fill one in for anyone. The DM moves the turn with **Next turn** and **Back** (downed enemies are skipped, and a new round starts at the top). Players see enemies only as Healthy, Bloodied, or Down, plus their conditions. Exact HP, AC, and attacks never leave the DM's phone: the database function keeps only those public fields. The player whose turn it is gets a gold "Your turn!" banner and a vibration, and an **End my turn** button that passes the turn through the database (`supabase/migrations/0009_dnd_pass_turn.sql`, or the local server), so it works even when the DM's phone is asleep; it uses the same order as the app (highest initiative first, the party first on ties, downed enemies skipped, a new round after the last). Before 0009 runs, it asks the DM's phone with a "⏭️ ends their turn" story line and says so if nothing happens. Only the player whose turn it is can pass it; the DM's Next turn and Back still work anytime.

**Party HP** (`supabase/migrations/0006_dnd_party_hp.sql`): each character's current, max, and temp HP, shared with the whole table. A ❤️ badge under the character chips shows yours on every tab; the Sheet tab (and the Combat tab during a fight) has your Hit Points card with Damage and Heal; the DM tab has Party HP for everyone; the combat order shows each character's HP. Damage uses temp HP first, healing stops at max, and at 0 a character shows as Down (death saves). Max HP starts from the sheet ("Start at full"), and **Full heal (long rest)** resets it. The Hit Points card also has the six ability modifiers (tap one to roll a check, or its save — proficient saves in gold) and the combat numbers from the sheet (AC, initiative, speed, passive Perception, save DC, proficiency); an AC the DM confirms there replaces the sheet's (an unsure sheet AC shows with a ?). If a character marked Concentrating takes damage, the card shows the Constitution save DC (10 or half the damage). HP is kept per campaign, so it carries from one session to the next; a practice table keeps its own.

**Combat calculator:** on the DM's enemy cards, pick who the enemy attacks (🎯 Target). An attack roll is checked against that character's AC (a natural 20 is a critical hit with doubled damage dice, a natural 1 misses), and a hit offers **Apply N to <character>** (or **Half** for resistance), which takes it off their shared HP. Players attack from the Combat tab's **Attack** card: pick one of their own attacks (from `attacks` in each sheet in `src/campaign.js`, e.g. Greataxe +8 · 1d12+4, Longbow +11 · 1d8+5, the White Wizard's spell attacks and save spells), switch on options (`attackOptions`: Raging, Reckless Attack for advantage, Great Weapon Master, Hunter's Mark, a maneuver die…), pick the enemy, and **Roll to hit** with the 3D dice. The card shows the math with the ability modifier, e.g. "To hit: d20 + STR +4 + Prof +4 = +8 · Damage: 1d12 + STR +4 + Raging +3" (each attack's `ability` in the sheet; a test checks every listed bonus and DC adds up). A natural 20 is a critical hit (damage dice doubled, plus Logan's Brutal Critical die), a natural 1 misses, otherwise the DM calls Hit or Miss. Then **Roll damage** with the right dice and **Send** it to the DM; save spells (Fireball, Sacred Flame…) skip the to-hit roll and can be sent to several enemies. **Other damage** sends a number without a roll (with **Use last roll**); it goes into the story as "🎯 hit Bandit 2 for 14 damage" and shows on the DM's Combat tab under **Hits to apply** with Apply and Dismiss (plus the to-hit total checked against the enemy's AC, and **Saved: half** for save spells). Players never see enemy HP. At 0 HP a player's card shows **death saves** (three successes, three failures, Roll death save: 10+ succeeds, a 1 is two failures, a 20 brings them back with 1 HP); each roll is posted for the DM.

**Resources** (Sheet tab, and the Combat tab during a fight): spell slots by level and limited features from each sheet's `resources` (Rage, Channel Divinity, Warding Flare, superiority dice, Action Surge, Second Wind, Indomitable), shown as dots you tap to spend or get back, with **Short rest** and **Long rest** (a long rest also restores full HP). "How spell slots work" explains slots in plain words. Casting a leveled spell from the Attack card spends its slot (pick a higher slot to upcast; Fireball and Guiding Bolt add their extra dice), Radiance of the Dawn spends Channel Divinity, and a maneuver spends a superiority die; with nothing left, the card says so. **Start rage** spends a rage, shows a 😤 Raging badge, switches on Raging (+3) in attacks, and adds a **½ (rage)** damage button; starting a rage and resting are posted to the story for the DM. Resources are shared through the room (`supabase/migrations/0007_dnd_resources.sql`; the local server keeps them too), kept per campaign like HP (a practice table keeps its own), and shown on the DM's Party HP card; until 0007 runs, each phone keeps its own copy and uploads it once the server can hold it. Anything out of uses (a leveled spell with no slot of its level or higher, Rage at 0, maneuvers with no superiority dice…) is left out of the Moves suggestions and sent to Ask Claude as **SPENT**, so neither suggests it until a rest.

**TV board:** the DM tab's **📺 Open the TV board** link (the table link plus `&board=1`) shows a read-only, big-text view for a screen the whole table can see: the current scene and recent actions, the party's HP and AC, and during a fight the round, whose turn it is, and the initiative order. Enemies show only as Healthy, Bloodied, or Down, even when the DM's account opens it. The TV's browser signs in once (the DM's account is fine).

**Encounter tracker** (`src/encounter.js`, DM tab): add enemies from standard 5e stat blocks or your own (name, how many, AC, HP as a number or dice rolled per enemy, initiative, speed, two attacks, abilities), and save your own as templates. It shows how many are still standing, HP bars with damage and heal (bloodied at half, down at 0), attack buttons that roll to-hit and damage (dice doubled on a natural 20), initiative order, and conditions on each enemy. On the hosted app the encounter is saved with the table (`supabase/migrations/0008_dnd_encounter.sql`, host-only functions), so the DM can switch between phone and laptop mid-session; it's never shown to players, and it goes away when the table ends. On the local server it stays on the DM's device.

## Hosted version (how the group uses it)

**https://andyrbrett.github.io/DnD/**: open it on any phone, sign in with your email, and play. No laptop or shared Wi-Fi needed.

- **Sign in** with an email code. It's the same account system as the UFC Picks app, and the code email comes from UFC Picks.
- **DM:** tap **Start a table**, then **Start listening**, then **Share player link** to send it to the group chat. Whichever account starts a table is its host on any device. Your open tables are listed on the home screen, so you can switch phone ↔ laptop or reload without losing control.
- **Players:** open the link, sign in, pick your character. **Ask Claude** works for everyone and uses the Anthropic key already saved in Supabase. Limits: 1 request per character every 8 seconds, 200 per table, 60 per person per day, 600 a day in total.
- **Campaign history:** the host opens **Campaign history** on their table to paste notes or add .txt/.md files. Ask Claude reads the whole history before answering, so it knows earlier sessions, names, and open threads. It still suggests only abilities on the character's sheet. When you end a table, you can add that session's updates to the history. Every save keeps the previous version (the last 30) in `dnd_campaign_versions`. The history is cached on Anthropic's side for an hour, so repeat questions are cheap. The limit is 400,000 characters (about 65,000 words).
- **Character sheet:** stats across the top, then Attacks, Spells by level, Features & traits, Skills, and Table moves, with unconfirmed items under *Confirm with the DM first*. Characters with a full sheet in `src/campaign.js` (`sheets`: the White Wizard, Arcturus, Logan, and Dum Dum) also show ability scores, combat stats, saves, all 18 skills, spellcasting, magic items, a first-turn routine, and open questions for the DM. Tap any entry for a built-in plain-language rule (`src/rules.js`, standard 5e summaries) plus your table's note. No AI call. *D&D basics* explains the actions everyone has on their turn (Dash, Dodge, Help, Grapple, concentration, advantage…).
- **Ask Claude:** tap **Ask Claude about this scene**, or type a question (*"Can I cast Silence with one arm held?"*). Claude answers, gives its read of the bigger picture, and suggests three options. Each option explains how the move works (action or bonus action, range, rolls, cost) and has an editable line you can add to the story.
- **Player actions:** under *What can I do?*, each player types (or dictates) what their character is doing and taps **Add to story**. The host also gets **Actions for each character** (one box per character) for players without a phone out. Everyone sees it under the current scene, Ask Claude reads it, and it's saved into the campaign history with the session (`DM:` and `<Character>:` lines in order).
- **Practice table:** works like a normal table but never adds anything to the campaign history. It shows a PRACTICE label for everyone. Use it to test without touching the story.
- **Export for ChatGPT** (in Campaign history): downloads one .txt file with the history, the current character sheets (ready versus check-with-the-DM), and this table's updates, and also copies it. Attach the file in a ChatGPT thread to continue there. To bring a ChatGPT recap back, paste it into Campaign history and save.
- Tables expire 8 hours after they start. **End room and delete session** removes everything right away.

How it's built: GitHub Pages serves the files in `src/` (`.github/workflows/pages.yml` runs the tests, then publishes on every push to `main`). Rooms, logins, and the campaign history live in the UFC app's Supabase project, in tables prefixed `dnd_` (`supabase/migrations/`). Clients can only reach them through database functions that check the signed-in account. **Ask Claude** runs in the `dnd-advise` edge function (`supabase/functions/dnd-advise/`).

### Changing the hosted backend

- **Database:** add a new numbered file in `supabase/migrations/` and apply it to project `gkccophrdqtqcowmblre`. The Supabase SQL editor is the reliable route; MCP migrations that need a confirmation prompt can time out. Only ever create or change `dnd_` objects; the UFC tables share this database.
- **Claude prompt:** edit `src/advice.js`, copy it to `supabase/functions/dnd-advise/advice.js` (`npm test` fails until they match), then redeploy: `supabase functions deploy dnd-advise --use-api --project-ref gkccophrdqtqcowmblre`.
- **Allowed origins** for the edge function default to `https://andyrbrett.github.io` and `http://localhost:4173`. Override them with the `DND_ALLOWED_ORIGINS` secret.

## Local version (one laptop, same Wi-Fi)

The original setup still works without any accounts: a Node server on the laptop, with players on the same Wi-Fi.

### Requirements

- Node.js **22.13+** (uses built-in `node:sqlite`). No `npm install` needed.
- Chrome on the host laptop. Speech recognition needs internet access and microphone permission. Transcript text is shared with the room; no audio is recorded or stored.

### Run a session

```bash
npm run dev     # rooms in memory, cleared when the server stops
npm run table   # rooms saved to table.sqlite, so a restart mid-session keeps the room
```

1. Set the DM's mic as the laptop's input. In Chrome on the laptop, open `http://localhost:4173`, choose **Start a table**, then **Start listening**. Allow the mic and say a test line; it should appear under **Current scene**.
2. Send players the **Share player link** URL. It uses the laptop's LAN address; if the laptop has several connections, use the matching **Players** address printed in the terminal and keep the `?room=…` part.
3. Use **Character sheets and abilities** to edit the five profiles (The White Wizard, Arcturus, Logan Ninefingers, Dum Dum, Roan the Last Shadow). One ability per line: `tag | Name — cost, limits`. Tags: `combat`, `danger`, `explore`, `social`, `aid`, `any`, or `check` for anything not yet confirmed.
4. Host controls: pause listening, type an update, correct the latest transcript, or turn off auto-publish. Host control survives closing and reopening the tab on the host laptop.
5. **End room and delete session** when finished. Rooms expire eight hours after creation either way.

### Host from a phone (local)

A phone can't run the Node server, and phone browsers only allow speech recognition on `https://` or `localhost`, so a phone host should use the hosted version above. The same phone tips apply there:

1. On the DM's phone, open the app in **Safari (iPhone)** or **Chrome (Android)** and choose **Start a table**, then **Start listening**. Allow the microphone.
2. **Share player link** opens the phone's share sheet, so the DM can drop the link in the group chat.
3. Keep the app in front and the phone on power. While listening, the screen stays on. If the DM switches apps or the screen locks, listening pauses and resumes on return. If the phone blocks the automatic restart, tap **Start listening**.
4. Put the phone in front of the DM, not in the middle of the table, or it will transcribe the whole table. A clip-on mic plugged into the phone works best.

If phones can't load the page, the Wi-Fi may block device-to-device traffic (common on guest networks), or the laptop firewall may be blocking the server on the private network.

## Development

```bash
npm test            # builds, then runs suggestion, room API, Claude (stubbed), and hosted-build tests
npm run build       # writes dist/server/index.js (local server + inlined assets)
npm run build:site  # writes site/ (what GitHub Pages serves)
```

| Path | Role |
| --- | --- |
| `src/index.html`, `src/app.js`, `src/style.css` | Sign-in, host and player UI (one page) |
| `src/backend.js`, `src/config.js` | Talks to Supabase (hosted) or the local server; `config.js` picks which |
| `src/campaign.js` | Starter roster and recap for new tables |
| `src/advice.js` | Claude prompt and request, shared by the local server and the edge function |
| `src/rules.js` | Built-in rules glossary and the sheet layout (sections, spell levels, table notes) |
| `src/scene-options.js` | Situation detection, two suggestions, ability parsing, AI-chat prompt |
| `src/worker.js` | Fetch-style server: assets + `/api/rooms` API, starter party and recap, optional Claude suggestions |
| `drizzle/0000_rooms.sql` | Local SQLite schema (`rooms`, `scenes`) |
| `supabase/` | Hosted schema and database functions, and the `dnd-advise` edge function |
| `.github/workflows/pages.yml` | Test, build, publish to GitHub Pages |
| `scripts/build.mjs`, `scripts/build-site.mjs` | Local server bundle; static site for Pages |
| `scripts/local.mjs`, `scripts/sqlite-db.mjs` | Local Node server and SQLite adapter |
| `test/` | `node:test` suites |

See `AGENTS.md` for repo rules shared by Codex and Claude Code.
