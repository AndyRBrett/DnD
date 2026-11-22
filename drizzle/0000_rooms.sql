CREATE TABLE rooms (
  code TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  created INTEGER NOT NULL,
  party TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE scenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX scenes_room_id ON scenes(code, id);
