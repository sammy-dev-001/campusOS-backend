import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import bcrypt from 'bcryptjs';
import path from 'path';

const dbPath = path.join(process.cwd(), '..', 'database.db');

async function createSammyUser() {
  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE username = ? OR email = ?', 
      ['sammy', 'sammy@example.com']);

    if (existingUser) {
      console.log('User already exists:');
      console.log('ID:', existingUser.id);
      console.log('Username:', existingUser.username);
      console.log('Email:', existingUser.email);
      return;
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash('Samuel', saltRounds);

    // Insert new user
    const result = await db.run(
      'INSERT INTO users (username, display_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      ['sammy', 'Samuel', 'sammy@example.com', hashedPassword, 'user']
    );

    console.log('User created successfully!');
    console.log('User ID:', result.lastID);
    console.log('Username: sammy');
    console.log('Password: Samuel');
    console.log('Email: sammy@example.com');

    await db.close();
  } catch (error) {
    console.error('Error creating user:', error);
  }
}

createSammyUser();
