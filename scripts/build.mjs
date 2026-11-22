import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
const assets = Object.fromEntries(await Promise.all(
  ["index.html", "app.js", "scene-options.js", "style.css"].map(async name => [name, await readFile("src/" + name, "utf8")])
));
const worker = await readFile("src/worker.js", "utf8");
await writeFile("dist/server/index.js", "const assets = " + JSON.stringify(assets) + ";\n" + worker);
try {
  await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
