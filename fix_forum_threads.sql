-- First, create the forum_threads table if it doesn't exist
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

-- Add category column if it doesn't exist
PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

-- Check if category column exists
SELECT 1 FROM pragma_table_info('forum_threads') WHERE name = 'category';

-- If the above returns no rows, add the column
INSERT INTO pragma_table_info('forum_threads') 
SELECT 'category', 'TEXT', 0, '', 0, 0
WHERE NOT EXISTS (
  SELECT 1 FROM pragma_table_info('forum_threads') 
  WHERE name = 'category'
);

COMMIT;
PRAGMA foreign_keys=on;
