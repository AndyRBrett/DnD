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
- **Moves:** quick keyword suggestions and a question for the DM.
- **Claude:** Ask Claude about the scene or ask a question (hidden when Claude isn't available).
- **Sheet:** roll tiles (tap one to roll it), the full character sheet, D&D basics, and copy-to-AI-chat.
- **DM** (host only): microphone, manual updates, the encounter tracker, actions for each character, character sheet editor, campaign history, and end table.

Character chips under the header switch characters. A red dot on Scene means the DM posted something while you were on another tab.

**Dice** (`src/dice.js`): the round d20 button opens a dice tray with d4–d100, a modifier, and advantage or disadvantage. Tapping a roll tile on the Sheet opens it already filled in, such as `d20+9`. On the hosted version a player can tick *Share with the table* to post the roll to *Since then*. The DM's rolls stay private.

**Conditions** (Scene tab): each player marks what's affecting their character (Poisoned, Prone, Frightened, Exhaustion levels, Concentrating, and the rest of the 5e conditions). The card explains each one in plain words, badges show under the character chips on every tab, the dice tray reminds you when a condition changes your roll, and each change is posted to *Since then* so the DM sees it. Conditions are kept on the player's phone.

**Encounter tracker** (`src/encounter.js`, DM tab): add enemies from standard 5e stat blocks or your own (name, how many, AC, HP as a number or dice rolled per enemy, initiative, speed, two attacks, abilities), and save your own as templates. It shows how many are still standing, HP bars with damage and heal (bloodied at half, down at 0), attack buttons that roll to-hit and damage (dice doubled on a natural 20), initiative order, and conditions on each enemy. The encounter lives only on the DM's phone (localStorage); nothing is stored in the database or shown to players.

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
