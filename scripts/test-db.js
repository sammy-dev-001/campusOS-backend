import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), '..', 'database.db');

async function testDb() {
  console.log('Testing database connection to:', dbPath);
  
  try {
    // Open database connection
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    console.log('✅ Successfully connected to the database!');

    // List all tables
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table'"
    );
    
    console.log('\nTables in database:');
    console.table(tables);

    // Check if users table exists
    const usersTable = tables.some(t => t.name === 'users');
    
    if (usersTable) {
      console.log('\n✅ Users table exists!');
      
      // Get all users
      const users = await db.all('SELECT * FROM users');
      console.log('\nUsers in database:');
      console.table(users);
    } else {
      console.log('\n❌ Users table does not exist!');
    }

    await db.close();
  } catch (error) {
    console.error('❌ Error accessing database:', error.message);
  }
}

testDb();
