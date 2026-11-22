// Builds the static hosted site (GitHub Pages) into site/: the browser files
// as they are, with src/config.js pointing at Supabase.
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";

const files = ["index.html", "app.js", "backend.js", "campaign.js", "config.js", "rules.js", "scene-options.js", "style.css"];
await rm("site", { recursive: true, force: true });
await mkdir("site", { recursive: true });
await Promise.all(files.map(name => copyFile("src/" + name, "site/" + name)));
await writeFile("site/.nojekyll", "");
console.log("Built site/ (" + files.length + " files)");
