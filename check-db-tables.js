const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
console.log('Database path:', dbPath);

// Check if database file exists
const fs = require('fs');
if (!fs.existsSync(dbPath)) {
  console.error('Error: Database file does not exist at', dbPath);
  process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    return;
  }
  console.log('Connected to the database');
  
  // List all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, tables) => {
    if (err) {
      console.error('Error listing tables:', err);
      return;
    }

    console.log('\n=== Tables in database ===');
    if (tables.length === 0) {
      console.log('No tables found in the database');
      return;
    }

    tables.forEach((table, index) => {
      console.log(`${index + 1}. ${table.name}`);
      
      // Get row count for this table
      db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
        if (err) {
          console.error(`  Error getting row count: ${err.message}`);
          return;
        }
        console.log(`  Rows: ${row.count}`);
        
        // Show first few rows if table is not empty
        if (row.count > 0) {
          db.all(`SELECT * FROM ${table.name} LIMIT 3`, (err, rows) => {
            if (err) {
              console.error(`  Error getting sample data: ${err.message}`);
              return;
            }
            console.log('  Sample data:');
            console.table(rows);
          });
        }
      });
    });
  });
});
