// Builds the local/worker server: dist/server/index.js holds the browser assets
// as strings plus the worker, with src/campaign.js and src/advice.js inlined.
// The local server always runs without Supabase, so it serves a config.js that
// turns hosted mode off.
import { copyFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";

const unexport = source => source.replace(/^export (?=(?:const|function|async function|class) )/gm, "");

await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const assets = Object.fromEntries(await Promise.all(
  ["index.html", "app.js", "backend.js", "campaign.js", "dice.js", "dice3d.js", "encounter.js", "rules.js", "scene-options.js", "style.css", "theme.js", "manifest.json", "sw.js"].map(async name => [name, await readFile("src/" + name, "utf8")])
));
assets["config.js"] = "// Local server: no Supabase, rooms live in this server's SQLite.\nexport const SUPABASE = null;\n";
const shared = (await Promise.all(["campaign.js", "advice.js"].map(name => readFile("src/" + name, "utf8")))).map(unexport).join("\n");
const worker = await readFile("src/worker.js", "utf8");
// The web fonts and home-screen icons (base64; the worker decodes them when served).
const binary = async (folder, extension) => (await readdir("src/" + folder)).filter(name => name.endsWith(extension))
  .map(async name => [folder + "/" + name, (await readFile("src/" + folder + "/" + name)).toString("base64")]);
const fonts = Object.fromEntries(await Promise.all([...await binary("fonts", ".woff2"), ...await binary("icons", ".png")]));
await writeFile("dist/server/index.js", "const assets = " + JSON.stringify(assets) + ";\nconst fonts = " + JSON.stringify(fonts) + ";\n" + shared + "\n" + worker);
try {
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
