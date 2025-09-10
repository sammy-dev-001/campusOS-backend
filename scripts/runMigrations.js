import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { dbPath } from '../../config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    // Open the database connection
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });

    // Create migrations table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        run_on TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get all migration files
    const migrationFiles = [
      { name: '001_initial_events_table.js', module: await import('../../migrations/001_initial_events_table.js') }
      // Add more migrations here as they are created
    ];

    // Run migrations that haven't been run yet
    for (const migration of migrationFiles) {
      const { name, module: migrationModule } = migration;
      
      // Check if migration has already been run
      const existing = await db.get('SELECT id FROM migrations WHERE name = ?', [name]);
      
      if (!existing) {
        console.log(`Running migration: ${name}`);
        
        try {
          // Run the migration
          await migrationModule.up(db);
          
          // Record the migration as complete
          await db.run('INSERT INTO migrations (name) VALUES (?)', [name]);
          console.log(`✓ ${name} completed successfully`);
        } catch (error) {
          console.error(`✗ Error running migration ${name}:`, error);
          throw error; // Stop on error
        }
      } else {
        console.log(`✓ ${name} already run, skipping`);
      }
    }

    console.log('All migrations completed successfully');
    await db.close();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
