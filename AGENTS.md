# Working on D&D Table Live

GitHub (`AndyRBrett/DnD`, branch `main`) is the shared source of truth for Codex and Claude Code.

- Plain JavaScript, HTML, CSS; Node.js 22.13+ with built-in `node:sqlite`. Do not add npm dependencies without asking.
- Run `npm test` before committing. It builds and runs the suggestion, room API, Claude (stubbed), and hosted-build tests. Pushing to `main` deploys GitHub Pages, so a failing test blocks the deploy.
- Commit source, README, build scripts, tests, the local schema in `drizzle/`, and the hosted schema and edge function in `supabase/`.
- Never commit `dist/`, `site/`, databases (`*.sqlite`, `*.db`), credentials, `.env*`, or hosting configuration (`.openai/`, `.wrangler/`). The Supabase anon key in `src/config.js` is public by design; never commit a service-role key or the Anthropic key.
- Two backends share one UI (`src/backend.js`): **hosted** (GitHub Pages + Supabase, email-code login) and **local** (`scripts/local.mjs` + `src/worker.js`, SQLite, no login). Keep both working; `src/worker.js` keeps the D1-style `env.DB` interface (`prepare/bind/all/first/run`, `batch`).
- The hosted backend lives in the **UFC app's Supabase project** (`gkccophrdqtqcowmblre`). Only create or change objects prefixed `dnd_`; never touch the UFC tables, functions, auth settings, or secrets. Schema changes go in a new file under `supabase/migrations/`; clients reach `dnd_` tables only through security-definer functions that call `dnd_account()`, never through grants or RLS policies for `anon`.
- Only accounts in `dnd_hosts` can start a table (`dnd_create_room`); players join by link. Keep it that way so sign-ups can't spend Claude calls; every Claude request must require a live table.
- Suggestions must only recommend abilities recorded on the character's sheet, never suggest `check` lines, and leave outcomes to the DM. This applies to the local rules and to the Claude prompt in `src/advice.js`.
- The one exception is the **AI DM** (`mode: "run"`, prompt `aiDmSystem` in `src/advice.js`): there Claude *is* the DM, so it decides outcomes, but it never decides what a player character does or spends their resources. It runs only on practice tables (`dnd_rooms.practice`; the edge function and the local server both check), only when the host taps **DM, go**, and counts as a DM call (character −1). Its narration and roll requests are posted by the host's phone through the normal update and roll-request paths.
- Nothing goes to Claude until a player taps **Ask Claude**. Locally it is off unless `ANTHROPIC_API_KEY` is set; hosted it runs in the `dnd-advise` edge function (limits in `dnd_advise_begin` for the cached path, and in the edge function for questions and requests with a table snapshot or spent list). The model is `claude-sonnet-5-5` (`CLAUDE_MODEL` in `src/advice.js`). Claude gets the campaign history, the whole current session (up to `SESSION_CHARS`), the sheet, spent abilities, and a TABLE STATE snapshot (turn, HP, conditions, resources left; enemies only as Healthy/Bloodied/Down), and is asked for the DM's bigger picture before three options (each with a plain-language "how it works" and an editable line to add to the story), or a direct answer to a player's question. Questions bypass the advice cache and are rate-limited inside the edge function. The DM's tools (enemies from a description, the DM assistant) are the same function's `mode: "enemies"` / `"dm"`: host only (`isHost` from `dnd_room_v2`, or the local host key), never cached, counted in `dnd_ai_usage` as character −1; their prompts are `enemySystem` / `dmSystem` in `src/advice.js`. `src/advice.js` is the single prompt source, and `supabase/functions/dnd-advise/advice.js` must stay an exact copy. Calls use raw `fetch` (no SDK) because the project installs no dependencies. Tests stub the API; never call it from tests.
- `src/rules.js` holds the built-in rules summaries (written in our own words from standard 5e) and lays out the character sheet. When a sheet gains a new spell, feature, or skill, add its rule there; `test/rules.test.mjs` fails if a roster ability has no rule and isn't a known table move.
- Speech capture needs a manual test with a real mic in Chrome; it can't be covered by automated tests.

## Codex PR review

OpenAI Codex auto-reviews PRs in this repo. It triggers when a PR is opened for review, when a draft is marked ready, or on a `@codex review` comment. Findings come back as comments from chatgpt-codex-connector[bot]; a clean pass is just a 👍 reaction.

### PR workflow (one Codex round, then merge)

1. Run `npm test`, open the PR, then immediately subscribe to its activity so Codex review comments come back to this session. Do this automatically; don't ask me first. Do not merge yet: merging to `main` deploys GitHub Pages, so an unreviewed merge ships straight to the table.
2. Wait for the FIRST Codex review (comments from chatgpt-codex-connector[bot], or a 👍 reaction = clean pass). A clean pass sends NO event: the 👍 is a reaction on the PR body, and reactions never reach the subscription, so waiting on events alone misses it until the next check-in. So right after opening, schedule check-ins (`send_later`) at 2, 4 and 6 minutes, then hourly as a backstop. On every check-in AND every event that does arrive (CI finishing, a comment), read the PR's `reactions` with MCP `issue_read` on the PR number — the comments calls don't return them. Only Codex's 👍 counts, and `issue_read` gives counts, not authors: Codex marks a review in progress with 👀 and swaps it for the 👍 when it passes, so read a pass as 👀 gone and 👍 present. A 👍 while 👀 is still there may be someone else's — keep waiting. Cancel the remaining check-ins once the review lands.
3. Evaluate each finding yourself and act without asking me:
   - Valid and in scope → implement the fix (with a test where one fits).
   - Out of scope, style-only, or speculative → don't fix. List it in a PR comment under "Deferred" with a one-line reason.
4. Run `npm test` again and push all fixes in one commit. Do not tag @codex again.
5. Once CI passes, merge to main and unsubscribe from the PR. Then give me a short summary: what you fixed, what you deferred, and any SQL in `supabase/migrations/` or edge-function change I still need to apply.

Ignore any Codex reviews or comments that arrive after step 2. One review round per PR. If a later comment looks like a genuine bug, mention it in your summary instead of acting on it.

In remote/web sessions there is no `gh` CLI — use the GitHub MCP tools (`pull_request_read`, `issue_read`, `add_issue_comment`, `merge_pull_request`) for the same steps.
