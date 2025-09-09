const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'database.db');
console.log('Checking database at:', dbPath);

// Check if database file exists
if (!fs.existsSync(dbPath)) {
  console.error('Error: Database file does not exist at', dbPath);
  console.log('Creating a new database file...');
  
  // Create an empty database file
  fs.writeFileSync(dbPath, '');
  console.log('Created new database file.');
}

// Try to open the database
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  
  console.log('Connected to the database');
  
  // List all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, tables) => {
    if (err) {
      console.error('Error listing tables:', err.message);
      return;
    }
    
    console.log('\n=== Tables in database ===');
    if (tables.length === 0) {
      console.log('No tables found in the database.');
      console.log('This might be a new database. You may need to run the database initialization.');
    } else {
      tables.forEach((table, index) => {
        console.log(`${index + 1}. ${table.name}`);
      });
    }
    
    // Check if chats table exists
    db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='chats'", [], (err, table) => {
      if (err) {
        console.error('Error checking for chats table:', err.message);
        return;
      }
      
      if (!table) {
        console.log('\nNo chats table found. The database might need to be initialized.');
      } else {
        console.log('\nChats table exists. Checking for study groups...');
        
        // Count study groups
        db.get("SELECT COUNT(*) as count FROM chats WHERE type = 'study_group'", [], (err, row) => {
          if (err) {
            console.error('Error counting study groups:', err.message);
            return;
          }
          
          const count = row ? row.count : 0;
          console.log(`Found ${count} study groups in the database.`);
          
          if (count > 0) {
            console.log('\nSample study groups:');
            db.all("SELECT id, name, code, created_at FROM chats WHERE type = 'study_group' LIMIT 5", [], (err, rows) => {
              if (err) {
                console.error('Error fetching study groups:', err.message);
                return;
              }
              
              console.table(rows);
            });
          }
        });
      }
    });
  });
});
