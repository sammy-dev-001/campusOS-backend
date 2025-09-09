-- This script handles the tutor_applications table
-- Only run this if the first part completed successfully

-- Disable foreign key constraints
PRAGMA foreign_keys = OFF;

-- 1. Backup the tutor_applications table if it exists
CREATE TABLE tutor_applications_backup AS 
  SELECT * FROM tutor_applications;

-- 2. Create new tutor_applications table with correct schema
CREATE TABLE tutor_applications_new (
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

-- 3. Copy data from backup to new table
INSERT INTO tutor_applications_new
SELECT 
  id, name, department, course_subject, day_of_tutorial, 
  email, phone, status, created_at, NULL 
FROM tutor_applications_backup;

-- 4. Drop the old table and rename the new one
DROP TABLE IF EXISTS tutor_applications;
ALTER TABLE tutor_applications_new RENAME TO tutor_applications;

-- 5. Create the trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_tutor_applications_updated_at
AFTER UPDATE ON tutor_applications
BEGIN
  UPDATE tutor_applications SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 6. Clean up backups
-- DROP TABLE IF EXISTS tutor_applications_backup;
-- DROP TABLE IF EXISTS users_backup;

-- 7. Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

-- 8. Print success message
SELECT 'Second part of migration completed successfully.' AS message;
