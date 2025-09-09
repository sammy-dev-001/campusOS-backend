-- Disable foreign key constraints during migration
PRAGMA foreign_keys = OFF;

-- Add missing columns to users table if they don't exist
BEGIN TRANSACTION;

-- Add bio, department, courses, role, id_picture, updated_at if they don't exist
SELECT CASE 
    WHEN NOT EXISTS (SELECT 1 FROM pragma_table_info('users') WHERE name = 'bio') 
    THEN 'ALTER TABLE users ADD COLUMN bio TEXT;' 
    ELSE 'SELECT ''bio column exists'';' 
END;

-- Add other columns similarly...

-- Create or replace triggers
DROP TRIGGER IF EXISTS update_users_updated_at;
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Add similar triggers for other tables...

-- Update forum_threads table if needed
CREATE TABLE IF NOT EXISTS forum_threads_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id INTEGER NOT NULL,
    category TEXT DEFAULT 'general',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT,
    views INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT 0,
    is_locked BOOLEAN DEFAULT 0,
    FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Copy data from old table to new table if it exists
INSERT OR IGNORE INTO forum_threads_new 
SELECT * FROM forum_threads;

-- Drop old table and rename new one
DROP TABLE IF EXISTS forum_threads_old;
ALTER TABLE forum_threads RENAME TO forum_threads_old;
ALTER TABLE forum_threads_new RENAME TO forum_threads;

-- Create trigger for forum_threads
DROP TRIGGER IF EXISTS update_forum_threads_updated_at;
CREATE TRIGGER IF NOT EXISTS update_forum_threads_updated_at
AFTER UPDATE ON forum_threads
BEGIN
    UPDATE forum_threads SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Commit changes
COMMIT;

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Print success message
SELECT 'Database schema updated successfully' AS message;
