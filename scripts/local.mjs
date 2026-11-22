import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import worker from "../dist/server/index.js";
import { openDatabase } from "./sqlite-db.mjs";

const flag = name => {
  const index = process.argv.indexOf(name);
  return index > 0 ? process.argv[index + 1] : undefined;
};
// In-memory by default. `--db table.sqlite` (npm run table) keeps rooms across
// a restart of this server; rooms still expire eight hours after creation.
const dbFile = flag("--db") || process.env.TABLE_DB || ":memory:";
const DB = openDatabase(dbFile);
DB.sql.prepare("DELETE FROM rooms WHERE created < ?").run(Date.now() - 8 * 60 * 60 * 1000);
const env = { DB, ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || "" };
const port = Number(process.env.PORT ?? flag("--port")) || 4173;
let lanAddresses = [];
try {
  lanAddresses = Object.values(networkInterfaces()).flat()
    .filter(address => address.family === "IPv4" && !address.internal);
} catch (error) {
  if (error.code !== "ERR_SYSTEM_ERROR") throw error;
}
const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === "/api/local-player-origin") {
      const origin = lanAddresses[0] ? "http://" + lanAddresses[0].address + ":" + port : "";
      outgoing.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ origin }));
      return;
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > 32768) {
        outgoing.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request("http://localhost" + incoming.url, {
      method: incoming.method, headers: incoming.headers, body
    });
    const response = await worker.fetch(request, env);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
});
server.listen(port, "0.0.0.0", () => {
  console.log("Host · http://localhost:" + port);
  console.log("Claude suggestions · " + (env.ANTHROPIC_API_KEY ? "on (players can tap Ask Claude)" : "off (add ANTHROPIC_API_KEY to .env to enable)"));
  console.log("Storage · " + (dbFile === ":memory:" ? "in memory (cleared when this stops)" : dbFile));
  for (const address of lanAddresses) {
    console.log("Players · http://" + address.address + ":" + port);
  }
});
