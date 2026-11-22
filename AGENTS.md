# Working on D&D Table Live

GitHub (`AndyRBrett/DnD`, branch `main`) is the shared source of truth for Codex and Claude Code.

- Plain JavaScript, HTML, CSS; Node.js 22.13+ with built-in `node:sqlite`. Do not add npm dependencies without asking.
- Run `npm test` before committing. It builds and runs the suggestion and room API tests.
- Commit source, README, build scripts, tests, and the schema in `drizzle/`.
- Never commit `dist/`, databases (`*.sqlite`, `*.db`), credentials, `.env*`, or hosting configuration (`.openai/`, `.wrangler/`).
- **Leave the existing hosted deployment untouched unless explicitly asked to change it.** `src/worker.js` is the hosted server too, so keep its API and the D1-style `env.DB` interface (`prepare/bind/all/first/run`, `batch`) compatible.
- Suggestions must only recommend abilities recorded on the character's sheet, never suggest `check` lines, and leave outcomes to the DM. This applies to the local rules and to the Claude prompt in `src/worker.js`.
- Claude suggestions stay opt-in: off unless `ANTHROPIC_API_KEY` is set on the server, and nothing is sent until a player taps **Ask Claude**. Calls use raw `fetch` (no SDK) because the project installs no dependencies. Tests stub the API; never call it from tests.
- Speech capture needs a manual test with a real mic in Chrome; it can't be covered by automated tests.
