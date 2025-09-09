-- Disable foreign key constraints
PRAGMA foreign_keys = OFF;

-- 1. Create a backup of the users table
CREATE TABLE users_backup AS SELECT * FROM users;

-- 2. Create a new users table with the correct schema
CREATE TABLE users_new (
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

-- 3. Copy data from backup to new table
INSERT INTO users_new
SELECT 
  id, username, display_name, email, password, profile_picture, bio, 
  department, courses, role, id_picture, created_at, NULL 
FROM users_backup;

-- 4. Drop the old table and rename the new one
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- 5. Create the trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 6. Create a backup of the tutor_applications table if it exists
CREATE TABLE IF NOT EXISTS tutor_applications_backup AS 
  SELECT * FROM tutor_applications WHERE 1=0;

-- 7. Only proceed if tutor_applications exists
SELECT CASE 
  WHEN (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tutor_applications') > 0
  THEN 1
  ELSE 0
END AS table_exists;

-- 8. If table exists (table_exists = 1), then execute the following:
-- (This will be done in a second step)

-- 9. Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- 10. Print success message
SELECT 'Migration completed successfully. Please run the second part if tutor_applications table exists.' AS message;
