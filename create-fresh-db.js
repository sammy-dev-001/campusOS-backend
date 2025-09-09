import sqlite3 from 'sqlite';
import { open } from 'sqlite';
import path from 'path';

async function createFreshDatabase() {
  try {
    const dbPath = path.join(process.cwd(), 'database.db');
    console.log('Creating fresh database at:', dbPath);

    // Delete existing database if it exists
    const fs = await import('fs');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
      console.log('Removed existing database file');
    }

    // Create new database
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Create tables with correct schema
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
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

      CREATE TRIGGER IF NOT EXISTS update_users_updated_at
      AFTER UPDATE ON users
      BEGIN
        UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id;
      END;

      -- Add other tables with their schemas as needed
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

      CREATE TRIGGER IF NOT EXISTS update_forum_threads_updated_at
      AFTER UPDATE ON forum_threads
      BEGIN
        UPDATE forum_threads SET updated_at = datetime('now') WHERE id = NEW.id;
      END;
    `);

    console.log('Database created successfully with fresh schema');
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Error creating fresh database:', error);
    process.exit(1);
  }
}

createFreshDatabase();
