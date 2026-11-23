-- Practice tables keep their own HP and resources (stored under a
-- "room:<code>:" prefix) instead of the campaign's.
ALTER TABLE rooms ADD COLUMN practice INTEGER NOT NULL DEFAULT 0;
