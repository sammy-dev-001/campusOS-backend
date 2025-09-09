import { dbRun, dbGet } from '../db.js';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function setupDatabase() {
  try {
    console.log('Setting up database...');
    
    // Read the schema from create_fresh_db.sql
    const schemaPath = path.join(__dirname, '..', 'create_fresh_db.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute the schema
    const statements = schema.split(';').filter(statement => statement.trim() !== '');
    
    for (const statement of statements) {
      await dbRun(statement);
    }
    
    console.log('Database schema created successfully!');
    
    // Create a test user
    const username = 'testuser';
    const email = 'test@example.com';
    const password = 'test123';
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Check if user already exists
    const existingUser = await dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [username, email]);
    
    if (existingUser) {
      console.log('Test user already exists:');
      console.log(`Username: ${existingUser.username}`);
      console.log(`Email: ${existingUser.email}`);
      return;
    }
    
    // Create test user
    await dbRun(
      'INSERT INTO users (username, display_name, email, password, role) VALUES (?, ?, ?, ?, ?)',
      [username, 'Test User', email, hashedPassword, 'admin']
    );
    
    console.log('\nTest user created successfully!');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('Email:', email);
    
  } catch (error) {
    console.error('Error setting up database:', error);
  } finally {
    process.exit(0);
  }
}

setupDatabase();
