// Builds the local/worker server: dist/server/index.js holds the browser assets
// as strings plus the worker, with src/campaign.js and src/advice.js inlined.
// The local server always runs without Supabase, so it serves a config.js that
// turns hosted mode off.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const unexport = source => source.replace(/^export (?=(?:const|function|async function|class) )/gm, "");

await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const assets = Object.fromEntries(await Promise.all(
  ["index.html", "app.js", "backend.js", "campaign.js", "rules.js", "scene-options.js", "style.css"].map(async name => [name, await readFile("src/" + name, "utf8")])
));
assets["config.js"] = "// Local server: no Supabase, rooms live in this server's SQLite.\nexport const SUPABASE = null;\n";
const shared = (await Promise.all(["campaign.js", "advice.js"].map(name => readFile("src/" + name, "utf8")))).map(unexport).join("\n");
const worker = await readFile("src/worker.js", "utf8");
await writeFile("dist/server/index.js", "const assets = " + JSON.stringify(assets) + ";\n" + shared + "\n" + worker);
try {
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
