const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Open the database
const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Function to add a column if it doesn't exist
function addColumn(columnName, columnType) {
  return new Promise((resolve, reject) => {
    const checkSql = `SELECT name FROM pragma_table_info('chats') WHERE name = ?`;
    
    db.get(checkSql, [columnName], (err, row) => {
      if (err) return reject(err);
      
      if (!row) {
        // Column doesn't exist, add it
        const alterSql = `ALTER TABLE chats ADD COLUMN ${columnName} ${columnType}`;
        db.run(alterSql, (err) => {
          if (err) return reject(err);
          console.log(`Added column: ${columnName}`);
          resolve();
        });
      } else {
        console.log(`Column already exists: ${columnName}`);
        resolve();
      }
    });
  });
}

// Add all missing columns
async function updateSchema() {
  try {
    await addColumn('description', 'TEXT');
    await addColumn('code', 'TEXT');
    await addColumn('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    
    // Update the type constraint if needed
    const checkType = `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chats'`;
    db.get(checkType, (err, row) => {
      if (err) throw err;
      
      if (row && !row.sql.includes("CHECK (type IN ('individual', 'group', 'study_group')")) {
        console.log('Updating type constraint...');
        // This would require a more complex migration to recreate the table
        console.log('Note: To update the type constraint, you need to recreate the table.');
        console.log('Please backup your data and run the migration script in migrations/001_add_study_group_fields.sql');
      } else {
        console.log('Type constraint is up to date.');
      }
      
      db.close();
      console.log('Database schema update complete!');
    });
  } catch (err) {
    console.error('Error updating schema:', err);
    db.close();
  }
}

// Run the update
updateSchema();
