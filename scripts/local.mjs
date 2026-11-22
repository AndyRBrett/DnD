import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import worker from "../dist/server/index.js";

const sql = new DatabaseSync(process.env.TABLE_DB || ":memory:");
sql.exec("PRAGMA foreign_keys = ON;");
if (!sql.prepare("SELECT 1 FROM sqlite_master WHERE name = 'rooms'").get()) {
  sql.exec(readFileSync(new URL("../drizzle/0000_rooms.sql", import.meta.url), "utf8"));
}

function wrap(statement, bindings = []) {
  return {
    bind: (...values) => wrap(statement, values),
    all: () => ({ results: statement.all(...bindings) }),
    first: () => statement.get(...bindings),
    run: () => statement.run(...bindings)
  };
}

const DB = {
  prepare: query => wrap(sql.prepare(query)),
  batch(statements) {
    sql.exec("BEGIN");
    try {
      const results = statements.map(statement => statement.run());
      sql.exec("COMMIT");
      return results;
    } catch (error) {
      sql.exec("ROLLBACK");
      throw error;
    }
  }
};
const port = Number(process.env.PORT ?? process.argv[process.argv.indexOf("--port") + 1]) || 4173;
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
    const response = await worker.fetch(request, { DB });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500).end();
  }
});
server.listen(port, "0.0.0.0", () => {
  console.log("Host · http://localhost:" + port);
  for (const address of lanAddresses) {
    console.log("Players · http://" + address.address + ":" + port);
  }
});
