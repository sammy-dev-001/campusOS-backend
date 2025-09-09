-- Migration to create forum_threads table

-- Create forum_threads table
CREATE TABLE IF NOT EXISTS forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  author_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  views INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT 0,
  is_locked BOOLEAN DEFAULT 0,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category);
CREATE INDEX IF NOT EXISTS idx_forum_threads_author ON forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_created ON forum_threads(created_at);

-- Add some default categories if they don't exist in categories table
CREATE TABLE IF NOT EXISTS forum_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT 1
);

-- Insert default categories if they don't exist
INSERT OR IGNORE INTO forum_categories (name, description) VALUES 
  ('academics', 'Discussions about courses, assignments, and academic matters'),
  ('rants', 'A place to share your thoughts and opinions'),
  ('gist', 'General discussions and chit-chat'),
  ('events', 'Upcoming events and activities');

-- Update the forum_threads table to include a foreign key to categories
PRAGMA foreign_keys=off;

-- Create a new table with the foreign key
CREATE TABLE IF NOT EXISTS new_forum_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL,
  category_id INTEGER,
  author_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  views INTEGER DEFAULT 0,
  is_pinned BOOLEAN DEFAULT 0,
  is_locked BOOLEAN DEFAULT 0,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES forum_categories(id) ON DELETE SET NULL
);

-- Copy data from old table to new table
INSERT INTO new_forum_threads 
SELECT id, title, content, category, NULL, author_id, created_at, updated_at, views, is_pinned, is_locked 
FROM forum_threads;

-- Drop the old table and rename the new one
DROP TABLE IF EXISTS forum_threads;
ALTER TABLE new_forum_threads RENAME TO forum_threads;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_forum_threads_category ON forum_threads(category);
CREATE INDEX IF NOT EXISTS idx_forum_threads_author ON forum_threads(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_threads_created ON forum_threads(created_at);
CREATE INDEX IF NOT EXISTS idx_forum_threads_category_id ON forum_threads(category_id);

PRAGMA foreign_keys=on;

-- Verify the table structure
PRAGMA table_info(forum_threads);
PRAGMA table_info(forum_categories);
