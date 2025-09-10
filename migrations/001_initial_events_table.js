import { dbRun } from '../config/db.js';

export async function up(db) {
  // Create events table
  await dbRun(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT,
    location TEXT,
    category TEXT,
    image_url TEXT,
    is_featured BOOLEAN DEFAULT 0,
    created_by INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )`);

  // Create event_attendees table
  await dbRun(`CREATE TABLE IF NOT EXISTS event_attendees (
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    status TEXT DEFAULT 'interested',
    registered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`);

  console.log('Created events and event_attendees tables');
}

export async function down(db) {
  await dbRun('DROP TABLE IF EXISTS event_attendees');
  await dbRun('DROP TABLE IF EXISTS events');
  console.log('Dropped events and event_attendees tables');
}
