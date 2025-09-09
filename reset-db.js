const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs').promises;

async function resetDatabase() {
  const dbPath = path.join(__dirname, '..', 'database.db');
  
  try {
    // Delete existing database file
    try {
      await fs.unlink(dbPath);
      console.log('Removed existing database file');
    } catch (err) {
      console.log('No existing database file to remove');
    }

    // Create new database
    const db = new sqlite3.Database(dbPath);
    
    // Create users table
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          profile_picture TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => err ? reject(err) : resolve());
    });

    // Hash password for test user
    const hashedPassword = await bcrypt.hash('test123', 10);
    
    // Insert test user
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, display_name, email, password) VALUES (?, ?, ?, ?)',
        ['testuser', 'Test User', 'test@example.com', hashedPassword],
        (err) => err ? reject(err) : resolve()
      );
    });

    console.log('Database reset successfully!');
    console.log('Test user created:');
    console.log('Email: test@example.com');
    console.log('Password: test123');
    
    db.close();
  } catch (error) {
    console.error('Error resetting database:', error);
  }
}

resetDatabase();
