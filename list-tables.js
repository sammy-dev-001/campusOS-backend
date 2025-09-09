const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking database at:', dbPath);

// List all tables
db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'", [], (err, tables) => {
  if (err) {
    console.error('Error listing tables:', err);
    return;
  }

  console.log('\n=== Tables in database ===');
  tables.forEach((table, index) => {
    console.log(`${index + 1}. ${table.name}`);
  });

  // For each table, show schema and row count
  tables.forEach(table => {
    db.get(`SELECT COUNT(*) as count FROM ${table.name}`, (err, row) => {
      if (err) {
        console.error(`Error getting row count for ${table.name}:`, err);
        return;
      }
      console.log(`\nTable: ${table.name} (${row?.count || 0} rows)`);
      
      // Get table schema
      db.all(`PRAGMA table_info(${table.name})`, (err, columns) => {
        if (err) {
          console.error(`Error getting schema for ${table.name}:`, err);
          return;
        }
        console.log('Columns:');
        console.table(columns);
        
        // Show first few rows if table is not empty
        if (row?.count > 0) {
          db.all(`SELECT * FROM ${table.name} LIMIT 5`, (err, rows) => {
            if (err) {
              console.error(`Error getting data from ${table.name}:`, err);
              return;
            }
            console.log(`First ${Math.min(5, rows.length)} rows:`);
            console.table(rows);
          });
        }
      });
    });
  });
});
