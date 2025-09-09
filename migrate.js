import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { readFile, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    // Open the database
    const db = await open({
      filename: path.join(__dirname, '../database.db'),
      driver: sqlite3.Database
    });

    console.log('Connected to the database');

    // Read all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = (await readdir(migrationsDir))
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log('Found migrations:', files);

    // Create migrations table if it doesn't exist
    await db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get already executed migrations
    const executedMigrations = await db.all('SELECT name FROM migrations');
    const executedMigrationNames = new Set(executedMigrations.map(m => m.name));

    // Execute new migrations
    for (const file of files) {
      if (!executedMigrationNames.has(file)) {
        console.log(`Running migration: ${file}`);
        const migrationSQL = await readFile(path.join(migrationsDir, file), 'utf8');
        
        // Wrap in a transaction
        await db.exec('BEGIN TRANSACTION');
        try {
          await db.exec(migrationSQL);
          await db.run('INSERT INTO migrations (name) VALUES (?)', file);
          await db.exec('COMMIT');
          console.log(`Successfully applied migration: ${file}`);
        } catch (error) {
          await db.exec('ROLLBACK');
          console.error(`Error applying migration ${file}:`, error);
          process.exit(1);
        }
      } else {
        console.log(`Skipping already executed migration: ${file}`);
      }
    }

    console.log('All migrations completed successfully');
    await db.close();
  } catch (error) {
    console.error('Error running migrations:', error);
    process.exit(1);
  }
}

runMigrations();
