import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const dbPath = path.join(process.cwd(), '..', 'database.db');

async function checkUser() {
  console.log('Checking for user with username: sammy');
  
  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Check if users table exists
    const tableInfo = await db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    );
    
    if (!tableInfo) {
      console.log('Users table does not exist!');
      return;
    }
    
    // Check for user with username 'sammy'
    const user = await db.get('SELECT * FROM users WHERE username = ?', ['sammy']);
    
    if (user) {
      console.log('User found:');
      console.log('ID:', user.id);
      console.log('Username:', user.username);
      console.log('Email:', user.email);
      console.log('Password hash:', user.password ? '***' : 'No password set');
      console.log('Created at:', user.created_at);
    } else {
      console.log('User with username "sammy" not found.');
      
      // List all users in the database
      const allUsers = await db.all('SELECT id, username, email, created_at FROM users');
      console.log('\nAll users in the database:');
      console.table(allUsers);
    }
    
    await db.close();
  } catch (error) {
    console.error('Error accessing database:', error);
  }
}

checkUser();
