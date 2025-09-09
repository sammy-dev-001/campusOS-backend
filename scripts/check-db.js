import { dbAll } from '../db.js';

async function checkDatabase() {
  try {
    // Check if the database is connected by querying the sqlite_master table
    const tables = await dbAll(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    
    console.log('Database connection successful!');
    console.log('\nTables in the database:');
    console.table(tables);
    
    if (tables.some(t => t.name === 'users')) {
      const users = await dbAll('SELECT id, username, email, created_at FROM users');
      console.log('\nUsers in the database:');
      console.table(users);
    } else {
      console.log('\nNo users table found in the database.');
    }
  } catch (error) {
    console.error('Error checking database:', error);
  } finally {
    process.exit(0);
  }
}

checkDatabase();
