import { dbRun, dbGet } from './db.js';
import fs from 'fs';
import path from 'path';

async function runMigrations() {
  try {
    // Create migrations table if it doesn't exist
    await dbRun(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get all migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Sort to run migrations in order

    console.log(`Found ${files.length} migration files`);

    // Run each migration
    for (const file of files) {
      // Check if migration has already been run
      const migration = await dbGet('SELECT * FROM migrations WHERE name = ?', [file]);
      
      if (!migration) {
        console.log(`Running migration: ${file}`);
        
        // Read the SQL file
        const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        
        // Run the migration in a transaction
        await dbRun('BEGIN TRANSACTION');
        try {
          // Split by semicolon and execute each statement
          const statements = sql.split(';').filter(statement => statement.trim() !== '');
          for (const statement of statements) {
            if (statement.trim()) {
              await dbRun(statement);
            }
          }
          
          // Record the migration
          await dbRun('INSERT INTO migrations (name) VALUES (?)', [file]);
          await dbRun('COMMIT');
          
          console.log(`✅ Successfully applied migration: ${file}`);
        } catch (error) {
          await dbRun('ROLLBACK');
          console.error(`❌ Error applying migration ${file}:`, error.message);
          throw error;
        }
      } else {
        console.log(`✓ Migration already applied: ${file}`);
      }
    }

    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();
