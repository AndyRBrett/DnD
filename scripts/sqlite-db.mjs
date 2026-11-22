// Wraps node:sqlite in the small prepare/bind/batch interface that src/worker.js
// expects from its DB binding, so the same worker runs locally and in tests.
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

export function openDatabase(file = ":memory:") {
  const sql = new DatabaseSync(file);
  sql.exec("PRAGMA foreign_keys = ON;");
  if (!sql.prepare("SELECT 1 FROM sqlite_master WHERE name = 'rooms'").get()) {
    sql.exec(readFileSync(new URL("../drizzle/0000_rooms.sql", import.meta.url), "utf8"));
  }
  sql.exec(readFileSync(new URL("../drizzle/0001_combat.sql", import.meta.url), "utf8"));
  sql.exec(readFileSync(new URL("../drizzle/0002_party_hp.sql", import.meta.url), "utf8"));

  function wrap(statement, bindings = []) {
    return {
      bind: (...values) => wrap(statement, values),
      all: () => ({ results: statement.all(...bindings) }),
      first: () => statement.get(...bindings),
      run: () => statement.run(...bindings)
    };
  }

  return {
    sql,
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
}
