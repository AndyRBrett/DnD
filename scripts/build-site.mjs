// Builds the static hosted site (GitHub Pages) into site/: the browser files
// with src/config.js pointing at Supabase. Every asset URL and module import
// gets ?v=<version> so phones load a new release immediately instead of
// reusing cached files (GitHub Pages lets browsers cache for 10 minutes).
import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const files = ["index.html", "app.js", "backend.js", "campaign.js", "config.js", "dice.js", "dice3d.js", "encounter.js", "rules.js", "scene-options.js", "style.css", "theme.js"];
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
await cp("src/fonts", "site/fonts", { recursive: true });
await cp("src/icons", "site/icons", { recursive: true });
await writeFile("site/manifest.json", await readFile("src/manifest.json", "utf8"));
// The service worker's cache is named after the release, so each deploy
// replaces the saved copy.
// It precaches the shell at the same ?v= URLs the page requests.
const shell = ["./", "index.html", ...files.filter(name => /\.(js|css)$/.test(name)).map(name => name + "?v=" + version), "manifest.json", "icons/icon-192.png",
  ...(await readdir("src/fonts")).filter(name => name.endsWith(".woff2")).map(name => "fonts/" + name)];
const sw = (await readFile("src/sw.js", "utf8"))
  .replace('const VERSION = "local";', "const VERSION = " + JSON.stringify(version) + ";")
  .replace(/^const SHELL = \[.*\];$/m, "const SHELL = " + JSON.stringify(shell) + ";");
if (!sw.includes("?v=" + version)) throw new Error("sw.js: could not stamp the shell list");
await writeFile("site/sw.js", sw);
await writeFile("site/.nojekyll", "");
await writeFile("site/version.txt", version + "\n");
console.log("Built site/ (" + files.length + " files, version " + version + ")");
