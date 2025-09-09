import sqlite3 from 'sqlite3';

const dbPath = path.join(process.cwd(), '..', 'database.db');

// Create a direct connection using sqlite3
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    return;
  }
  
  console.log('Successfully connected to the database');
  
  // List all tables
  db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
      console.error('Error listing tables:', err.message);
      return;
    }
    
    console.log('\nTables in database:');
    if (tables.length === 0) {
      console.log('No tables found!');
    } else {
      tables.forEach(table => {
        console.log(`- ${table.name}`);
      });
    }
    
    // Close the database connection
    db.close();
  });
});
