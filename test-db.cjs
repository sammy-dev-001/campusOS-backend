const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Path to the database file
const dbPath = path.join(process.cwd(), 'database.db');
console.log('Testing database at:', dbPath);

// Check if file exists
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.log('❌ Database file does not exist at:', dbPath);
  console.log('Current working directory:', process.cwd());
  console.log('Directory contents:', fs.readdirSync(process.cwd()));
  process.exit(1);
}

// Try to open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    return;
  }
  
  console.log('✅ Successfully connected to the database');
  
  // List all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('❌ Error listing tables:', err.message);
      return;
    }
    
    console.log('\nTables in database:');
    if (tables.length === 0) {
      console.log('No tables found!');
    } else {
      tables.forEach(table => {
        console.log(`- ${table.name}`);
      });
      
      // If users table exists, list all users
      if (tables.some(t => t.name === 'users')) {
        db.all('SELECT * FROM users', [], (err, users) => {
          if (err) {
            console.error('❌ Error querying users:', err.message);
            return;
          }
          
          console.log('\nUsers in database:');
          if (users.length === 0) {
            console.log('No users found!');
          } else {
            users.forEach(user => {
              console.log(`- ID: ${user.id}, Username: ${user.username}, Email: ${user.email}`);
            });
          }
          
          // Close the database connection
          db.close();
        });
      } else {
        // Close the database connection if no users table
        db.close();
      }
    }
  });
});
