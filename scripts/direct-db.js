import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), '..', 'database.db');

async function checkDb() {
  console.log('Connecting to database at:', dbPath);
  
  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    console.log('Successfully connected to the database!');
    
    // List all tables
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    
    console.log('\nTables in the database:');
    console.table(tables);
    
    // Check if users table exists
    if (tables.some(t => t.name === 'users')) {
      console.log('\nUsers table exists!');
      
      // Count users
      const count = await db.get('SELECT COUNT(*) as count FROM users');
      console.log('Number of users:', count.count);
      
      // List users
      const users = await db.all('SELECT id, username, email, created_at FROM users');
      console.log('\nUsers:');
      console.table(users);
      
      if (users.length === 0) {
        console.log('No users found. Creating a test user...');
        const bcrypt = await import('bcryptjs');
        const hashedPassword = await bcrypt.default.hash('test123', 10);
        
        await db.run(
          'INSERT INTO users (username, display_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
          ['testuser', 'Test User', 'test@example.com', hashedPassword, 'admin']
        );
        
        console.log('Test user created successfully!');
      }
    } else {
      console.log('Users table does not exist. Creating schema...');
      // You can add schema creation here if needed
    }
    
    await db.close();
  } catch (error) {
    console.error('Error accessing database:', error);
  }
}

checkDb();
