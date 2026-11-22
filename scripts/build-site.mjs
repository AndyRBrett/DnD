// Builds the static hosted site (GitHub Pages) into site/: the browser files
// with src/config.js pointing at Supabase. Every asset URL and module import
// gets ?v=<version> so phones load a new release immediately instead of
// reusing cached files (GitHub Pages lets browsers cache for 10 minutes).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = ["index.html", "app.js", "backend.js", "campaign.js", "config.js", "rules.js", "scene-options.js", "style.css"];
let version = process.env.GITHUB_SHA?.slice(0, 10);
if (!version) {
  try { version = execFileSync("git", ["rev-parse", "--short=10", "HEAD"], { encoding: "utf8" }).trim(); } catch {}
}
version ||= String(Date.now());

const stamp = text => text
  .replace(/((?:from|import)\s*\(?\s*["'])(\.\/[\w-]+\.js)(["'])/g, "$1$2?v=" + version + "$3")
  .replace(/((?:src|href)=")([\w-]+\.(?:js|css))(")/g, "$1$2?v=" + version + "$3");

await rm("site", { recursive: true, force: true });
await mkdir("site", { recursive: true });
await Promise.all(files.map(async name => writeFile("site/" + name, stamp(await readFile("src/" + name, "utf8")))));
await writeFile("site/.nojekyll", "");
await writeFile("site/version.txt", version + "\n");
console.log("Built site/ (" + files.length + " files, version " + version + ")");
