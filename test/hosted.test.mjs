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
