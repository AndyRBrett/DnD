# D&D Table Live

A companion for our in-person D&D campaign. The DM speaks into one microphone on the host laptop; the host browser transcribes and publishes updates after pauses. Players join on their phones over the same Wi-Fi, pick their character, and see the current scene, earlier updates, their abilities, and two suggested actions.

The two suggestions come from local rules in `src/scene-options.js`. They only suggest abilities recorded on the character's sheet, list `check` abilities without suggesting them, and leave outcomes to the DM. Players can also copy a prompt with their character and recent scenes into their own AI chat.

### Optional: Ask Claude

If the host laptop has an Anthropic API key, players get an **Ask Claude about this scene** button under the local suggestions. Create a `.env` file in the project folder (it is gitignored):

```
ANTHROPIC_API_KEY=sk-ant-...
```

The terminal shows `Claude suggestions · on` at startup. Nothing is sent until a player taps the button. Each tap sends that character's sheet and the last six DM updates (transcript text only) to Anthropic and returns two options plus a question for the DM. Claude is told to recommend only abilities that are ready on the sheet, never `check` lines, and never to decide outcomes. Answers are cached per character and update, each character can ask once every 8 seconds, and a room is capped at 200 requests. It uses `claude-opus-5-5` at low effort. Without a key, the button stays hidden and the app calls no AI model.

## Requirements

- Node.js **22.13+** (uses built-in `node:sqlite`). No `npm install` needed.
- Chrome on the host laptop. Speech recognition needs internet access and microphone permission. Transcript text is shared with the room; no audio is recorded or stored.

## Run a session

```bash
npm run dev     # rooms in memory, cleared when the server stops
npm run table   # rooms saved to table.sqlite, so a restart mid-session keeps the room
```

1. Set the DM's mic as the laptop's input. In Chrome on the laptop, open `http://localhost:4173`, choose **Start a table**, then **Start listening**. Allow the mic and say a test line; it should appear under **Current scene**.
2. Send players the **Copy player link** URL. It uses the laptop's LAN address; if the laptop has several connections, use the matching **Players** address printed in the terminal and keep the `?room=…` part.
3. Use **Character sheets and abilities** to edit the five profiles (The White Wizard, Arcturus, Logan Ninefingers, Dum Dum, Roan the Last Shadow). One ability per line: `tag | Name — cost, limits`. Tags: `combat`, `danger`, `explore`, `social`, `aid`, `any`, or `check` for anything not yet confirmed.
4. Host controls: pause listening, type an update, correct the latest transcript, or turn off auto-publish. Host control survives closing and reopening the tab on the host laptop.
5. **End room and delete session** when finished. Rooms expire eight hours after creation either way.

If phones can't load the page, the Wi-Fi may block device-to-device traffic (common on guest networks), or the laptop firewall may be blocking the server on the private network.

## Development

```bash
npm test        # builds, then runs suggestion, room API, and Claude (stubbed) tests
npm run build   # writes dist/server/index.js (worker + inlined assets)
```

| Path | Role |
| --- | --- |
| `src/index.html`, `src/app.js`, `src/style.css` | Host and player UI (one page, role from the stored host key) |
| `src/scene-options.js` | Situation detection, two suggestions, ability parsing, AI-chat prompt |
| `src/worker.js` | Fetch-style server: assets + `/api/rooms` API, starter party and recap, optional Claude suggestions |
| `drizzle/0000_rooms.sql` | Database schema (`rooms`, `scenes`) |
| `scripts/build.mjs` | Inlines assets into `dist/server/index.js` |
| `scripts/local.mjs`, `scripts/sqlite-db.mjs` | Local Node server and SQLite adapter |
| `test/` | `node:test` suites |

See `AGENTS.md` for repo rules shared by Codex and Claude Code.
