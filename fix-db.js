const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, 'database.db');
console.log(`Opening database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    process.exit(1);
  }
  console.log('Connected to the database');
  
  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');
  
  // Check if chats table exists
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chats'", [], (err, row) => {
    if (err) {
      console.error('Error checking for chats table:', err);
      return db.close();
    }
    
    if (!row) {
      console.log('Chats table does not exist. Creating it...');
      createNewTable();
    } else {
      console.log('Chats table exists. Checking schema...');
      checkAndUpdateSchema();
    }
  });
});

function createNewTable() {
  const sql = `
    CREATE TABLE chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('individual', 'group', 'study_group')),
      name TEXT,
      description TEXT,
      code TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      group_image TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  
  db.run(sql, (err) => {
    if (err) {
      console.error('Error creating chats table:', err);
    } else {
      console.log('Successfully created new chats table with all required columns.');
    }
    db.close();
  });
}

function checkAndUpdateSchema() {
  // Check which columns exist
  db.all("PRAGMA table_info(chats)", [], (err, columns) => {
    if (err) {
      console.error('Error getting table info:', err);
      return db.close();
    }
    
    console.log('Current columns:', columns.map(c => c.name));
    
    const columnNames = columns.map(c => c.name);
    const missingColumns = [];
    
    if (!columnNames.includes('description')) missingColumns.push('description TEXT');
    if (!columnNames.includes('code')) missingColumns.push('code TEXT');
    if (!columnNames.includes('updated_at')) missingColumns.push('updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    
    if (missingColumns.length === 0) {
      console.log('Database schema is up to date.');
      return db.close();
    }
    
    console.log('Adding missing columns:', missingColumns);
    
    // Add missing columns one by one
    let completed = 0;
    
    function checkDone() {
      completed++;
      if (completed >= missingColumns.length) {
        console.log('Successfully updated database schema.');
        db.close();
      }
    }
    
    missingColumns.forEach(column => {
      const columnName = column.split(' ')[0];
      console.log(`Adding column: ${columnName}`);
      
      db.run(`ALTER TABLE chats ADD COLUMN ${column}`, (err) => {
        if (err) {
          console.error(`Error adding column ${columnName}:`, err);
        } else {
          console.log(`Successfully added column ${columnName}`);
        }
        checkDone();
      });
    });
  });
}
