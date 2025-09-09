const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { promisify } = require('util');

const dbPath = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath);

// Promisify sqlite3 methods
const dbRun = promisify(db.run.bind(db));
const dbAll = promisify(db.all.bind(db));
const dbGet = promisify(db.get.bind(db));

async function runMigration() {
  console.log('Opening database...');

  try {
    console.log('Checking database structure...');
    
    try {
      // Check if chats table exists
      const tableExists = await dbGet(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='chats'"
      );
      
      if (!tableExists) {
        console.log('Chats table does not exist. Creating it...');
        await dbRun(`
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
        `);
        console.log('Created new chats table with all required columns.');
        return;
      }
    
      // Check current table structure
      const rows = await dbAll('PRAGMA table_info(chats);');
      console.log('\n=== Current chats table structure ===');
      console.table(rows);
      
      // Check if we need to run the migration
      const hasDescription = rows.some(col => col.name === 'description');
      const hasCode = rows.some(col => col.name === 'code');
      const hasUpdatedAt = rows.some(col => col.name === 'updated_at');
      
      if (!hasDescription || !hasCode || !hasUpdatedAt) {
        console.log('\nRunning migration...');
        console.log('Adding missing columns to chats table...');
        
        // Add missing columns if they don't exist
        if (!hasDescription) {
          console.log('Adding description column...');
          await dbRun('ALTER TABLE chats ADD COLUMN description TEXT');
        }
        
          if (!hasCode) {
          console.log('Adding code column...');
          await dbRun('ALTER TABLE chats ADD COLUMN code TEXT');
        }
        
        if (!hasUpdatedAt) {
          console.log('Adding updated_at column...');
          await dbRun('ALTER TABLE chats ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
        }
      
        // Update the type constraint if needed
        console.log('Updating type constraint if needed...');
        await dbRun(`
          PRAGMA foreign_keys=off;
          BEGIN TRANSACTION;
          
          -- Create new table with updated schema
          CREATE TABLE IF NOT EXISTS new_chats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK (type IN ('individual', 'group', 'study_group')),
            name TEXT,
            description TEXT,
            code TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            group_image TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
          
          -- Copy data from old table
          INSERT INTO new_chats SELECT * FROM chats;
          
          -- Drop old table and rename new one
          DROP TABLE chats;
          ALTER TABLE new_chats RENAME TO chats;
          
          COMMIT;
          PRAGMA foreign_keys=on;
        `);
        
        console.log('Migration completed successfully!');
        
        // Show the new structure
        const newRows = await dbAll('PRAGMA table_info(chats);');
        console.log('\n=== New chats table structure ===');
        console.table(newRows);
      } else {
        console.log('\nDatabase is up to date. No migration needed.');
      }
    } catch (error) {
      // Log error and rethrow
      console.error('Error during migration:', error);
      throw error;
    } finally {
      // Close the database connection
      return new Promise((resolve) => {
        db.close((err) => {
          if (err) console.error('Error closing database:', err);
          resolve();
        });
      });
    }
  } catch (error) {
    console.error('An error occurred during database initialization:', error);
    throw error; // Re-throw the error to be caught by the outer catch
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('Migration process completed');
  })
  .catch(err => {
    console.error('Migration failed:', err);
  })
  .finally(() => {
    process.exit(0);
  });
