import bcrypt from 'bcryptjs';
import { dbRun, dbGet } from '../db.js';

async function createTestUser() {
  try {
    const username = 'testuser';
    const email = 'test@example.com';
    const password = 'test123';
    const hashedPassword = await bcrypt.hash(password, 10);

    // Check if user already exists
    const existingUser = await dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
    
    if (existingUser) {
      console.log('Test user already exists:', existingUser);
      return;
    }

    // Create test user
    await dbRun(
      'INSERT INTO users (username, display_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [username, 'Test User', email, hashedPassword, 'admin']
    );

    console.log('Test user created successfully!');
    console.log('Username:', username);
    console.log('Password:', password);
  } catch (error) {
    console.error('Error creating test user:', error);
  } finally {
    process.exit(0);
  }
}

createTestUser();
