import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'database.db');

async function initializeDatabase() {
  console.log('Initializing database at:', dbPath);
  
  try {
    // Open or create the database file
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log('✅ Database connection established');

    // Enable foreign keys
    await db.run('PRAGMA foreign_keys = ON');

    // Create users table if it doesn't exist
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
    console.log('✅ Users table verified/created');

    // Check if test user exists
    const testUser = await db.get(
      'SELECT * FROM users WHERE username = ?', 
      ['sammy']
    );

    if (!testUser) {
      console.log('Creating test user...');
      const hashedPassword = await bcrypt.hash('Samuel', 10);
      
      await db.run(
        'INSERT INTO users (username, email, password, display_name, role) VALUES (?, ?, ?, ?, ?)',
        ['sammy', 'sammy@example.com', hashedPassword, 'Samuel', 'user']
      );
      
      console.log('✅ Test user created');
      console.log('   Username: sammy');
      console.log('   Password: Samuel');
    } else {
      console.log('ℹ️ Test user already exists');
    }

    // List all users
    const users = await db.all('SELECT id, username, email, role, created_at FROM users');
    console.log('\n📋 Current users in database:');
    console.table(users);

    await db.close();
    console.log('\n✅ Database initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
  }
}

// Run the initialization
initializeDatabase();
