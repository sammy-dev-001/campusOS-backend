-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_users_updated_at;
DROP TRIGGER IF EXISTS update_tutor_applications_updated_at;

-- Remove the updated_at columns
PRAGMA foreign_keys=off;

-- For users table
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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT NULL
);

-- Copy data from old table to new table
INSERT INTO users_new 
SELECT id, username, display_name, email, password, profile_picture, bio, 
       department, courses, role, id_picture, created_at, NULL 
FROM users;

-- Drop old table and rename new one
DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- For tutor_applications table
CREATE TABLE tutor_applications_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  department TEXT NOT NULL,
  course_subject TEXT NOT NULL,
  day_of_tutorial TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NULL
);

-- Copy data from old table to new table
INSERT INTO tutor_applications_new 
SELECT id, name, department, course_subject, day_of_tutorial, email, phone, 
       status, created_at, NULL 
FROM tutor_applications;

-- Drop old table and rename new one
DROP TABLE tutor_applications;
ALTER TABLE tutor_applications_new RENAME TO tutor_applications;

-- Re-enable foreign keys
PRAGMA foreign_keys=on;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER IF NOT EXISTS update_users_updated_at
AFTER UPDATE ON users
BEGIN
  UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_tutor_applications_updated_at
AFTER UPDATE ON tutor_applications
BEGIN
  UPDATE tutor_applications SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
