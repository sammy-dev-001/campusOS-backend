import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', '..', 'database.db');

async function ensureSammyUser() {
  let db;
  try {
    console.log('Connecting to database at:', dbPath);
    
    // Open database connection
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Begin transaction
    await db.run('BEGIN TRANSACTION');

    // Check if users table exists
    const tableExists = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );

    if (!tableExists) {
      console.log('Creating users table...');
      await db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          display_name TEXT,
          role TEXT DEFAULT 'user',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    // Check if user exists
    const existingUser = await db.get(
      'SELECT * FROM users WHERE username = ?', 
      ['sammy']
    );

    if (existingUser) {
      console.log('\nUser already exists:');
      console.log('ID:', existingUser.id);
      console.log('Username:', existingUser.username);
      console.log('Email:', existingUser.email);
      return;
    }

    // Create new user
    console.log('\nCreating new user...');
    const hashedPassword = await bcrypt.hash('Samuel', 10);
    
    const result = await db.run(
      'INSERT INTO users (username, email, password, display_name, role) VALUES (?, ?, ?, ?, ?)',
      ['sammy', 'sammy@example.com', hashedPassword, 'Samuel', 'user']
    );

    console.log('✅ User created successfully!');
    console.log('User ID:', result.lastID);
    console.log('Username: sammy');
    console.log('Password: Samuel');
    
    // Commit transaction
    await db.run('COMMIT');

  } catch (error) {
    // Rollback transaction on error
    if (db) await db.run('ROLLBACK');
    console.error('❌ Error:', error.message);
  } finally {
    // Close database connection
    if (db) await db.close();
  }
}

// Run the function
ensureSammyUser();
