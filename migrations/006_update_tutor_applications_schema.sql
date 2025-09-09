-- Ensure the tutor_applications table has the correct schema
BEGIN TRANSACTION;

-- Create a temporary table with the desired schema
CREATE TABLE IF NOT EXISTS tutor_applications_temp (
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

-- Copy data from the old table to the new one
INSERT INTO tutor_applications_temp 
  (id, name, department, course_subject, day_of_tutorial, email, phone, status, created_at, updated_at)
SELECT 
  id, 
  name, 
  department, 
  course_subject, 
  day_of_tutorial, 
  email, 
  phone, 
  COALESCE(status, 'pending'), 
  COALESCE(created_at, datetime('now')),
  updated_at
FROM tutor_applications;

-- Drop the old table
DROP TABLE tutor_applications;

-- Rename the new table
ALTER TABLE tutor_applications_temp RENAME TO tutor_applications;

-- Create trigger for updated_at
CREATE TRIGGER IF NOT EXISTS update_tutor_applications_updated_at
AFTER UPDATE ON tutor_applications
BEGIN
  UPDATE tutor_applications SET updated_at = datetime('now') WHERE id = NEW.id;
END;

COMMIT;

-- Verify the schema
PRAGMA table_info(tutor_applications);
