// Guards for the hosted (GitHub Pages + Supabase) build. The Supabase side is
// exercised against the live project when migrations are applied; these keep
// the repo's copies consistent.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const read = path => readFile(new URL("../" + path, import.meta.url), "utf8");

test("the edge function ships the same Claude prompt as the local server", async () => {
  assert.equal(await read("supabase/functions/dnd-advise/advice.js"), await read("src/advice.js"),
    "copy src/advice.js to supabase/functions/dnd-advise/advice.js and redeploy dnd-advise");
});

test("the site build contains every browser module the page imports", async () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: new URL("..", import.meta.url) });
  const files = new Set(await readdir(new URL("../site", import.meta.url)));
  const sources = ["index.html", "app.js", "backend.js", "scene-options.js"];
  for (const name of sources) {
    const text = await read("src/" + name);
    for (const [, ref] of text.matchAll(/(?:from |src=|href=)"\.?\/?([\w-]+\.(?:js|css))"/g)) {
      assert.ok(files.has(ref), name + " references " + ref + ", missing from site/");
    }
  }
});

test("browser paths are relative so the app works under /DnD/ on GitHub Pages", async () => {
  for (const name of ["index.html", "app.js", "backend.js"]) {
    const text = await read("src/" + name);
    assert.doesNotMatch(text, /(?:src|href)="\/(?!\/)/, name);
    assert.doesNotMatch(text, /from "\/(?!\/)/, name);
    assert.doesNotMatch(text, /location\.href = "\//, name);
  }
});

test("hosted config points at Supabase; the local build turns it off", async () => {
  assert.match(await read("src/config.js"), /supabase\.co/);
  const { default: worker } = await import("../dist/server/index.js");
  const response = await worker.fetch(new Request("http://localhost/config.js"), {});
  assert.match(await response.text(), /SUPABASE = null/);
});

test("no D&D database function is executable without signing in", async () => {
  const sql = await read("supabase/migrations/0001_dnd_tables.sql");
  assert.doesNotMatch(sql, /grant[^;]*to[^;]*\banon\b/i);
  assert.match(sql, /revoke all on public\.dnd_rooms, public\.dnd_scenes, public\.dnd_ai_usage, public\.dnd_advice from anon, authenticated/);
});

test("the site build versions every asset and module import so phones never run stale code", async () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: new URL("..", import.meta.url) });
  const site = name => readFile(new URL("../site/" + name, import.meta.url), "utf8");
  const version = (await site("version.txt")).trim();
  assert.ok(version.length >= 7);
  const html = await site("index.html");
  assert.match(html, new RegExp('src="app\\.js\\?v=' + version + '"'));
  assert.match(html, new RegExp('href="style\\.css\\?v=' + version + '"'));
  for (const name of ["app.js", "backend.js"]) {
    for (const [, specifier] of (await site(name)).matchAll(/from "([^"]+)"/g)) {
      assert.ok(specifier.endsWith("?v=" + version), name + " imports " + specifier + " without the version");
    }
  }
});

test("every full sheet has a quick-rolls strip", async () => {
  const { sheets } = await import("../src/campaign.js");
  for (const [name, sheet] of Object.entries(sheets)) assert.ok(sheet.rolls?.length >= 5, name);
});

test("the site ships its fonts with their license", async () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: new URL("..", import.meta.url) });
  const fonts = new Set(await readdir(new URL("../site/fonts", import.meta.url)));
  const css = await read("src/style.css");
  for (const [, file] of css.matchAll(/url\('fonts\/([\w-]+\.woff2)'\)/g)) assert.ok(fonts.has(file), file);
  assert.ok(fonts.has("OFL.txt"));
});

test("every tab panel and tab button pair up", async () => {
  const html = await read("src/index.html");
  const panels = [...html.matchAll(/data-panel="(\w+)"/g)].map(match => match[1]);
  const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map(match => match[1]);
  assert.deepEqual(panels.sort(), tabs.sort());
});

test("the site can be added to the home screen: manifest, icons, service worker", async () => {
  execFileSync(process.execPath, ["scripts/build-site.mjs"], { cwd: new URL("..", import.meta.url) });
  const site = name => readFile(new URL("../site/" + name, import.meta.url), "utf8");
  const manifest = JSON.parse(await site("manifest.json"));
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  const icons = new Set(await readdir(new URL("../site/icons", import.meta.url)));
  for (const icon of manifest.icons) assert.ok(icons.has(icon.src.replace("icons/", "")), icon.src);
  assert.ok(manifest.icons.some(icon => icon.sizes === "512x512" && icon.purpose === "maskable"));
  const html = await site("index.html");
  assert.match(html, /rel="manifest" href="manifest.json"/);
  for (const [, file] of html.matchAll(/href="icons\/([\w-]+\.png)"/g)) assert.ok(icons.has(file), file);
  const sw = await site("sw.js");
  const version = (await site("version.txt")).trim();
  assert.ok(sw.includes('const VERSION = "' + version + '"'), "sw.js is stamped with the release");
  assert.match(sw, /\/api\//, "the live table is never cached");
  // Every file the page loads is precached at the exact URL it asks for.
  const shell = JSON.parse(sw.match(/^const SHELL = (\[.*\]);$/m)[1]);
  const wanted = [...html.matchAll(/(?:src|href)="([\w-]+\.(?:js|css)\?v=[\w]+)"/g)].map(match => match[1]);
  for (const name of ["app.js", "backend.js", "config.js"]) {
    for (const [, ref] of (await site(name)).matchAll(/from\s*"\.\/([\w-]+\.js\?v=\w+)"/g)) wanted.push(ref);
  }
  assert.ok(wanted.length > 5);
  for (const url of wanted) assert.ok(shell.includes(url), url + " is precached");
  for (const url of shell.filter(url => url !== "./")) assert.ok((await readdir(new URL("../site/" + url.split("?")[0].replace(/[^/]+$/, ""), import.meta.url))).includes(url.split("?")[0].split("/").pop()), url + " exists");
});

test("the app starts last, after every constant a cached table draws with", async () => {
  const app = await read("src/app.js");
  const start = app.indexOf("if (room && (!backend.hosted || backend.user())) enterRoom();");
  assert.ok(start > 0);
  // A top-level const or let after the start is in its temporal dead zone when
  // a cached snapshot is drawn at startup (round 6: the DM lost the DM tab).
  assert.doesNotMatch(app.slice(start), /^(const|let) /m);
});

test("the whole-session read needs a signed-in account and an open table", async () => {
  const sql = await read("supabase/migrations/0020_dnd_session_log.sql");
  assert.match(sql, /security definer/);
  assert.match(sql, /public\.dnd_account\(\)/);
  assert.match(sql, /public\.dnd_live_room\(p_code\)/);
  assert.match(sql, /revoke all on function public\.dnd_session_log\(text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.dnd_session_log\(text\) to authenticated;/);
  assert.doesNotMatch(sql, /grant[^;]*to[^;]*\banon\b/i);
});

test("Claude costs: the token log and recaps are service-only, and every path uses the same per-table limit", async () => {
  const sql = await read("supabase/migrations/0021_dnd_ai_costs.sql");
  assert.match(sql, /revoke all on public\.dnd_ai_tokens from anon, authenticated;/);
  assert.match(sql, /revoke all on public\.dnd_recaps from anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.dnd_recap_save\(text, text, bigint, text\) to service_role;/);
  assert.doesNotMatch(sql, /grant[^;]*to[^;]*\banon\b/i);
  const edge = await read("supabase/functions/dnd-advise/index.ts");
  const tableLimit = Number(edge.match(/const TABLE_LIMIT = (\d+);/)[1]);
  const playerLimit = Number(edge.match(/const PLAYER_DAY_LIMIT = (\d+);/)[1]);
  assert.match(sql, new RegExp("dnd_ai_usage where code = p_code\\) >= " + tableLimit));
  assert.match(sql, new RegExp("created_at > now\\(\\) - interval '1 day'\\) >= " + playerLimit));
  const worker = await read("src/worker.js");
  assert.match(worker, new RegExp("const AI_ROOM_LIMIT = " + tableLimit + ";"));
});

test("the AI DM's hosted turn is host-only, with its own allowance kept out of the players' counts", async () => {
  const edge = await read("supabase/functions/dnd-advise/index.ts");
  const dm = edge.slice(edge.indexOf("async function answerDm"));
  assert.ok(dm.indexOf("Only the DM can ask this.") < dm.indexOf("dnd_ai_usage"));
  assert.match(edge, /const AI_DM = -2;/);
  assert.match(dm, /const slot = mode === "run" \? AI_DM : -1;/);
  assert.match(dm, /character_index=eq\." \+ AI_DM\) >= AI_DM_TABLE_LIMIT/);
  // Players' table and daily counts leave AI DM turns out, in the edge function and in SQL.
  assert.equal((edge.match(/notAiDm\) >= (PLAYER_DAY_LIMIT|TABLE_LIMIT)/g) ?? []).length, 4);
  const sql = await read("supabase/migrations/0022_dnd_ai_dm_allowance.sql");
  assert.match(sql, /where user_id = uid and character_index <> -2 and created_at > now\(\) - interval '1 day'\) >= 60/);
  assert.match(sql, /where code = p_code and character_index <> -2\) >= 150/);
  assert.match(sql, /grant execute on function public\.dnd_advise_begin_v2\(text, int\) to authenticated;/);
});

test("the AI DM card finds a practice table from the stored flag, not just this phone or the opening update", async () => {
  const app = await read("src/app.js");
  assert.match(app, /return state\?\.practice === true \|\| storage\.get\("practice:" \+ room\) === "1"/);
  const check = app.slice(app.indexOf("function checkPractice()"));
  assert.match(check.slice(0, 600), /backend\.myRooms\(\)\.then\(rooms => \{\n    if \(!rooms\.find\(entry => entry\.code === room\)\?\.practice\) return;/);
  const sql = await read("supabase/migrations/0017_dnd_longer_idle.sql");
  assert.match(sql, /'practice', practice/);
});

test("the AI DM's autopilot never applies a missed attack, keeps posts sent while it thinks, and waits for open rulings", async () => {
  const app = await read("src/app.js");
  const step = app.slice(app.indexOf("function aiDmFightStep(now)"));
  // A ruling left on an enemy card stops every fight step before anything else.
  assert.ok(step.indexOf('.enemy-swing button:not(:disabled)') < step.indexOf("#hit-list li.hit-ask"));
  // Damage flagged "a miss?" is dismissed before any damage button is picked.
  const miss = step.indexOf("/— a miss\\?/.test(what)");
  assert.ok(miss > 0 && miss < step.indexOf('button.danger-soft:not(:disabled)'));
  // The turn's boundary is taken before the request, not after the sync.
  const turn = app.slice(app.indexOf("async function aiDmTurn("));
  assert.ok(turn.indexOf("const seen = maxActionId();") < turn.indexOf('backend.dmAsk(room, "run"'));
  assert.match(turn, /aiDmMark\(asked, seen\);/);
});

test("when Claude is the DM, the host's phone gets the player tools: roll requests, sharing rolls, the attack card", async () => {
  const app = await read("src/app.js");
  assert.match(app, /function playsHere\(\) \{ return !isHost \|\| aiDmEnabled\(\); \}/);
  assert.match(app, /const pending = !playsHere\(\) \|\| ended \|\| !state \? \[\] : pendingRollAsks\(me\);/);
  assert.match(app, /Array\.isArray\(state\?\.actions\) && playsHere\(\) && !ended && !onResult;/);
  assert.match(app, /form\.hidden = !combat \|\| !playsHere\(\) \|\| ended/);
  // Damage to another of the host's characters still queues its concentration save; Rage, Action Surge, slots and rests are there too.
  assert.match(app, /if \(previous && !previousCached && playsHere\(\)\) checkRemoteDamage\(previous, fresh\);/);
  assert.match(app, /const hasResources = playsHere\(\);/);
  assert.match(app, /box\.hidden = !items\.length \|\| !playsHere\(\);/);
  // DM-only tools stay host-only.
  assert.match(app, /tool\.hidden = !isHost \|\| ended \|\| !backend\.postAction/);
  assert.match(app, /if \(!isHost \|\| !combat \|\| !encounterLoaded\) \{ box\.hidden = true; return; \}/);
});

test("when Claude is the DM, every open roll request waits on the AI DM card and opens the dice tray on the check", async () => {
  const app = await read("src/app.js");
  const rolls = app.slice(app.indexOf("function drawAiDmRolls()"), app.indexOf("function drawRollAsks()"));
  assert.match(rolls, /isHost && aiDmEnabled\(\)/);
  assert.match(rolls, /pendingRollAsks\(index\)/);
  assert.match(rolls, /action\.id \+ ":" \+ action\.text/);
  assert.match(rolls, /showTab\("scene"\)/);
  assert.match(rolls, /\.roll-ask\[data-ask="' \+ action\.id \+ '"\] \.roll-ask-buttons button'\)\?\.click\(\)/);
  assert.match(app, /function drawRollAsks\(\) \{\n  drawAiDmRolls\(\);/);
});

test("the AI DM's autopilot waits for every roll still owed, not only the last turn's, and tidies Claude's text", async () => {
  const app = await read("src/app.js");
  const step = app.slice(app.indexOf("function aiDmStoryStep(now)"));
  assert.match(step.slice(0, 1200), /pendingRollAsks\(index\)\.filter\(\(\{ ask \}\) => ask\.kind !== "attack"\)/);
  assert.match(app, /turn\.hostNote = tidyModelText\(turn\.hostNote\);/);
  const css = await read("src/style.css");
  assert.match(css, /\.dm-ask-out,\.ai-dm-log,\.ai-dm-rolls,#scene,\.story-text\{overflow-wrap:anywhere\}/);
});

test("the AI DM narrates each new round of a fight, and a requested roll closes the dice tray once shared", async () => {
  const app = await read("src/app.js");
  const step = app.slice(app.indexOf("function aiDmFightStep(now)"));
  assert.match(step, /combat\.round > \(mark\.round \?\? 0\) && \(state\.actions \?\? \[\]\)\.some\(action => Number\(action\.id\) > mark\.after\)/);
  assert.match(step, /Narrate the round that just ended\./);
  assert.match(app, /if \(ask\) setTimeout\(\(\) => \{ if \(rollId === dice\.rollId\) closeDice\(\); \}, 1500\);/);
  const advice = await read("src/advice.js");
  assert.match(advice, /Narrate the round that just ended like a DM at the table/);
});

test("the DM tab has a shortcut row: a chip per card that's showing, which scrolls to it and opens it", async () => {
  const html = await read("src/index.html");
  const nav = html.slice(html.indexOf('<nav id="dm-jump"'), html.indexOf("</nav>", html.indexOf('<nav id="dm-jump"')));
  for (const id of ["ai-dm", "host", "roll-ask-tool", "party-hp", "encounter", "dm-assistant", "party-editor", "history-editor"]) {
    assert.match(nav, new RegExp('data-jump="' + id + '"'));
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  const app = await read("src/app.js");
  assert.match(app, /chip\.hidden = !target \|\| target\.hidden;/);
  assert.match(app, /if \(target\.tagName === "DETAILS"\) target\.open = true;/);
});
