-- Last activity per table, so a table stays open until 8 hours after it and
-- deleting a scene can't expire it. Backfills from the latest scene.
ALTER TABLE rooms ADD COLUMN last_active INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE rooms SET last_active = MAX(created, COALESCE((SELECT MAX(scenes.created) FROM scenes WHERE scenes.code = rooms.code), 0));
