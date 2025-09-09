-- Create a fresh database with the correct schema

-- Drop existing tables if they exist
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS forum_threads;
DROP TABLE IF EXISTS forum_comments;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS polls;
DROP TABLE IF EXISTS poll_options;
DROP TABLE IF EXISTS poll_votes;
DROP TABLE IF EXISTS tutor_applications;

-- Create users table
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  profile_picture TEXT,
  bio TEXT,
  department TEXT,
  courses TEXT,
  role TEXT DEFAULT 'student',
  id_picture TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

-- Create trigger for users.updated_at
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Create other tables...
-- (Add other table creation statements here as needed)

-- Create forum_threads table
CREATE TABLE IF NOT EXISTS forum_threads (
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

-- Create trigger for forum_threads.updated_at
CREATE TRIGGER IF NOT EXISTS update_forum_threads_updated_at
AFTER UPDATE ON forum_threads
BEGIN
  UPDATE forum_threads SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Create other necessary tables...

-- Create tutor_applications table
CREATE TABLE IF NOT EXISTS tutor_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  course_subject TEXT NOT NULL,
  day_of_tutorial TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

-- Create trigger for tutor_applications.updated_at
CREATE TRIGGER IF NOT EXISTS update_tutor_applications_updated_at
AFTER UPDATE ON tutor_applications
BEGIN
  UPDATE tutor_applications SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Print success message
SELECT 'Database created successfully with fresh schema';
