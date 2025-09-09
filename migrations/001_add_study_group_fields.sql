-- Migration to add study group support to the chats table

-- First, create a new table with the updated schema
CREATE TABLE IF NOT EXISTS new_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('individual', 'group', 'study_group')),
  name TEXT,
  description TEXT,
  code TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  group_image TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Copy data from the old table to the new one
INSERT INTO new_chats (id, type, name, created_at, group_image, updated_at)
SELECT id, type, name, created_at, group_image, COALESCE(updated_at, created_at) FROM chats;

-- Drop the old table
DROP TABLE IF EXISTS old_chats;

-- Rename the new table to the original name
ALTER TABLE chats RENAME TO old_chats;
ALTER TABLE new_chats RENAME TO chats;

-- Recreate indexes and triggers if they existed
-- (Add any additional indexes or triggers that were on the original table)

-- Drop the old table (now that we've confirmed the migration worked)
-- DROP TABLE IF EXISTS old_chats;

-- Enable foreign key constraints
PRAGMA foreign_keys=on;

-- Verify the table structure
PRAGMA table_info(chats);
