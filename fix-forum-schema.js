import { dbRun, dbGet } from './db.js';

async function fixForumSchema() {
  try {
    console.log('Checking forum_threads table...');
    
    // Check if forum_threads table exists
    const tableExists = await dbGet(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='forum_threads'"
    );

    if (!tableExists) {
      console.log('Creating forum_threads table...');
      await dbRun(`
        CREATE TABLE IF NOT EXISTS forum_threads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          author_id INTEGER NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          views INTEGER DEFAULT 0,
          is_pinned BOOLEAN DEFAULT 0,
          is_locked BOOLEAN DEFAULT 0,
          FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);
      console.log('Created forum_threads table');
    } else {
      // Check if category column exists
      const categoryColumn = await dbGet(
        "PRAGMA table_info(forum_threads)"
      ).then(columns => 
        columns.some(col => col.name === 'category')
      );

      if (!categoryColumn) {
        console.log('Adding category column to forum_threads table...');
        await dbRun('ALTER TABLE forum_threads ADD COLUMN category TEXT');
        console.log('Added category column');
      }
    }

    console.log('Schema check/update complete');
    process.exit(0);
  } catch (error) {
    console.error('Error updating forum schema:', error);
    process.exit(1);
  }
}

fixForumSchema();
