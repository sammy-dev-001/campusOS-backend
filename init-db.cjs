const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Path to the database file
const dbPath = path.join(__dirname, 'database.db');
console.log('Initializing database at:', dbPath);

// Create a new database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err.message);
    process.exit(1);
  }
  
  console.log('✅ Successfully connected to the database');
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
  // Create users table if it doesn't exist
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT,
      role TEXT DEFAULT 'user',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, function(err) {
    if (err) {
      console.error('❌ Error creating users table:', err.message);
      return;
    }
    console.log('✅ Users table verified/created');
    
    // Check if test user exists
    db.get('SELECT * FROM users WHERE username = ?', ['sammy'], (err, user) => {
      if (err) {
        console.error('❌ Error checking for test user:', err.message);
        return;
      }
      
      if (user) {
        console.log('ℹ️ Test user already exists:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Username: ${user.username}`);
        console.log(`   Email: ${user.email}`);
        listAllUsers();
      } else {
        console.log('Creating test user...');
        
        // Hash the password
        bcrypt.hash('Samuel', 10, (hashErr, hashedPassword) => {
          if (hashErr) {
            console.error('❌ Error hashing password:', hashErr.message);
            return;
          }
          
          db.run(
            'INSERT INTO users (username, email, password, display_name, role) VALUES (?, ?, ?, ?, ?)',
            ['sammy', 'sammy@example.com', hashedPassword, 'Samuel', 'user'],
            function(err) {
              if (err) {
                console.error('❌ Error creating test user:', err.message);
                return;
              }
              console.log('✅ Test user created successfully!');
              console.log('   User ID:', this.lastID);
              console.log('   Username: sammy');
              console.log('   Password: Samuel');
              listAllUsers();
            }
          );
        });
      }
    });
  });
});

function listAllUsers() {
  db.all('SELECT id, username, email, role, created_at FROM users', [], (err, users) => {
    if (err) {
      console.error('❌ Error listing users:', err.message);
      return;
    }
    
    console.log('\n📋 Current users in database:');
    if (users.length === 0) {
      console.log('No users found!');
    } else {
      console.table(users);
    }
    
    // Close the database connection
    db.close((err) => {
      if (err) {
        console.error('❌ Error closing database:', err.message);
      } else {
        console.log('\n✅ Database initialization complete!');
      }
      process.exit(0);
    });
  });
}
