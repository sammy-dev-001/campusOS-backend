import { fileURLToPath } from 'url';
import path from 'path';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function initializeDatabase() {
  try {
    const dbPath = path.join(__dirname, '..', 'database.db');
    
    // Delete the existing database file if it exists
    try {
      const fs = await import('fs/promises');
      await fs.unlink(dbPath).catch(() => {});
    } catch (err) {
      // Ignore if file doesn't exist
    }

    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Enable foreign key constraints
    await db.run('PRAGMA foreign_keys = ON');

    // Create users table
    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        profile_picture TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create forum_threads table
    await db.run(`
      CREATE TABLE IF NOT EXISTS forum_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        upvotes INTEGER DEFAULT 0,
        FOREIGN KEY (author_id) REFERENCES users (id)
      )
    `);

    // Create forum_comments table
    await db.run(`
      CREATE TABLE IF NOT EXISTS forum_comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        thread_id INTEGER NOT NULL,
        parent_comment_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users (id),
        FOREIGN KEY (thread_id) REFERENCES forum_threads (id) ON DELETE CASCADE,
        FOREIGN KEY (parent_comment_id) REFERENCES forum_comments (id) ON DELETE CASCADE
      )
    `);

    // Create announcements table
    await db.run(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        author_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        likedBy TEXT DEFAULT '[]',
        FOREIGN KEY (author_id) REFERENCES users (id)
      )
    `);

    console.log('Database initialized successfully');
    await db.close();
  } catch (error) {
    console.error('Error initializing database:', error);
    process.exit(1);
  }
}

initializeDatabase();
